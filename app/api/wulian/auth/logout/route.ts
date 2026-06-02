/**
 * POST /api/wulian/auth/logout
 *
 * 登出并清除会话 cookie（需求 7.3）。
 *
 * 成功响应：{ success: true }（同时清除 wulian_session cookie）
 */

import { cookies } from 'next/headers';
import { apiSuccess } from '@/lib/server/api-response';
import { createClearedSessionCookie } from '@/lib/wulian/auth/session';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(createClearedSessionCookie());
  return apiSuccess({});
}
