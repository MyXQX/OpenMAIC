/**
 * 物联智讲 - Auth 属性测试（Property-Based Testing）
 *
 * Task 3.5：验证账号与会话模块的核心属性在任意合法输入下均成立。
 * 覆盖需求: 7.2（密码哈希/校验）, 7.3（会话签发/校验）, 12.2（签名篡改必拒）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  hashPassword,
  verifyPassword,
} from '@/lib/wulian/auth/accounts';
import {
  issueSessionToken,
  verifySessionToken,
} from '@/lib/wulian/auth/session';

// ----------------------------------------------------------------------------
// 辅助：生成器
// ----------------------------------------------------------------------------

/** 生成合法的密码字符串（非空，长度 1-100）。 */
const arbPassword = fc.string({ minLength: 1, maxLength: 100 });

/** 生成合法的 userId（非空，长度 1-50，含常见字符）。 */
const arbUserId = fc.string({ minLength: 1, maxLength: 50 });

/** 固定时间戳（毫秒），便于测试时间相关逻辑。 */
const FIXED_NOW = 1700000000000;

/** 生成合法的会话有效期（秒，范围 60 - 86400，即 1 分钟到 1 天）。 */
const arbMaxAgeSeconds = fc.integer({ min: 60, max: 86400 });

/** 保存原始环境变量，测试后恢复。 */
let originalSessionSecret: string | undefined;

beforeEach(() => {
  originalSessionSecret = process.env.WULIAN_SESSION_SECRET;
  // 设置固定密钥以确保测试稳定性。
  process.env.WULIAN_SESSION_SECRET = 'test-pbt-secret-key';
});

afterEach(() => {
  if (originalSessionSecret !== undefined) {
    process.env.WULIAN_SESSION_SECRET = originalSessionSecret;
  } else {
    delete process.env.WULIAN_SESSION_SECRET;
  }
});

// ----------------------------------------------------------------------------
// 属性 1：密码哈希→校验 正确性（需求 7.2）
// **Validates: Requirements 7.2**
// ----------------------------------------------------------------------------

describe('PBT: 密码哈希与校验属性', () => {
  it(
    '属性：任意合法密码 hash→verify 必正确',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbPassword, async (password) => {
          // 对密码进行哈希。
          const { hash, salt } = await hashPassword(password);

          // 用相同密码校验必成功。
          const verified = await verifyPassword(password, salt, hash);

          expect(verified).toBe(true);
        }),
        { numRuns: 50, verbose: true },
      );
    },
    30000,
  ); // 30s timeout for computationally intensive scrypt operations

  it(
    '属性：任意错误密码必被拒绝',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbPassword, arbPassword, async (correctPassword, wrongPassword) => {
          // 排除相同密码的情况（那不是"错误"密码）。
          fc.pre(correctPassword !== wrongPassword);

          // 对正确密码进行哈希。
          const { hash, salt } = await hashPassword(correctPassword);

          // 用错误密码校验必失败。
          const verified = await verifyPassword(wrongPassword, salt, hash);

          expect(verified).toBe(false);
        }),
        { numRuns: 20, verbose: true }, // Reduced to 20 runs due to 2x scrypt operations
      );
    },
    60000, // Increased to 60s for double-hash operations
  );

  it(
    '属性：相同密码 + 相同盐 → 哈希确定性（可重复验证）',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbPassword, async (password) => {
          // 第一次哈希。
          const { hash: hash1, salt } = await hashPassword(password);

          // 用相同盐再次哈希。
          const { hash: hash2 } = await hashPassword(password, salt);

          // 哈希结果必相同。
          expect(hash2).toBe(hash1);
        }),
        { numRuns: 20, verbose: true }, // Reduced to 20 runs due to 2x scrypt operations
      );
    },
    60000, // Increased to 60s for double-hash operations
  );

  it(
    '属性：相同密码 + 不同盐 → 哈希必不同（盐有效）',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbPassword, async (password) => {
          // 两次独立哈希（自动生成不同随机盐）。
          const { hash: hash1, salt: salt1 } = await hashPassword(password);
          const { hash: hash2, salt: salt2 } = await hashPassword(password);

          // 盐必不同，哈希也必不同。
          expect(salt1).not.toBe(salt2);
          expect(hash1).not.toBe(hash2);
        }),
        { numRuns: 10, verbose: true }, // Reduced to 10 runs due to 2x scrypt operations
      );
    },
    60000, // Increased to 60s for double-hash operations
  );
});

// ----------------------------------------------------------------------------
// 属性 2：会话 token 签发→校验 正确性（需求 7.3）
// **Validates: Requirements 7.3**
// ----------------------------------------------------------------------------

describe('PBT: 会话 token 签发与校验属性', () => {
  it(
    '属性：任意合法 userId 签发的 token 必可校验通过',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbUserId, arbMaxAgeSeconds, async (userId, maxAgeSeconds) => {
          // 签发 token。
          const token = await issueSessionToken(userId, { now: FIXED_NOW, maxAgeSeconds });

          // 立即校验必通过。
          const payload = await verifySessionToken(token, { now: FIXED_NOW });

          expect(payload).not.toBeNull();
          expect(payload?.userId).toBe(userId);
          expect(payload?.issuedAt).toBe(FIXED_NOW);
          expect(payload?.expiresAt).toBe(FIXED_NOW + maxAgeSeconds * 1000);
        }),
        { numRuns: 100, verbose: true },
      );
    },
    15000,
  );

  it(
    '属性：合法 token 在有效期内任意时刻均可校验通过',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          arbMaxAgeSeconds,
          fc.integer({ min: 0, max: 86400 }), // 0 到 maxAgeSeconds 之间的某个时刻（秒）
          async (userId, maxAgeSeconds, elapsedSeconds) => {
            // 排除已过期的情况。
            fc.pre(elapsedSeconds < maxAgeSeconds);

            // 签发 token。
            const token = await issueSessionToken(userId, { now: FIXED_NOW, maxAgeSeconds });

            // 在有效期内的某个时刻校验。
            const checkTime = FIXED_NOW + elapsedSeconds * 1000;
            const payload = await verifySessionToken(token, { now: checkTime });

            expect(payload).not.toBeNull();
            expect(payload?.userId).toBe(userId);
          },
        ),
        { numRuns: 100, verbose: true },
      );
    },
    15000,
  );

  it(
    '属性：token 过期后必被拒绝',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          arbMaxAgeSeconds,
          fc.integer({ min: 1, max: 3600 }), // 过期后 1 到 3600 秒
          async (userId, maxAgeSeconds, overflowSeconds) => {
            // 签发 token。
            const token = await issueSessionToken(userId, { now: FIXED_NOW, maxAgeSeconds });

            // 在过期后的某个时刻校验。
            const checkTime = FIXED_NOW + maxAgeSeconds * 1000 + overflowSeconds * 1000;
            const payload = await verifySessionToken(token, { now: checkTime });

            expect(payload).toBeNull();
          },
        ),
        { numRuns: 100, verbose: true },
      );
    },
    15000,
  );
});

// ----------------------------------------------------------------------------
// 属性 3：token 篡改必被拒绝（需求 12.2）
// **Validates: Requirements 12.2**
// ----------------------------------------------------------------------------

describe('PBT: 会话 token 篡改检测属性', () => {
  it(
    '属性：篡改载荷任意一位必被拒绝',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          fc.integer({ min: 0, max: 200 }), // 篡改位置（载荷通常几十到几百字符）
          async (userId, tamperIndex) => {
            // 签发 token。
            const token = await issueSessionToken(userId, { now: FIXED_NOW });
            const dotIndex = token.indexOf('.');
            const payload = token.substring(0, dotIndex);
            const signature = token.substring(dotIndex + 1);

            // 排除越界情况。
            fc.pre(tamperIndex < payload.length);

            // 篡改载荷的某一位（翻转字符）。
            const tamperedChar = payload[tamperIndex] === 'A' ? 'B' : 'A';
            const tamperedPayload =
              payload.substring(0, tamperIndex) + tamperedChar + payload.substring(tamperIndex + 1);
            const tamperedToken = `${tamperedPayload}.${signature}`;

            // 校验必失败。
            const result = await verifySessionToken(tamperedToken, { now: FIXED_NOW });

            expect(result).toBeNull();
          },
        ),
        { numRuns: 100, verbose: true },
      );
    },
    15000,
  );

  it(
    '属性：篡改签名任意一位必被拒绝',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          fc.integer({ min: 0, max: 63 }), // HMAC-SHA256 签名为 64 个 hex 字符
          async (userId, tamperIndex) => {
            // 签发 token。
            const token = await issueSessionToken(userId, { now: FIXED_NOW });
            const dotIndex = token.indexOf('.');
            const payload = token.substring(0, dotIndex);
            const signature = token.substring(dotIndex + 1);

            // 排除越界情况。
            fc.pre(tamperIndex < signature.length);

            // 篡改签名的某一位（翻转 hex 字符）。
            const tamperedChar = signature[tamperIndex] === 'a' ? 'b' : 'a';
            const tamperedSignature =
              signature.substring(0, tamperIndex) + tamperedChar + signature.substring(tamperIndex + 1);
            const tamperedToken = `${payload}.${tamperedSignature}`;

            // 校验必失败。
            const result = await verifySessionToken(tamperedToken, { now: FIXED_NOW });

            expect(result).toBeNull();
          },
        ),
        { numRuns: 100, verbose: true },
      );
    },
    15000,
  );

  it(
    '属性：插入/删除载荷或签名字符必被拒绝',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          fc.constantFrom('insert-payload', 'delete-payload', 'insert-signature', 'delete-signature'),
          fc.integer({ min: 0, max: 100 }),
          async (userId, operation, position) => {
            // 签发 token。
            const token = await issueSessionToken(userId, { now: FIXED_NOW });
            const dotIndex = token.indexOf('.');
            const payload = token.substring(0, dotIndex);
            const signature = token.substring(dotIndex + 1);

            let tamperedToken: string;

            if (operation === 'insert-payload') {
              fc.pre(position <= payload.length);
              const tamperedPayload = payload.substring(0, position) + 'X' + payload.substring(position);
              tamperedToken = `${tamperedPayload}.${signature}`;
            } else if (operation === 'delete-payload') {
              fc.pre(position < payload.length);
              const tamperedPayload = payload.substring(0, position) + payload.substring(position + 1);
              tamperedToken = `${tamperedPayload}.${signature}`;
            } else if (operation === 'insert-signature') {
              fc.pre(position <= signature.length);
              const tamperedSignature = signature.substring(0, position) + 'X' + signature.substring(position);
              tamperedToken = `${payload}.${tamperedSignature}`;
            } else {
              // delete-signature
              fc.pre(position < signature.length);
              const tamperedSignature = signature.substring(0, position) + signature.substring(position + 1);
              tamperedToken = `${payload}.${tamperedSignature}`;
            }

            // 校验必失败。
            const result = await verifySessionToken(tamperedToken, { now: FIXED_NOW });

            expect(result).toBeNull();
          },
        ),
        { numRuns: 100, verbose: true },
      );
    },
    15000,
  );

  it(
    '属性：交换载荷与签名位置必被拒绝',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbUserId, async (userId) => {
          // 签发 token。
          const token = await issueSessionToken(userId, { now: FIXED_NOW });
          const dotIndex = token.indexOf('.');
          const payload = token.substring(0, dotIndex);
          const signature = token.substring(dotIndex + 1);

          // 交换载荷与签名的位置。
          const swappedToken = `${signature}.${payload}`;

          // 校验必失败。
          const result = await verifySessionToken(swappedToken, { now: FIXED_NOW });

          expect(result).toBeNull();
        }),
        { numRuns: 50, verbose: true },
      );
    },
    10000,
  );
});
