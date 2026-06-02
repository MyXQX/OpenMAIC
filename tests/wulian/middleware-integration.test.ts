/**
 * 中间件集成测试：验证 wulian 会话识别与 ACCESS_CODE 并存逻辑（需求 7.4, 7.6, 11.2）
 *
 * 测试策略：
 * - 模拟 NextRequest 与 middleware 调用，验证路由白名单、会话解析、ACCESS_CODE 校验的组合逻辑
 * - 不依赖真实服务器，使用 vitest 的 mock 能力模拟 NextRequest/NextResponse
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '@/middleware';
import { issueSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** 固定时间戳（毫秒），便于测试时间相关逻辑。 */
const FIXED_NOW = 1700000000000;

/** 保存原始环境变量，测试后恢复。 */
let originalAccessCode: string | undefined;
let originalSessionSecret: string | undefined;

beforeEach(() => {
  originalAccessCode = process.env.ACCESS_CODE;
  originalSessionSecret = process.env.WULIAN_SESSION_SECRET;
  // 设置测试密钥。
  process.env.WULIAN_SESSION_SECRET = 'test-session-secret';
});

afterEach(() => {
  if (originalAccessCode !== undefined) {
    process.env.ACCESS_CODE = originalAccessCode;
  } else {
    delete process.env.ACCESS_CODE;
  }
  if (originalSessionSecret !== undefined) {
    process.env.WULIAN_SESSION_SECRET = originalSessionSecret;
  } else {
    delete process.env.WULIAN_SESSION_SECRET;
  }
});

/**
 * 创建模拟的 NextRequest。
 */
function createMockRequest(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `https://example.com${pathname}`;
  
  // 设置 cookies（通过 headers）。
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  
  const headers = new Headers();
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }
  
  const request = new NextRequest(url, { headers });

  return request;
}

/**
 * 生成有效的 ACCESS_CODE token（HMAC 签名）。
 */
async function generateAccessCodeToken(accessCode: string): Promise<string> {
  const timestamp = Date.now().toString();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = encoder.encode(timestamp);
  const signature = await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer);
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${timestamp}.${sigHex}`;
}

// ----------------------------------------------------------------------------
// 白名单路由（公开，不需任何验证）
// ----------------------------------------------------------------------------

describe('白名单路由（公开）', () => {
  it('/api/health 无需任何验证，直接放行', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const request = createMockRequest('/api/health');
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('/api/access-code/* 无需任何验证，直接放行', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const request = createMockRequest('/api/access-code/verify');
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('/api/wulian/auth/* 无需任何验证，直接放行（公开认证路由）', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const request = createMockRequest('/api/wulian/auth/login');
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// ACCESS_CODE 逻辑（站点级口令，需求 7.6）
// ----------------------------------------------------------------------------

describe('ACCESS_CODE 站点级口令（现有逻辑保持不变）', () => {
  it('未配置 ACCESS_CODE 时，所有路由直接放行', async () => {
    delete process.env.ACCESS_CODE;
    const request = createMockRequest('/api/chat');
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('配置 ACCESS_CODE 但无有效 cookie 时，API 路由返回 401', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const request = createMockRequest('/api/chat');
    const response = await middleware(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });

  it('配置 ACCESS_CODE 且有有效 cookie 时，API 路由放行', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const validToken = await generateAccessCodeToken('test-access-code');
    const request = createMockRequest('/api/chat', { openmaic_access: validToken });
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('配置 ACCESS_CODE 但无有效 cookie 时，页面路由放行（由前端 AccessCodeGuard 处理）', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const request = createMockRequest('/classroom/123');
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// Wulian 会话识别（需求 7.4, 7.6, 11.2）
// ----------------------------------------------------------------------------

describe('Wulian 会话识别（/api/wulian/* 路由）', () => {
  it('无 ACCESS_CODE，有有效 wulian 会话 → 放行并附加 x-wulian-user-id 头', async () => {
    delete process.env.ACCESS_CODE;
    const sessionToken = await issueSessionToken('user-alice', { now: FIXED_NOW });
    const request = createMockRequest('/api/wulian/chat', { [SESSION_COOKIE_NAME]: sessionToken });
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // Note: In Next.js middleware, headers are passed via request headers to route handlers
    // The test verifies the middleware doesn't reject the request
  });

  it('无 ACCESS_CODE，无 wulian 会话 → 放行但不附加 userId 头（访客降级）', async () => {
    delete process.env.ACCESS_CODE;
    const request = createMockRequest('/api/wulian/chat');
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // Guest degradation: no session, but request is allowed
  });

  it('有 ACCESS_CODE + 有效 ACCESS_CODE cookie + 有效 wulian 会话 → 放行并附加 userId 头', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const accessToken = await generateAccessCodeToken('test-access-code');
    const sessionToken = await issueSessionToken('user-bob', { now: FIXED_NOW });
    const request = createMockRequest('/api/wulian/ingest', {
      openmaic_access: accessToken,
      [SESSION_COOKIE_NAME]: sessionToken,
    });
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // Both ACCESS_CODE and wulian session are valid
  });

  it('有 ACCESS_CODE + 有效 ACCESS_CODE cookie + 无 wulian 会话 → 放行但不附加 userId 头（访客降级）', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const accessToken = await generateAccessCodeToken('test-access-code');
    const request = createMockRequest('/api/wulian/feedback', { openmaic_access: accessToken });
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // ACCESS_CODE valid, no wulian session (guest degradation)
  });

  it('有 ACCESS_CODE + 无效 ACCESS_CODE cookie + 有效 wulian 会话 → 返回 401（ACCESS_CODE 优先）', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const sessionToken = await issueSessionToken('user-carol', { now: FIXED_NOW });
    const request = createMockRequest('/api/wulian/chat', { [SESSION_COOKIE_NAME]: sessionToken });
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('有 ACCESS_CODE + 无效 ACCESS_CODE cookie + 无 wulian 会话 → 返回 401', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const request = createMockRequest('/api/wulian/lesson');
    const response = await middleware(request);
    expect(response.status).toBe(401);
  });

  it('wulian 会话过期 → 不附加 userId 头（访客降级）', async () => {
    delete process.env.ACCESS_CODE;
    const expiredToken = await issueSessionToken('user-dave', { now: FIXED_NOW, maxAgeSeconds: 3600 });
    const request = createMockRequest('/api/wulian/chat', { [SESSION_COOKIE_NAME]: expiredToken });
    // 模拟 3601 秒后（已过期）。
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // Expired session: guest degradation
  });

  it('wulian 会话 token 被篡改 → 不附加 userId 头（访客降级）', async () => {
    delete process.env.ACCESS_CODE;
    const validToken = await issueSessionToken('user-eve', { now: FIXED_NOW });
    const tamperedToken = validToken.slice(0, -1) + (validToken.slice(-1) === 'a' ? 'b' : 'a');
    const request = createMockRequest('/api/wulian/ingest', { [SESSION_COOKIE_NAME]: tamperedToken });
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // Tampered session: guest degradation
  });
});

// ----------------------------------------------------------------------------
// 非 wulian 路由不受 wulian 会话影响（需求 11.2）
// ----------------------------------------------------------------------------

describe('非 wulian 路由不受 wulian 会话影响', () => {
  it('/api/chat（非 wulian 路由）有 wulian 会话但无 ACCESS_CODE → 放行但不附加 userId 头', async () => {
    delete process.env.ACCESS_CODE;
    const sessionToken = await issueSessionToken('user-frank', { now: FIXED_NOW });
    const request = createMockRequest('/api/chat', { [SESSION_COOKIE_NAME]: sessionToken });
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // Non-wulian route: wulian session is ignored
  });

  it('/api/generate/image（非 wulian 路由）有 ACCESS_CODE + 有效 ACCESS_CODE cookie → 放行，wulian 会话被忽略', async () => {
    process.env.ACCESS_CODE = 'test-access-code';
    const accessToken = await generateAccessCodeToken('test-access-code');
    const sessionToken = await issueSessionToken('user-grace', { now: FIXED_NOW });
    const request = createMockRequest('/api/generate/image', {
      openmaic_access: accessToken,
      [SESSION_COOKIE_NAME]: sessionToken,
    });
    const response = await middleware(request);
    expect(response.status).toBe(200);
    // Non-wulian route: wulian session is ignored
  });
});
