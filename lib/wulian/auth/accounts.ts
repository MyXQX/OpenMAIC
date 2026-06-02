/**
 * 物联智讲 - 账号存储与密码哈希（Auth / accounts）
 *
 * 职责（需求 7.1 / 7.2 / 7.7 / 12.4）：
 *   - 账号记录持久化：默认 JSON 文件账号表（`data/wulian/accounts.json`），
 *     通过可插拔的 {@link AccountStore} 接口预留 SQLite/外部 DB 替换空间。
 *   - 密码安全：使用 Node 内置 `crypto.scrypt` + 每账号随机盐做加盐哈希，
 *     校验时用定长比较（`timingSafeEqual`）降低时序攻击风险，绝不存储/回显明文。
 *   - 用户名唯一性：注册时做（大小写不敏感）唯一性校验，冲突抛
 *     {@link UsernameConflictError} 而非覆盖既有账号。
 *
 * 安全约束（需求 12.4）：对外仅暴露 {@link PublicAccount}（id/username/createdAt），
 *   绝不向响应或日志返回 `passwordHash` / `salt`。
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { nanoid } from 'nanoid';
import { DATA_ROOT, writeJsonFileAtomic } from '@/lib/wulian/storage';
import type { UserAccount } from '@/lib/wulian/types';

const scrypt = promisify(scryptCb);

// ----------------------------------------------------------------------------
// 常量
// ----------------------------------------------------------------------------

/** 默认账号表文件：data/wulian/accounts.json（可换 SQLite/外部 DB，见 {@link AccountStore}）。 */
export const ACCOUNTS_FILE = path.join(DATA_ROOT, 'accounts.json');

/** 随机盐字节数（以 hex 存储 → 32 个字符）。 */
const SALT_BYTES = 16;
/** scrypt 派生密钥长度（字节）。 */
const KEY_LENGTH = 64;
/**
 * scrypt 代价参数。N=2^14 时内存约 16MB（128*N*r），在 Node 默认 maxmem(32MB) 之内，
 * 兼顾安全性与单机自托管的响应速度。
 */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** 用户名最大长度（去除首尾空白后）。 */
const MAX_USERNAME_LENGTH = 64;

// ----------------------------------------------------------------------------
// 错误类型
// ----------------------------------------------------------------------------

/** 注册时用户名已存在（需求 7.7）。路由层据此返回明确的冲突错误码。 */
export class UsernameConflictError extends Error {
  constructor(username: string) {
    super(`用户名已存在: ${username}`);
    this.name = 'UsernameConflictError';
  }
}

/** 注册/登录入参非法（空用户名/空密码/超长用户名等）。 */
export class InvalidAccountInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAccountInputError';
  }
}

// ----------------------------------------------------------------------------
// 对外安全视图（绝不包含 passwordHash / salt，需求 12.4）
// ----------------------------------------------------------------------------

/** 账号的对外安全视图：只含非敏感字段，可安全地返回给客户端/写入日志。 */
export interface PublicAccount {
  id: string;
  username: string;
  createdAt: number;
}

/** 把内部账号记录投影为对外安全视图，剥离 passwordHash / salt（需求 12.4）。 */
export function toPublicAccount(account: UserAccount): PublicAccount {
  return { id: account.id, username: account.username, createdAt: account.createdAt };
}

// ----------------------------------------------------------------------------
// 用户名规范化与校验
// ----------------------------------------------------------------------------

/** 去除首尾空白后的用户名（用于存储的显示形态）。 */
export function normalizeUsername(username: string): string {
  return username.trim();
}

/** 用户名唯一性比较键：大小写不敏感（避免 "Alice" 与 "alice" 同时存在）。 */
function usernameKey(username: string): string {
  return normalizeUsername(username).toLowerCase();
}

/** 校验用户名合法性，非法时抛 {@link InvalidAccountInputError}。返回规范化后的用户名。 */
function validateUsername(username: unknown): string {
  if (typeof username !== 'string') {
    throw new InvalidAccountInputError('用户名必须为字符串');
  }
  const normalized = normalizeUsername(username);
  if (normalized.length === 0) {
    throw new InvalidAccountInputError('用户名不能为空');
  }
  if (normalized.length > MAX_USERNAME_LENGTH) {
    throw new InvalidAccountInputError(`用户名长度不能超过 ${MAX_USERNAME_LENGTH} 个字符`);
  }
  // 拒绝控制字符（含换行/制表），避免存储与展示异常。
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new InvalidAccountInputError('用户名包含非法字符');
  }
  return normalized;
}

/** 校验密码合法性（非空）。密码可含空格，故不做 trim。 */
function validatePassword(password: unknown): string {
  if (typeof password !== 'string') {
    throw new InvalidAccountInputError('密码必须为字符串');
  }
  if (password.length === 0) {
    throw new InvalidAccountInputError('密码不能为空');
  }
  return password;
}

// ----------------------------------------------------------------------------
// 密码哈希（scrypt 加盐 + 定长比较）
// ----------------------------------------------------------------------------

/**
 * 用 scrypt 对密码做加盐哈希。
 * - 未提供 `salt` 时随机生成一个新盐（注册场景）。
 * - 提供 `salt` 时复用该盐（校验场景需用同盐重算）。
 * 密码先做 Unicode 规范化（NFKC），保证不同输入法/组合形式的等价文本一致。
 *
 * @returns `{ hash, salt }`，均为十六进制字符串。
 */
export async function hashPassword(
  password: string,
  salt: string = randomBytes(SALT_BYTES).toString('hex'),
): Promise<{ hash: string; salt: string }> {
  const derived = (await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH)) as Buffer;
  return { hash: derived.toString('hex'), salt };
}

/**
 * 校验明文密码是否与存储的哈希匹配（需求 7.2 / 12.2）。
 * 用相同盐重算后以 `timingSafeEqual` 定长比较，降低时序攻击风险。
 * 任意异常（如哈希格式损坏）一律视为不匹配，绝不抛出敏感信息。
 */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  try {
    const { hash } = await hashPassword(password, salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    // 长度不同则 timingSafeEqual 会抛错；先判长度再比较。
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// 可插拔账号存储接口（预留 SQLite / 外部 DB）
// ----------------------------------------------------------------------------

/**
 * 账号存储抽象。默认实现为 JSON 文件（见 {@link createJsonFileAccountStore}），
 * 后续可替换为 SQLite / 外部 DB 而不影响上层注册/登录逻辑（设计 §3.5「可插拔」）。
 *
 * 实现需保证 {@link AccountStore.findByUsername} 的查找与
 * {@link AccountStore.insert} 的唯一性约束在并发下的一致性。
 */
export interface AccountStore {
  /** 按用户名查找（大小写不敏感）；未找到返回 null。 */
  findByUsername(username: string): Promise<UserAccount | null>;
  /** 按账号 id 查找；未找到返回 null。 */
  findById(id: string): Promise<UserAccount | null>;
  /**
   * 插入新账号。若用户名（大小写不敏感）已存在则抛 {@link UsernameConflictError}，
   * 不覆盖既有账号（需求 7.7）。
   */
  insert(account: UserAccount): Promise<void>;
  /** 列出全部账号（管理/迁移用途）。 */
  list(): Promise<UserAccount[]>;
}

/** accounts.json 的磁盘结构（含版本号便于后续迁移）。 */
interface AccountsFile {
  version: 1;
  accounts: UserAccount[];
}

const EMPTY_ACCOUNTS_FILE: AccountsFile = { version: 1, accounts: [] };

/**
 * 创建基于 JSON 文件的账号存储（默认实现）。
 *
 * - 读改写采用进程内串行化锁，避免同进程并发 `insert` 互相覆盖。
 * - 写入复用 MAIC `writeJsonFileAtomic`（temp + rename）避免半写文件。
 *
 * @param filePath 账号表文件路径，默认 {@link ACCOUNTS_FILE}。测试可传入临时路径隔离。
 */
export function createJsonFileAccountStore(filePath: string = ACCOUNTS_FILE): AccountStore {
  // 进程内写串行化：把每次读改写排到上一次之后，杜绝同进程并发竞态。
  let writeChain: Promise<unknown> = Promise.resolve();

  async function readFile(): Promise<AccountsFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AccountsFile>;
      return {
        version: 1,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ...EMPTY_ACCOUNTS_FILE, accounts: [] };
      }
      throw err;
    }
  }

  /** 串行执行一次「读 → 变更 → 原子写」事务。 */
  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn);
    // 维持链条但吞掉错误，避免一次失败污染后续操作。
    writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    async findByUsername(username: string): Promise<UserAccount | null> {
      const key = usernameKey(username);
      const { accounts } = await readFile();
      return accounts.find((a) => usernameKey(a.username) === key) ?? null;
    },

    async findById(id: string): Promise<UserAccount | null> {
      const { accounts } = await readFile();
      return accounts.find((a) => a.id === id) ?? null;
    },

    async insert(account: UserAccount): Promise<void> {
      await withLock(async () => {
        const file = await readFile();
        const key = usernameKey(account.username);
        if (file.accounts.some((a) => usernameKey(a.username) === key)) {
          throw new UsernameConflictError(account.username);
        }
        file.accounts.push(account);
        await writeJsonFileAtomic(filePath, file);
      });
    },

    async list(): Promise<UserAccount[]> {
      const { accounts } = await readFile();
      return accounts;
    },
  };
}

/**
 * 创建内存账号存储（测试 / 临时场景用）。语义与 JSON 文件实现一致，但不落盘。
 */
export function createInMemoryAccountStore(initial: UserAccount[] = []): AccountStore {
  const accounts: UserAccount[] = [...initial];
  return {
    async findByUsername(username: string) {
      const key = usernameKey(username);
      return accounts.find((a) => usernameKey(a.username) === key) ?? null;
    },
    async findById(id: string) {
      return accounts.find((a) => a.id === id) ?? null;
    },
    async insert(account: UserAccount) {
      const key = usernameKey(account.username);
      if (accounts.some((a) => usernameKey(a.username) === key)) {
        throw new UsernameConflictError(account.username);
      }
      accounts.push(account);
    },
    async list() {
      return [...accounts];
    },
  };
}

/** 默认账号存储（JSON 文件）。上层 API 默认使用，可在调用处注入替换。 */
export const defaultAccountStore: AccountStore = createJsonFileAccountStore();

// ----------------------------------------------------------------------------
// 高层 API：注册 / 凭据校验 / 查询
// ----------------------------------------------------------------------------

/**
 * 注册新账号（需求 7.1 / 7.2 / 7.7）。
 *
 * 流程：校验入参 → 唯一性预检 → scrypt 加盐哈希 → 原子插入（插入时再次唯一性校验，
 * 防 TOCTOU 竞态）。成功返回对外安全视图（不含哈希/盐，需求 12.4）。
 *
 * @throws {InvalidAccountInputError} 用户名/密码非法。
 * @throws {UsernameConflictError} 用户名已存在。
 */
export async function registerAccount(
  username: string,
  password: string,
  store: AccountStore = defaultAccountStore,
): Promise<PublicAccount> {
  const normalizedUsername = validateUsername(username);
  const validPassword = validatePassword(password);

  // 唯一性预检（快速失败 + 友好错误）；最终一致性由 store.insert 兜底。
  const existing = await store.findByUsername(normalizedUsername);
  if (existing) {
    throw new UsernameConflictError(normalizedUsername);
  }

  const { hash, salt } = await hashPassword(validPassword);
  const account: UserAccount = {
    id: nanoid(),
    username: normalizedUsername,
    passwordHash: hash,
    salt,
    createdAt: Date.now(),
  };

  await store.insert(account);
  return toPublicAccount(account);
}

/**
 * 校验用户名 + 密码（登录用，需求 7.2）。
 * 成功返回对外安全视图；用户名不存在或密码错误一律返回 `null`（不区分，避免泄露账号是否存在）。
 */
export async function verifyCredentials(
  username: string,
  password: string,
  store: AccountStore = defaultAccountStore,
): Promise<PublicAccount | null> {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length === 0) {
    return null;
  }
  const account = await store.findByUsername(normalizeUsername(username));
  if (!account) return null;

  const ok = await verifyPassword(password, account.salt, account.passwordHash);
  return ok ? toPublicAccount(account) : null;
}

/** 按 id 查询账号的对外安全视图；不存在返回 null。 */
export async function getAccountById(
  id: string,
  store: AccountStore = defaultAccountStore,
): Promise<PublicAccount | null> {
  const account = await store.findById(id);
  return account ? toPublicAccount(account) : null;
}

/** 用户名是否已被占用（大小写不敏感，需求 7.7）。 */
export async function isUsernameTaken(
  username: string,
  store: AccountStore = defaultAccountStore,
): Promise<boolean> {
  if (typeof username !== 'string' || normalizeUsername(username).length === 0) return false;
  return (await store.findByUsername(normalizeUsername(username))) !== null;
}
