/**
 * GET /api/wulian/auth/me
 *
 * 获取当前登录用户信息（需求 7.4）。
 *
 * 成功响应：
 *   - 已登录：{ success: true, user: PublicAccount }
 *   - 未登录：{ success: true, user: null }
 * 错误响应：
 *   - 500 INTERNAL_ERROR：服务器内部错误
 */

import { cookies } from 'next/headers';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getAccountById } from '@/lib/wulian/auth/accounts';
import { getUserIdFromSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    const userId = await getUserIdFromSessionToken(sessionToken);
    if (!userId) {
      return apiSuccess({ user: null });
    }

    const user = await getAccountById(userId);
    return apiSuccess({ user });
  } catch (err) {
    console.error('[wulian/auth/me] 获取当前用户失败:', err);
    return apiError('INTERNAL_ERROR', 500, '获取用户信息失败，请稍后重试');
  }
}
