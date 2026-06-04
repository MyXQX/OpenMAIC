import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { getUserIdFromSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';
import { listClassroomInstances } from '@/lib/wulian/storage';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { runWulianClassroomGenerationJob } from '@/lib/wulian/classroom/runner';
import type { WulianPersonalizationInput } from '@/lib/wulian/types';

const log = createLogger('WulianClassroomAPI');

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = await getUserIdFromSessionToken(sessionToken);

    const body = await req.json() as WulianPersonalizationInput;
    if (!body.chapterId || !body.studentProfile) {
      return apiError('INVALID_REQUEST', 400, '缺少必要字段 chapterId 或 studentProfile');
    }

    // 访客越权校验：根据用户反馈，访客模式无法使用上传个人资料等功能，应当登录
    const hasUploadedDocs = body.uploadedDocIds && body.uploadedDocIds.length > 0;
    const isCompareOrMine = body.materialMode === 'compare' || body.materialMode === 'mine';
    if (!userId && (isCompareOrMine || hasUploadedDocs)) {
      return apiError('INVALID_CREDENTIALS', 401, '未登录，无法使用个人资料定制，请先登录账号。');
    }

    const jobId = nanoid(10);
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.nextUrl?.protocol || 'http:';
    const baseUrl = `${protocol}//${host}`;

    // 1. 初始化 job 记录，放入 job 存储中供轮询
    await createClassroomGenerationJob(jobId, {
      requirement: `Wulian customized classroom for chapter ${body.chapterId}`,
      enableWebSearch: false,
    });

    // 2. 异步拉起 Wulian 定制生成流水线
    // 故意不 await，使其在后台并发运行
    runWulianClassroomGenerationJob(jobId, body, userId || 'guest', baseUrl).catch((err) => {
      log.error(`Unhandled error in runWulianClassroomGenerationJob for job ${jobId}:`, err);
    });

    return apiSuccess({
      jobId,
      pollUrl: `/api/wulian/classroom/${jobId}`,
    });

  } catch (err) {
    log.error('classroom POST failed:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : '创建课堂定制任务失败'
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = await getUserIdFromSessionToken(sessionToken);

    if (!userId) {
      // 访客模式下没有服务端实例，直接返回空
      return apiSuccess({ classrooms: [] });
    }

    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get('chapterId') || undefined;

    const list = await listClassroomInstances(userId, chapterId);
    return apiSuccess({ classrooms: list });

  } catch (err) {
    log.error('classroom GET failed:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : '获取课堂定制列表失败'
    );
  }
}
