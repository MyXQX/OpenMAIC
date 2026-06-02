/**
 * middleware.ts
 * 
 * 文件作用：
 * Next.js 中间件，在请求到达应用前进行访问控制验证。如果设置了 ACCESS_CODE 环境变量，
 * 则验证所有请求是否持有有效的访问令牌，防止未授权访问。
 * 
 * 运行机理：
 * 1. 验证流程：
 *    - 检查是否配置了 ACCESS_CODE 环境变量（如果未配置，直接放行所有请求）
 *    - 白名单检查：/api/access-code/* 和 /api/health 路径免验证
 *    - Cookie验证：检查 openmaic_access cookie 中是否存在有效的HMAC签名令牌
 * 2. HMAC令牌验证：
 *    - 令牌格式：timestamp.signature，使用 HMAC-SHA256 签名
 *    - verifyToken() 函数使用Web Crypto API验证签名的有效性
 *    - 使用常数时间比较防止时序攻击
 * 3. 访问控制决策：
 *    - API请求 + 无效令牌 → 返回 401 Unauthorized
 *    - 页面请求 + 无效令牌 → 放行，由前端 AccessCodeGuard 组件显示验证模态框
 * 4. matcher 配置：仅对实际应用路由生效，排除静态资源和Next.js内部路由
 * 5. Wulian 会话识别（需求 7.4, 7.6, 11.2）：
 *    - /api/wulian/* 路由（除 /api/wulian/auth/*）额外识别 wulian_session cookie
 *    - 若存在有效 wulian 会话，解析 userId 并通过请求头传递给路由处理器
 *    - 无会话时允许访客降级（由各路由决定是否拒绝或允许访客）
 *    - Wulian 会话与 ACCESS_CODE 并存：两者都配置时，两者都需验证通过
 * 
 * 与其他代码的关联：
 * - AccessCodeGuard (components/access-code-guard)：前端组件，配合中间件实现客户端验证
 * - /api/access-code/verify：获取新的访问令牌的API端点
 * - /api/access-code/status：检查访问码状态的API端点
 * - lib/wulian/auth/session：Wulian 会话签发与校验（Edge 兼容）
 * - /api/wulian/auth/*：Wulian 认证路由（公开，不需会话）
 * - 所有其他 /api/* 路由：受此中间件保护
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from './lib/wulian/auth/session';

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
async function verifyToken(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  // Constant-length comparison (not truly constant-time in JS, but sufficient here)
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Whitelist: access-code endpoints, health check, wulian auth endpoints (public)
  if (
    pathname.startsWith('/api/access-code/') ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/wulian/auth/')
  ) {
    return NextResponse.next();
  }

  // --- Wulian session recognition (需求 7.4, 7.6, 11.2) ---
  // For /api/wulian/* routes (except auth/*), parse wulian_session cookie
  // and attach userId to request headers if valid; allow guest degradation if no session
  const isWulianRoute = pathname.startsWith('/api/wulian/');
  let wulianUserId: string | null = null;

  if (isWulianRoute) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (sessionCookie?.value) {
      const payload = await verifySessionToken(sessionCookie.value);
      if (payload) {
        wulianUserId = payload.userId;
      }
    }
    // Note: No session is allowed (guest degradation); routes decide whether to reject or allow guest
  }

  // --- ACCESS_CODE site-level password check (existing logic) ---
  const accessCode = process.env.ACCESS_CODE;
  let accessCodeValid = false;

  if (accessCode) {
    const cookie = request.cookies.get('openmaic_access');
    if (cookie?.value && (await verifyToken(cookie.value, accessCode))) {
      accessCodeValid = true;
    }
  } else {
    // No ACCESS_CODE configured → always valid
    accessCodeValid = true;
  }

  // --- Decision logic ---
  // For wulian routes: if ACCESS_CODE is configured, it must be valid; wulian session is optional (guest allowed)
  // For other routes: ACCESS_CODE must be valid (if configured)
  if (!accessCodeValid) {
    // API requests without valid ACCESS_CODE → 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
        { status: 401 },
      );
    }
    // Page requests → let through, frontend shows modal
    return NextResponse.next();
  }

  // If we reach here, ACCESS_CODE is valid (or not configured)
  // For wulian routes, attach userId header if session exists
  if (isWulianRoute && wulianUserId) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-wulian-user-id', wulianUserId);
    
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
