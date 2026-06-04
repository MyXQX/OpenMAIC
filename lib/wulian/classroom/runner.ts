import { createLogger } from '@/lib/logger';
import { generateClassroom } from '@/lib/server/classroom-generation';
import {
  markClassroomGenerationJobFailed,
  markClassroomGenerationJobRunning,
  markClassroomGenerationJobSucceeded,
  updateClassroomGenerationJobProgress,
} from '@/lib/server/classroom-job-store';
import { saveClassroomInstance } from '@/lib/wulian/storage';
import type { WulianClassroomInstance, WulianPersonalizationInput } from '@/lib/wulian/types';
import { buildGenerationRequirements } from '@/lib/wulian/personalize/build-requirements';

const log = createLogger('WulianClassroomJob');
const runningWulianJobs = new Map<string, Promise<void>>();

export function runWulianClassroomGenerationJob(
  jobId: string,
  personalizationInput: WulianPersonalizationInput,
  userId: string,
  baseUrl: string
): Promise<void> {
  const existing = runningWulianJobs.get(jobId);
  if (existing) {
    return existing;
  }

  const jobPromise = (async () => {
    try {
      await markClassroomGenerationJobRunning(jobId);

      // 1. Build generation requirements and retrieved RAG context
      const { requirements, pdfContent } = await buildGenerationRequirements(personalizationInput, userId);

      // 2. Run standard MAIC generation pipeline
      const result = await generateClassroom(
        {
          requirement: requirements.requirement,
          pdfContent,
          enableWebSearch: false, // Wulian disables web search to rely strictly on textbook and notes
          enableImageGeneration: false, // Turn off for speed/determinism unless configured otherwise
          enableVideoGeneration: false,
          enableTTS: false, // Done via Edge-TTS on-the-fly when playback is running (if enabled)
          agentMode: 'default', // Map agents in orchestration layer
        },
        {
          baseUrl,
          onProgress: async (progress) => {
            await updateClassroomGenerationJobProgress(jobId, progress);
          },
        }
      );

      // 3. Construct Wulian classroom instance
      const instance: WulianClassroomInstance = {
        id: result.id,
        owner: userId,
        chapterId: personalizationInput.chapterId,
        stage: result.stage,
        scenes: result.scenes,
        personalization: personalizationInput,
        simulators: personalizationInput.selectedSimulatorIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 4. Persist if user is logged in
      const isGuest = !userId || userId === 'guest';
      if (!isGuest) {
        log.info(`Saving custom classroom instance ${result.id} for owner ${userId}`);
        await saveClassroomInstance(instance);
      } else {
        log.info(`Guest mode: classroom instance will be returned to client for local IndexedDB storage`);
      }

      // 5. Update job store
      await markClassroomGenerationJobSucceeded(jobId, {
        id: result.id,
        url: result.url,
        stage: result.stage,
        scenes: result.scenes,
        scenesCount: result.scenesCount,
        createdAt: result.createdAt,
      });

      // Attach the full instance to the job file (by rewriting it) so polling client can load it
      // This is especially crucial for guest mode
      const { updateClassroomGenerationJob } = await import('@/lib/server/classroom-job-store');
      await updateClassroomGenerationJob(jobId, {
        result: {
          classroomId: result.id,
          url: result.url,
          scenesCount: result.scenesCount,
          instance: instance as any, // Attach to result object
        } as any,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Wulian classroom generation job ${jobId} failed:`, error);
      try {
        await markClassroomGenerationJobFailed(jobId, message);
      } catch (markFailedError) {
        log.error(`Failed to persist failed status for job ${jobId}:`, markFailedError);
      }
    } finally {
      runningWulianJobs.delete(jobId);
    }
  })();

  runningWulianJobs.set(jobId, jobPromise);
  return jobPromise;
}
