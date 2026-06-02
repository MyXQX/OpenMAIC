/**
 * POST /api/wulian/auth/login
 *
 * 登录并签发会话 cookie（需求 7.2 / 7.3）。
 *
 * 请求体：{ username: string, password: string }
 * 成功响应：{ success: true, user: PublicAccount }（同时设置 wulian_session cookie）
 * 错误响应：
 *   - 400 INVALID_REQUEST：请求体格式错误
 *   - 401 INVALID_CREDENTIALS：用户名或密码错误
 *   - 500 INTERNAL_ERROR：服务器内部错误
 */

import { cookies } from 'next/headers';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { verifyCredentials } from '@/lib/wulian/auth/accounts';
import { createSessionForUser } from '@/lib/wulian/auth/session';

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, '请求体必须为有效的 JSON');
  }

  const { username, password } = body;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return apiError('INVALID_REQUEST', 400, '用户名和密码必须为字符串');
  }

  try {
    const user = await verifyCredentials(username, password);
    if (!user) {
      return apiError('INVALID_CREDENTIALS', 401, '用户名或密码错误');
    }

    // 签发会话 cookie
    const sessionCookie = await createSessionForUser(user.id);
    const cookieStore = await cookies();
    cookieStore.set(sessionCookie);

    return apiSuccess({ user });
  } catch (err) {
    console.error('[wulian/auth/login] 登录失败:', err);
    return apiError('INTERNAL_ERROR', 500, '登录失败，请稍后重试');
  }
}
