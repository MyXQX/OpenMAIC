/**
 * POST /api/wulian/auth/register
 *
 * 注册新账号（需求 7.1 / 7.2 / 7.7）。
 *
 * 请求体：{ username: string, password: string }
 * 成功响应：{ success: true, user: PublicAccount }
 * 错误响应：
 *   - 400 INVALID_REQUEST：用户名/密码非法（空/超长/含非法字符）
 *   - 409 USERNAME_CONFLICT：用户名已存在（需求 7.7）
 *   - 500 INTERNAL_ERROR：服务器内部错误
 */

import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  registerAccount,
  UsernameConflictError,
  InvalidAccountInputError,
} from '@/lib/wulian/auth/accounts';

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
    const user = await registerAccount(username, password);
    return apiSuccess({ user }, 201);
  } catch (err) {
    if (err instanceof UsernameConflictError) {
      return apiError('USERNAME_CONFLICT', 409, err.message);
    }
    if (err instanceof InvalidAccountInputError) {
      return apiError('INVALID_REQUEST', 400, err.message);
    }
    console.error('[wulian/auth/register] 注册失败:', err);
    return apiError('INTERNAL_ERROR', 500, '注册失败，请稍后重试');
  }
}
