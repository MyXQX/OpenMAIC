import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  hashPassword,
  verifyPassword,
  registerAccount,
  verifyCredentials,
  getAccountById,
  isUsernameTaken,
  toPublicAccount,
  normalizeUsername,
  createJsonFileAccountStore,
  createInMemoryAccountStore,
  UsernameConflictError,
  InvalidAccountInputError,
} from '@/lib/wulian/auth/accounts';
import type { UserAccount } from '@/lib/wulian/types';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Track temp account files so we can clean them up after each test. */
const tempFiles = new Set<string>();

async function makeTempAccountsFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wulian-accounts-'));
  const file = path.join(dir, 'accounts.json');
  tempFiles.add(file);
  return file;
}

afterEach(async () => {
  for (const file of tempFiles) {
    try {
      await fs.rm(path.dirname(file), { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tempFiles.clear();
});

// ----------------------------------------------------------------------------
// Password hashing & verification (req 7.2, 12.2, 12.4)
// ----------------------------------------------------------------------------

describe('密码哈希与校验（scrypt 加盐）', () => {
  it('hashPassword 生成 hex 哈希与盐，且绝不等于明文', async () => {
    const { hash, salt } = await hashPassword('s3cret-pw');
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(hash).not.toContain('s3cret-pw');
    // 64 字节派生密钥 → 128 个 hex 字符。
    expect(hash).toHaveLength(128);
  });

  it('相同密码 + 不同随机盐 → 不同哈希（盐生效）', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a.salt).not.toEqual(b.salt);
    expect(a.hash).not.toEqual(b.hash);
  });

  it('相同密码 + 相同盐 → 相同哈希（确定性，可校验）', async () => {
    const { hash, salt } = await hashPassword('repeatable');
    const again = await hashPassword('repeatable', salt);
    expect(again.hash).toEqual(hash);
    expect(again.salt).toEqual(salt);
  });

  it('verifyPassword：正确密码通过，错误密码必拒', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', salt, hash)).toBe(true);
    expect(await verifyPassword('wrong horse', salt, hash)).toBe(false);
    expect(await verifyPassword('', salt, hash)).toBe(false);
  });

  it('verifyPassword：损坏/空哈希一律返回 false 而不抛错', async () => {
    const { salt } = await hashPassword('x');
    expect(await verifyPassword('x', salt, '')).toBe(false);
    expect(await verifyPassword('x', salt, 'zzzz')).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Username normalization & public projection (req 12.4)
// ----------------------------------------------------------------------------

describe('用户名规范化与安全视图', () => {
  it('normalizeUsername 去除首尾空白', () => {
    expect(normalizeUsername('  alice  ')).toBe('alice');
  });

  it('toPublicAccount 剥离 passwordHash / salt（不回显敏感值）', () => {
    const account: UserAccount = {
      id: 'u1',
      username: 'bob',
      passwordHash: 'deadbeef',
      salt: 'cafe',
      createdAt: 123,
    };
    const pub = toPublicAccount(account);
    expect(pub).toEqual({ id: 'u1', username: 'bob', createdAt: 123 });
    expect(pub as Record<string, unknown>).not.toHaveProperty('passwordHash');
    expect(pub as Record<string, unknown>).not.toHaveProperty('salt');
  });
});

// ----------------------------------------------------------------------------
// Registration & credential verification (req 7.1, 7.2, 7.7)
// ----------------------------------------------------------------------------

describe('注册与登录凭据校验（JSON 文件账号表）', () => {
  it('注册成功返回安全视图，且密码以哈希落盘（非明文）', async () => {
    const file = await makeTempAccountsFile();
    const store = createJsonFileAccountStore(file);

    const pub = await registerAccount('Alice', 'my-password', store);
    expect(pub.username).toBe('Alice');
    expect(pub.id).toBeTruthy();
    expect(pub as Record<string, unknown>).not.toHaveProperty('passwordHash');

    // 落盘文件中绝不包含明文密码。
    const raw = await fs.readFile(file, 'utf-8');
    expect(raw).not.toContain('my-password');
    const parsed = JSON.parse(raw) as { accounts: UserAccount[] };
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0].passwordHash).toMatch(/^[0-9a-f]+$/);
    expect(parsed.accounts[0].salt).toMatch(/^[0-9a-f]+$/);
  });

  it('注册后可用正确密码登录，错误密码被拒', async () => {
    const store = createInMemoryAccountStore();
    await registerAccount('carol', 'pw-123', store);

    const ok = await verifyCredentials('carol', 'pw-123', store);
    expect(ok?.username).toBe('carol');

    expect(await verifyCredentials('carol', 'wrong', store)).toBeNull();
    expect(await verifyCredentials('nobody', 'pw-123', store)).toBeNull();
  });

  it('用户名唯一性：重复注册抛 UsernameConflictError，不覆盖既有账号', async () => {
    const store = createInMemoryAccountStore();
    const first = await registerAccount('dave', 'first-pw', store);

    await expect(registerAccount('dave', 'second-pw', store)).rejects.toBeInstanceOf(
      UsernameConflictError,
    );

    // 既有账号未被覆盖：原密码仍可登录，新密码不行。
    const ok = await verifyCredentials('dave', 'first-pw', store);
    expect(ok?.id).toBe(first.id);
    expect(await verifyCredentials('dave', 'second-pw', store)).toBeNull();
  });

  it('用户名唯一性大小写不敏感（Eve 与 eve 视为同一用户名）', async () => {
    const store = createInMemoryAccountStore();
    await registerAccount('Eve', 'pw', store);
    await expect(registerAccount('eve', 'pw2', store)).rejects.toBeInstanceOf(
      UsernameConflictError,
    );
    expect(await isUsernameTaken('EVE', store)).toBe(true);
    expect(await isUsernameTaken('frank', store)).toBe(false);
  });

  it('非法入参（空用户名/空密码/超长用户名）抛 InvalidAccountInputError', async () => {
    const store = createInMemoryAccountStore();
    await expect(registerAccount('   ', 'pw', store)).rejects.toBeInstanceOf(
      InvalidAccountInputError,
    );
    await expect(registerAccount('ok', '', store)).rejects.toBeInstanceOf(InvalidAccountInputError);
    await expect(registerAccount('a'.repeat(65), 'pw', store)).rejects.toBeInstanceOf(
      InvalidAccountInputError,
    );
  });

  it('用户名首尾空白被规范化后存储', async () => {
    const store = createInMemoryAccountStore();
    const pub = await registerAccount('  grace  ', 'pw', store);
    expect(pub.username).toBe('grace');
    expect(await verifyCredentials('grace', 'pw', store)).not.toBeNull();
  });

  it('getAccountById 返回安全视图，未知 id 返回 null', async () => {
    const store = createInMemoryAccountStore();
    const pub = await registerAccount('heidi', 'pw', store);
    const fetched = await getAccountById(pub.id, store);
    expect(fetched).toEqual(pub);
    expect(await getAccountById('does-not-exist', store)).toBeNull();
  });

  it('JSON 文件存储跨实例持久化：注册后由新 store 实例仍可登录', async () => {
    const file = await makeTempAccountsFile();
    await registerAccount('ivan', 'pw-persist', createJsonFileAccountStore(file));

    // 新建一个指向同一文件的 store，模拟进程重启 / 不同请求。
    const reopened = createJsonFileAccountStore(file);
    expect(await verifyCredentials('ivan', 'pw-persist', reopened)).not.toBeNull();
  });

  it('JSON 文件存储并发插入不同用户名：全部成功且无丢失（串行化锁）', async () => {
    const file = await makeTempAccountsFile();
    const store = createJsonFileAccountStore(file);

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerAccount(`user${i}`, `pw${i}`, store)),
    );

    const all = await store.list();
    expect(all).toHaveLength(10);
    expect(new Set(all.map((a) => a.username)).size).toBe(10);
  });
});
