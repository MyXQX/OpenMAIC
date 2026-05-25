/**
 * app/api/generate-classroom/[jobId]/route.ts
 * 
 * 文件作用：
 * 课堂生成任务轮询API端点。用于客户端定期查询后台生成任务的进度和状态。
 * 这是异步任务模式的核心部分：客户端先提交任务（/api/generate-classroom），
 * 然后定期轮询此端点获取任务进度。
 * 
 * 运行机理：
 * 1. 请求参数：
 *    - jobId：从URL路径获取的任务ID（例如 '/api/generate-classroom/abc123def456'）
 * 2. 任务查询：
 *    - 从路径参数中异步解析 jobId
 *    - 验证 jobId 的有效性（isValidClassroomJobId）
 *    - 调用 readClassroomGenerationJob() 从任务存储中读取任务状态
 * 3. 任务状态：
 *    - 返回任务的当前状态（processing, completed, failed 等）
 *    - 如果任务完成，返回生成的课堂数据
 *    - 包含进度百分比或当前处理的步骤
 * 4. 响应格式：
 *    - 成功：返回任务状态和进度信息\n *    - 失败：返回错误代码和错误信息
 * 5. 动态渲染：
 *    - export const dynamic = 'force-dynamic' 保证每次请求都重新查询任务状态
 * 
 * 与其他代码的关联：
 * - readClassroomGenerationJob (lib/server/classroom-job-store)：读取任务状态
 * - isValidClassroomJobId (lib/server/classroom-job-store)：验证任务ID有效性
 * - buildRequestOrigin (lib/server/classroom-storage)：构建请求来源\n * - apiSuccess, apiError (lib/server/api-response)：标准化API响应
 * - /api/generate-classroom：提交生成任务的接口
 * - 前端定期调用此端点监听生成进度
 */

import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidClassroomJobId,
  readClassroomGenerationJob,
} from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomJob API');

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  let resolvedJobId: string | undefined;
  try {
    const { jobId } = await context.params;
    resolvedJobId = jobId;

    if (!isValidClassroomJobId(jobId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom generation job id');
    }

    const job = await readClassroomGenerationJob(jobId);
    if (!job) {
      return apiError('INVALID_REQUEST', 404, 'Classroom generation job not found');
    }

    const pollUrl = `${buildRequestOrigin(req)}/api/generate-classroom/${jobId}`;

    return apiSuccess({
      jobId: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
      pollUrl,
      pollIntervalMs: 5000,
      scenesGenerated: job.scenesGenerated,
      totalScenes: job.totalScenes,
      result: job.result,
      error: job.error,
      done: job.status === 'succeeded' || job.status === 'failed',
    });
  } catch (error) {
    log.error(`Classroom job retrieval failed [jobId=${resolvedJobId ?? 'unknown'}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve classroom generation job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
