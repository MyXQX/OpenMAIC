import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { getUserIdFromSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';
import { getClassroomInstance, OwnershipError } from '@/lib/wulian/storage';

const log = createLogger('WulianClassroomInstanceAPI');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = await getUserIdFromSessionToken(sessionToken);

    if (!userId) {
      return apiError('INVALID_CREDENTIALS', 401, '未登录，无法获取服务器端课堂实例，请先登录账号。');
    }

    if (!id) {
      return apiError('INVALID_REQUEST', 400, '缺少实例 id 参数');
    }

    try {
      const instance = await getClassroomInstance(userId, id);
      if (!instance) {
        return apiError('INVALID_REQUEST', 404, '课堂实例不存在');
      }

      return apiSuccess({ instance });

    } catch (err) {
      if (err instanceof OwnershipError) {
        log.warn(`User ${userId} attempted unauthorized access to instance ${id}`);
        return apiError('INVALID_CREDENTIALS', 403, '无权访问该课堂实例');
      }
      throw err;
    }

  } catch (err) {
    log.error('classroom instance GET failed:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : '加载课堂实例失败'
    );
  }
}
