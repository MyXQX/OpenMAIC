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
 * 
 * 与其他代码的关联：
 * - AccessCodeGuard (components/access-code-guard)：前端组件，配合中间件实现客户端验证
 * - /api/access-code/verify：获取新的访问令牌的API端点
 * - /api/access-code/status：检查访问码状态的API端点
 * - 所有其他 /api/* 路由：受此中间件保护
 */

import { NextRequest, NextResponse } from 'next/server';

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
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Whitelist: access-code endpoints, health check
  if (pathname.startsWith('/api/access-code/') || pathname === '/api/health') {
    return NextResponse.next();
  }

  // Check cookie — validate HMAC signature, not just existence
  const cookie = request.cookies.get('openmaic_access');
  if (cookie?.value && (await verifyToken(cookie.value, accessCode))) {
    return NextResponse.next();
  }

  // API requests without valid cookie → 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
      { status: 401 },
    );
  }

  // Page requests → let through, frontend shows modal
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
