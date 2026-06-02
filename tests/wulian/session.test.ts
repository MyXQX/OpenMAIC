import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  issueSessionToken,
  verifySessionToken,
  getUserIdFromSessionToken,
  createSessionCookie,
  createClearedSessionCookie,
  createSessionForUser,
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
} from '@/lib/wulian/auth/session';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** 固定时间戳（毫秒），便于测试时间相关逻辑。 */
const FIXED_NOW = 1700000000000;

/** 1 小时（毫秒）。 */
const ONE_HOUR_MS = 60 * 60 * 1000;

/** 保存原始环境变量，测试后恢复。 */
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.WULIAN_SESSION_SECRET;
});

afterEach(() => {
  if (originalEnv !== undefined) {
    process.env.WULIAN_SESSION_SECRET = originalEnv;
  } else {
    delete process.env.WULIAN_SESSION_SECRET;
  }
});

// ----------------------------------------------------------------------------
// Token 签发与校验（需求 7.3 / 7.4 / 12.2）
// ----------------------------------------------------------------------------

describe('会话 token 签发与校验（HMAC-SHA256）', () => {
  it('issueSessionToken 签发合法 token，形态为 base64url.hex', async () => {
    const token = await issueSessionToken('user-123', { now: FIXED_NOW });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]+$/);
    // 载荷与签名用 `.` 分隔。
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
  });

  it('签发的 token 可被 verifySessionToken 校验通过，还原出 userId', async () => {
    const token = await issueSessionToken('alice', { now: FIXED_NOW, maxAgeSeconds: 3600 });
    const payload = await verifySessionToken(token, { now: FIXED_NOW });
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('alice');
    expect(payload?.issuedAt).toBe(FIXED_NOW);
    expect(payload?.expiresAt).toBe(FIXED_NOW + 3600 * 1000);
  });

  it('getUserIdFromSessionToken 便捷方法直接返回 userId', async () => {
    const token = await issueSessionToken('bob', { now: FIXED_NOW });
    const userId = await getUserIdFromSessionToken(token, { now: FIXED_NOW });
    expect(userId).toBe('bob');
  });

  it('空 userId 签发时抛错（不允许匿名会话）', async () => {
    await expect(issueSessionToken('', { now: FIXED_NOW })).rejects.toThrow(
      'userId 不能为空',
    );
  });

  it('篡改载荷任意一位 → 签名校验失败，返回 null（需求 12.2）', async () => {
    const token = await issueSessionToken('carol', { now: FIXED_NOW });
    const [payload, sig] = token.split('.');
    // 篡改载荷第一个字符。
    const tampered = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A') + '.' + sig;
    expect(await verifySessionToken(tampered, { now: FIXED_NOW })).toBeNull();
  });

  it('篡改签名任意一位 → 校验失败，返回 null（需求 12.2）', async () => {
    const token = await issueSessionToken('dave', { now: FIXED_NOW });
    const [payload, sig] = token.split('.');
    // 篡改签名最后一个字符。
    const tampered = payload + '.' + sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a');
    expect(await verifySessionToken(tampered, { now: FIXED_NOW })).toBeNull();
  });

  it('token 过期后校验失败，返回 null', async () => {
    const token = await issueSessionToken('eve', { now: FIXED_NOW, maxAgeSeconds: 3600 });
    // 签发时刻可校验通过。
    expect(await verifySessionToken(token, { now: FIXED_NOW })).not.toBeNull();
    // 3600 秒后（恰好到期）校验失败。
    expect(await verifySessionToken(token, { now: FIXED_NOW + 3600 * 1000 })).toBeNull();
    // 3601 秒后（已过期）校验失败。
    expect(await verifySessionToken(token, { now: FIXED_NOW + 3601 * 1000 })).toBeNull();
  });

  it('token 在有效期内任意时刻均可校验通过', async () => {
    const token = await issueSessionToken('frank', { now: FIXED_NOW, maxAgeSeconds: 7200 });
    // 签发时刻。
    expect(await verifySessionToken(token, { now: FIXED_NOW })).not.toBeNull();
    // 1 小时后。
    expect(await verifySessionToken(token, { now: FIXED_NOW + ONE_HOUR_MS })).not.toBeNull();
    // 2 小时后（恰好到期前 1ms）。
    expect(await verifySessionToken(token, { now: FIXED_NOW + 7200 * 1000 - 1 })).not.toBeNull();
  });

  it('非法 token 形态（无 `.` / 空字符串 / null / undefined）一律返回 null', async () => {
    expect(await verifySessionToken('no-dot-here', { now: FIXED_NOW })).toBeNull();
    expect(await verifySessionToken('', { now: FIXED_NOW })).toBeNull();
    expect(await verifySessionToken(null, { now: FIXED_NOW })).toBeNull();
    expect(await verifySessionToken(undefined, { now: FIXED_NOW })).toBeNull();
  });

  it('载荷 JSON 损坏（非法 base64url / 非法 JSON）一律返回 null', async () => {
    // 非法 base64url（含非法字符）。
    expect(await verifySessionToken('!!!invalid!!!.abcd1234', { now: FIXED_NOW })).toBeNull();
    // 合法 base64url 但解码后非 JSON。
    const notJson = btoa('not-json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifySessionToken(`${notJson}.abcd1234`, { now: FIXED_NOW })).toBeNull();
  });

  it('载荷 JSON 缺失必需字段（userId / issuedAt / expiresAt）一律返回 null', async () => {
    const secret = 'test-secret';
    process.env.WULIAN_SESSION_SECRET = secret;

    // 缺 userId。
    const missingUserId = btoa(JSON.stringify({ issuedAt: FIXED_NOW, expiresAt: FIXED_NOW + 1000 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verifySessionToken(`${missingUserId}.dummy`, { now: FIXED_NOW })).toBeNull();

    // userId 为空字符串。
    const emptyUserId = btoa(JSON.stringify({ userId: '', issuedAt: FIXED_NOW, expiresAt: FIXED_NOW + 1000 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verifySessionToken(`${emptyUserId}.dummy`, { now: FIXED_NOW })).toBeNull();
  });

  it('不同密钥签发的 token 无法被另一密钥校验（密钥隔离）', async () => {
    process.env.WULIAN_SESSION_SECRET = 'secret-A';
    const tokenA = await issueSessionToken('grace', { now: FIXED_NOW });

    process.env.WULIAN_SESSION_SECRET = 'secret-B';
    expect(await verifySessionToken(tokenA, { now: FIXED_NOW })).toBeNull();
  });

  it('相同密钥签发的 token 可跨「签发-校验」调用校验通过（密钥一致性）', async () => {
    process.env.WULIAN_SESSION_SECRET = 'shared-secret';
    const token = await issueSessionToken('heidi', { now: FIXED_NOW });
    // 模拟不同请求/进程，但密钥相同。
    expect(await verifySessionToken(token, { now: FIXED_NOW })).not.toBeNull();
  });
});

// ----------------------------------------------------------------------------
// Cookie 辅助（需求 7.3）
// ----------------------------------------------------------------------------

describe('会话 cookie 辅助（签发 / 清除）', () => {
  it('createSessionCookie 返回可直接传入 cookieStore.set 的描述对象', async () => {
    const token = await issueSessionToken('ivan', { now: FIXED_NOW });
    const cookie = createSessionCookie(token);

    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.value).toBe(token);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.path).toBe('/');
    expect(cookie.maxAge).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS);
  });

  it('createSessionCookie 可自定义 maxAge 与 secure', async () => {
    const token = await issueSessionToken('judy', { now: FIXED_NOW, maxAgeSeconds: 1800 });
    const cookie = createSessionCookie(token, { maxAgeSeconds: 1800, secure: true });

    expect(cookie.maxAge).toBe(1800);
    expect(cookie.secure).toBe(true);
  });

  it('createClearedSessionCookie 返回 maxAge=0 的清除 cookie（登出）', () => {
    const cleared = createClearedSessionCookie();
    expect(cleared.name).toBe(SESSION_COOKIE_NAME);
    expect(cleared.value).toBe('');
    expect(cleared.maxAge).toBe(0);
    expect(cleared.httpOnly).toBe(true);
  });

  it('createSessionForUser 一站式签发：返回可直接设置的 cookie', async () => {
    const cookie = await createSessionForUser('karl', { maxAgeSeconds: 3600, now: FIXED_NOW });
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.maxAge).toBe(3600);

    // 校验 cookie.value 是合法 token 且绑定 userId。
    const userId = await getUserIdFromSessionToken(cookie.value, { now: FIXED_NOW });
    expect(userId).toBe('karl');
  });

  it('生产环境 secure 默认为 true，非生产环境默认为 false', async () => {
    const originalNodeEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'production';
    const prodCookie = await createSessionForUser('laura');
    expect(prodCookie.secure).toBe(true);

    process.env.NODE_ENV = 'development';
    const devCookie = await createSessionForUser('mike');
    expect(devCookie.secure).toBe(false);

    // 恢复。
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });
});

// ----------------------------------------------------------------------------
// 密钥管理（需求 12.4）
// ----------------------------------------------------------------------------

describe('会话密钥管理（环境变量 / 回退）', () => {
  it('配置 WULIAN_SESSION_SECRET 时使用该密钥', async () => {
    process.env.WULIAN_SESSION_SECRET = 'my-custom-secret';
    const token = await issueSessionToken('nancy', { now: FIXED_NOW });
    expect(await verifySessionToken(token, { now: FIXED_NOW })).not.toBeNull();
  });

  it('未配置 WULIAN_SESSION_SECRET 时回退到开发默认密钥（带警告）', async () => {
    delete process.env.WULIAN_SESSION_SECRET;
    const token = await issueSessionToken('oscar', { now: FIXED_NOW });
    // 仍可签发与校验（使用回退密钥）。
    expect(await verifySessionToken(token, { now: FIXED_NOW })).not.toBeNull();
  });

  it('空白 WULIAN_SESSION_SECRET 视为未配置，回退到开发默认密钥', async () => {
    process.env.WULIAN_SESSION_SECRET = '   ';
    const token = await issueSessionToken('paul', { now: FIXED_NOW });
    expect(await verifySessionToken(token, { now: FIXED_NOW })).not.toBeNull();
  });
});

// ----------------------------------------------------------------------------
// 边界与安全（需求 12.2 / 12.4）
// ----------------------------------------------------------------------------

describe('边界与安全', () => {
  it('定长比较：签名长度不同时立即拒绝（需求 12.2）', async () => {
    const token = await issueSessionToken('quinn', { now: FIXED_NOW });
    const [payload, sig] = token.split('.');
    // 截短签名。
    const shortenedSig = sig.slice(0, -2);
    expect(await verifySessionToken(`${payload}.${shortenedSig}`, { now: FIXED_NOW })).toBeNull();
    // 加长签名。
    const lengthenedSig = sig + 'ab';
    expect(await verifySessionToken(`${payload}.${lengthenedSig}`, { now: FIXED_NOW })).toBeNull();
  });

  it('载荷中 userId 含特殊字符（Unicode / 空格 / emoji）可正常签发与校验', async () => {
    const specialUserIds = ['用户-123', 'user with spaces', 'user🎉emoji'];
    for (const userId of specialUserIds) {
      const token = await issueSessionToken(userId, { now: FIXED_NOW });
      const payload = await verifySessionToken(token, { now: FIXED_NOW });
      expect(payload?.userId).toBe(userId);
    }
  });

  it('极长 userId（1000 字符）可正常签发与校验', async () => {
    const longUserId = 'u'.repeat(1000);
    const token = await issueSessionToken(longUserId, { now: FIXED_NOW });
    const payload = await verifySessionToken(token, { now: FIXED_NOW });
    expect(payload?.userId).toBe(longUserId);
  });

  it('maxAgeSeconds=0 签发的 token 立即过期', async () => {
    const token = await issueSessionToken('rachel', { now: FIXED_NOW, maxAgeSeconds: 0 });
    // 签发时刻已过期（expiresAt = issuedAt）。
    expect(await verifySessionToken(token, { now: FIXED_NOW })).toBeNull();
  });

  it('负数 maxAgeSeconds 签发的 token 立即过期', async () => {
    const token = await issueSessionToken('sam', { now: FIXED_NOW, maxAgeSeconds: -3600 });
    expect(await verifySessionToken(token, { now: FIXED_NOW })).toBeNull();
  });

  it('极大 maxAgeSeconds（100 年）可正常签发与校验', async () => {
    const hundredYearsSeconds = 100 * 365 * 24 * 60 * 60;
    const token = await issueSessionToken('tina', { now: FIXED_NOW, maxAgeSeconds: hundredYearsSeconds });
    const payload = await verifySessionToken(token, { now: FIXED_NOW });
    expect(payload?.userId).toBe('tina');
    expect(payload?.expiresAt).toBe(FIXED_NOW + hundredYearsSeconds * 1000);
  });
});
