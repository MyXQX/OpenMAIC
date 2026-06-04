import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { readClassroomGenerationJob } from '@/lib/server/classroom-job-store';

const log = createLogger('WulianClassroomPollAPI');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return apiError('INVALID_REQUEST', 400, '缺少 jobId 参数');
    }

    const job = await readClassroomGenerationJob(jobId);
    if (!job) {
      return apiError('INVALID_REQUEST', 404, `未找到 ID 为 ${jobId} 的生成任务`);
    }

    return apiSuccess({ job });

  } catch (err) {
    log.error('classroom poll GET failed:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : '轮询生成任务失败'
    );
  }
}
