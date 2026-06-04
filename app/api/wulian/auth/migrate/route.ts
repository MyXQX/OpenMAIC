import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getUserIdFromSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';
import { migrateLocalDataToAccount } from '@/lib/wulian/auth/migration';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = await getUserIdFromSessionToken(sessionToken);

    if (!userId) {
      return apiError('INVALID_CREDENTIALS', 401, '请先登录账号以进行数据迁移');
    }

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return apiError('INVALID_REQUEST', 400, '请求体格式错误');
    }

    const result = await migrateLocalDataToAccount(userId, body);
    return apiSuccess({ ...result });
  } catch (err) {
    console.error('[wulian/auth/migrate] 数据迁移失败:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : '同步本地数据失败，请重试'
    );
  }
}
