/**
 * app/api/generate-classroom/route.ts
 * 
 * 文件作用：
 * 处理课堂生成任务的HTTP POST端点。接收用户输入（学习需求、PDF内容、配置参数），
 * 创建异步生成任务，并返回任务ID供客户端轮询查询进度。
 * 
 * 运行机理：
 * 1. 请求接收：
 *    - 解析请求体中的 GenerateClassroomInput（学习需求、PDF内容、生成选项等）
 *    - 验证必填字段（requirement）
 * 2. 任务创建与启动：
 *    - 生成唯一的jobId（使用nanoid）
 *    - 调用 createClassroomGenerationJob() 在存储中创建任务记录
 *    - 使用 after() 回调在响应发送后异步启动实际的生成任务 runClassroomGenerationJob()
 * 3. 返回状态：
 *    - 立即返回202 Accepted状态
 *    - 返回jobId、pollUrl（客户端轮询地址）、pollIntervalMs（建议轮询间隔）
 * 4. 生成流程（在后台异步运行）：
 *    - 解析PDF和需求
 *    - 生成课堂大纲
 *    - 生成各个场景（幻灯片、测验、交互式内容等）
 *    - 生成媒体（图片、视频、TTS音频）
 * 
 * 与其他代码的关联：
 * - GenerateClassroomInput (lib/types/generation)：请求数据结构定义
 * - createClassroomGenerationJob (lib/server/classroom-job-store)：在存储中创建任务
 * - runClassroomGenerationJob (lib/server/classroom-job-runner)：执行实际的生成任务
 * - /api/generate-classroom/[jobId]：客户端轮询此端点查询任务进度
 * - /api/generate/* 系列API：生成中使用的各个生成子任务（大纲、场景、媒体等）
 */

import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('GenerateClassroom API');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let requirementSnippet: string | undefined;
  try {
    const rawBody = (await req.json()) as Partial<GenerateClassroomInput>;
    requirementSnippet = rawBody.requirement?.substring(0, 60);
    const body: GenerateClassroomInput = {
      requirement: rawBody.requirement || '',
      ...(rawBody.pdfContent ? { pdfContent: rawBody.pdfContent } : {}),

      ...(rawBody.enableWebSearch != null ? { enableWebSearch: rawBody.enableWebSearch } : {}),
      ...(rawBody.webSearchProviderId ? { webSearchProviderId: rawBody.webSearchProviderId } : {}),
      ...(rawBody.webSearchApiKey ? { webSearchApiKey: rawBody.webSearchApiKey } : {}),
      ...(rawBody.baiduSubSources ? { baiduSubSources: rawBody.baiduSubSources } : {}),
      ...(rawBody.enableImageGeneration != null
        ? { enableImageGeneration: rawBody.enableImageGeneration }
        : {}),
      ...(rawBody.enableVideoGeneration != null
        ? { enableVideoGeneration: rawBody.enableVideoGeneration }
        : {}),
      ...(rawBody.enableTTS != null ? { enableTTS: rawBody.enableTTS } : {}),
      ...(rawBody.agentMode ? { agentMode: rawBody.agentMode } : {}),
    };
    const { requirement } = body;

    if (!requirement) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: requirement');
    }

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, body);
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, body, baseUrl));

    return apiSuccess(
      {
        jobId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    log.error(
      `Classroom generation job creation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
