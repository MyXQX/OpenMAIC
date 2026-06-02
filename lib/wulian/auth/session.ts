/**
 * 物联智讲 - 会话签发与校验（Auth / session）
 *
 * 职责（需求 7.3 / 7.4 / 12.2 / 12.4）：
 *   - 会话签发：登录成功后用 HMAC-SHA256 对「绑定 userId 的载荷」签名，产出会话 token，
 *     写入名为 `wulian_session` 的 cookie（需求 7.3）。
 *   - 会话校验：携带有效会话访问受保护接口时，解析 token、校验签名与有效期，
 *     还原出 userId 以识别用户身份（需求 7.4）。
 *   - 会话失效：登出时清除 cookie（maxAge=0）。
 *
 * 安全设计：
 *   - 与 `middleware.ts` 既有的 HMAC token 校验思路一致（`payload.signature` 形态），
 *     但 **改用 Edge 兼容的 Web Crypto API（`crypto.subtle`）**，不依赖任何 node 内置模块，
 *     使本模块可被 Edge 运行时的 `middleware.ts` 直接复用（task 3.4）。
 *   - 校验签名时使用**定长比较**降低时序攻击风险（需求 12.2）。
 *   - 会话密钥来自环境变量 {@link SESSION_SECRET_ENV}；未配置时回退到带警告的开发默认值，
 *     并且**绝不**在响应或日志中回显密钥/签名等敏感值（需求 12.4）。
 *
 * Token 形态：`<base64url(payloadJSON)>.<hex(HMAC)>`
 *   - payloadJSON：`{ uid, iat, exp }`（uid=userId，iat/exp 为毫秒时间戳）。
 *   - base64url 不含 `.`，hex 也不含 `.`，因此用第一个 `.` 即可稳定分割载荷与签名。
 */

// ----------------------------------------------------------------------------
// 常量
// ----------------------------------------------------------------------------

/** 会话 cookie 名（需求 7.3）。 */
export const SESSION_COOKIE_NAME = 'wulian_session';

/** 会话密钥环境变量名。生产环境务必配置一个高熵随机值。 */
export const SESSION_SECRET_ENV = 'WULIAN_SESSION_SECRET';

/**
 * 未配置 {@link SESSION_SECRET_ENV} 时的开发回退密钥。
 * 仅用于本地开发，生产部署必须通过环境变量覆盖（否则签名可被伪造）。
 */
const DEV_FALLBACK_SECRET = 'wulian-dev-insecure-session-secret';

/** 会话默认有效期（秒）：7 天。 */
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

/** 会话载荷（签名所覆盖的内容）。 */
export interface SessionPayload {
  /** 绑定的用户 id（需求 7.3 / 7.4）。 */
  userId: string;
  /** 签发时间（毫秒时间戳）。 */
  issuedAt: number;
  /** 过期时间（毫秒时间戳）。 */
  expiresAt: number;
}

/** 签发选项。 */
export interface IssueSessionOptions {
  /** 有效期（秒），默认 {@link DEFAULT_SESSION_MAX_AGE_SECONDS}。 */
  maxAgeSeconds?: number;
  /** 当前时间（毫秒），便于测试注入；默认 `Date.now()`。 */
  now?: number;
}

/** 校验选项。 */
export interface VerifySessionOptions {
  /** 当前时间（毫秒），便于测试注入；默认 `Date.now()`。 */
  now?: number;
}

/**
 * 可直接传入 Next `cookies().set(...)` 的会话 cookie 描述。
 * 形如 `cookieStore.set(createSessionCookie(token))`。
 */
export interface SessionCookie {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
  secure: boolean;
}

/** 设置/清除 cookie 的可选项。 */
export interface SessionCookieOptions {
  /** cookie 有效期（秒）；签发默认 7 天，清除恒为 0。 */
  maxAgeSeconds?: number;
  /** 是否标记 Secure；默认仅在生产环境为 true。 */
  secure?: boolean;
}

// ----------------------------------------------------------------------------
// 密钥获取
// ----------------------------------------------------------------------------

/** 进程内是否已就「使用回退密钥」告警过（避免日志刷屏）。 */
let warnedAboutFallbackSecret = false;

/**
 * 读取会话密钥。优先使用 {@link SESSION_SECRET_ENV}；缺失/空白时回退到开发默认值并告警一次。
 * 告警信息**不包含**任何密钥内容（需求 12.4）。
 */
function getSessionSecret(): string {
  const fromEnv = process.env[SESSION_SECRET_ENV];
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  if (!warnedAboutFallbackSecret) {
    warnedAboutFallbackSecret = true;
    // 仅提示「未配置」，绝不回显密钥值。
    console.warn(
      `[wulian/auth] ${SESSION_SECRET_ENV} 未配置，正在使用不安全的开发默认密钥；生产环境必须设置该环境变量。`,
    );
  }
  return DEV_FALLBACK_SECRET;
}

// ----------------------------------------------------------------------------
// 编码辅助（Edge 兼容：仅用 TextEncoder/TextDecoder + btoa/atob + crypto.subtle）
// ----------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 字符串 → UTF-8 字节。 */
function utf8Bytes(str: string): Uint8Array {
  return encoder.encode(str);
}

/** ArrayBuffer → 十六进制字符串。 */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** UTF-8 字符串 → base64url（无填充）。 */
function toBase64Url(str: string): string {
  const bytes = utf8Bytes(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → UTF-8 字符串；非法输入抛错（由调用方捕获并视为无效 token）。 */
function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return decoder.decode(bytes);
}

// ----------------------------------------------------------------------------
// HMAC（Web Crypto，按密钥缓存 CryptoKey）
// ----------------------------------------------------------------------------

/** 按密钥字符串缓存导入后的 CryptoKey，避免每次签名都重新导入。 */
const keyCache = new Map<string, Promise<CryptoKey>>();

function importHmacKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const keyPromise = crypto.subtle.importKey(
    'raw',
    utf8Bytes(secret).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  keyCache.set(secret, keyPromise);
  return keyPromise;
}

/** 对给定数据计算 HMAC-SHA256，返回十六进制签名。 */
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, utf8Bytes(data).buffer as ArrayBuffer);
  return bufToHex(sig);
}

/**
 * 定长比较（需求 12.2）：先比长度，再逐字符异或累积，避免提前返回造成的时序泄露。
 * 注意：JS 层面无法做到严格意义上的常数时间，但「定长 + 全程遍历」已显著降低时序攻击面，
 * 与 `middleware.ts` 的做法保持一致。
 */
function constantLengthEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ----------------------------------------------------------------------------
// 签发 / 解析
// ----------------------------------------------------------------------------

/**
 * 签发一个绑定 `userId` 的 HMAC 会话 token（需求 7.3）。
 *
 * @throws {Error} 当 `userId` 为空字符串时（不应签发匿名/空会话）。
 */
export async function issueSessionToken(
  userId: string,
  options: IssueSessionOptions = {},
): Promise<string> {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('issueSessionToken: userId 不能为空');
  }
  const now = options.now ?? Date.now();
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS;
  const payload: SessionPayload = {
    userId,
    issuedAt: now,
    expiresAt: now + maxAgeSeconds * 1000,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await hmacHex(getSessionSecret(), encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/** 解析载荷并做基本结构校验；任何异常/形态不符返回 null。 */
function parsePayload(encodedPayload: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as Partial<SessionPayload>;
    if (
      parsed &&
      typeof parsed.userId === 'string' &&
      parsed.userId.length > 0 &&
      typeof parsed.issuedAt === 'number' &&
      Number.isFinite(parsed.issuedAt) &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt)
    ) {
      return { userId: parsed.userId, issuedAt: parsed.issuedAt, expiresAt: parsed.expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 校验会话 token 并还原载荷（需求 7.4 / 12.2）。
 *
 * 校验顺序：分割形态 → 重算 HMAC 并定长比较 → 解析载荷 → 校验过期。
 * 任意一步失败（含签名被篡改一位、载荷被篡改、过期、格式损坏）均返回 `null`。
 */
export async function verifySessionToken(
  token: string | undefined | null,
  options: VerifySessionOptions = {},
): Promise<SessionPayload | null> {
  if (typeof token !== 'string' || token.length === 0) return null;

  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const encodedPayload = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const expected = await hmacHex(getSessionSecret(), encodedPayload);
  if (!constantLengthEquals(signature, expected)) return null;

  const payload = parsePayload(encodedPayload);
  if (!payload) return null;

  const now = options.now ?? Date.now();
  if (now >= payload.expiresAt) return null;

  return payload;
}

/**
 * 便捷方法：从 token 还原 userId（需求 7.4）。无效/过期返回 null。
 */
export async function getUserIdFromSessionToken(
  token: string | undefined | null,
  options: VerifySessionOptions = {},
): Promise<string | null> {
  const payload = await verifySessionToken(token, options);
  return payload ? payload.userId : null;
}

// ----------------------------------------------------------------------------
// Cookie 辅助（签发设置 / 失效清除）
// ----------------------------------------------------------------------------

/** 默认 Secure 标记：仅在生产环境启用（本地 http 开发不强制）。 */
function defaultSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 构造「设置会话 cookie」的描述对象（需求 7.3）。
 * 用法：`cookieStore.set(createSessionCookie(token))`。
 */
export function createSessionCookie(token: string, options: SessionCookieOptions = {}): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: options.maxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS,
    secure: options.secure ?? defaultSecure(),
  };
}

/**
 * 构造「清除会话 cookie」的描述对象（登出 / 失效，maxAge=0）。
 * 用法：`cookieStore.set(createClearedSessionCookie())`。
 */
export function createClearedSessionCookie(options: SessionCookieOptions = {}): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: options.secure ?? defaultSecure(),
  };
}

/**
 * 一站式签发：返回可直接 `cookieStore.set(...)` 的会话 cookie（需求 7.3）。
 * 内部有效期与 cookie maxAge 保持一致。
 */
export async function createSessionForUser(
  userId: string,
  options: SessionCookieOptions = {},
): Promise<SessionCookie> {
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS;
  const token = await issueSessionToken(userId, { maxAgeSeconds });
  return createSessionCookie(token, { maxAgeSeconds, secure: options.secure });
}
