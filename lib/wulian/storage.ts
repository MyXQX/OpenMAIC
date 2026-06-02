/**
 * 物联智讲 - 数据目录与文件存储辅助
 *
 * 所有运行时数据存到项目根的 data/wulian/，已通过 .gitignore 排除。
 * 文件操作集中在这里以方便后续替换为对象存储。
 *
 * 重构新增（按用户隔离存储，详见 design.md §3.6 / 需求 8）：
 *   data/wulian/users/<userId>/
 *     profile.json                          学生画像 + 个性化设置
 *     classrooms/<classroomId>.json         定制课堂实例
 *     uploads/<docId><ext>                  私有上传原文件
 *     vectors/<docId>.json                  上传文档 chunk + 向量
 *     feedback/<yyyymmdd>.jsonl             反馈日志
 *
 * 写入复用 MAIC `writeJsonFileAtomic`（temp + rename 原子写）避免半写文件。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';
import type { StudentProfile, WulianClassroomInstance } from './types';

/** 项目根目录下的数据根 */
export const DATA_ROOT = path.join(process.cwd(), 'data', 'wulian');
export const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');
export const VECTORS_DIR = path.join(DATA_ROOT, 'vectors');
export const FEEDBACK_DIR = path.join(DATA_ROOT, 'feedback');

/** 按用户隔离的存储根（每个登录用户一个子目录） */
export const USERS_DIR = path.join(DATA_ROOT, 'users');

/** 内置物理内容根 */
export const CONTENT_ROOT = path.join(process.cwd(), 'content', 'wulian');
export const CHAPTERS_DIR = path.join(CONTENT_ROOT, 'chapters');
export const SCIENTISTS_DIR = path.join(CONTENT_ROOT, 'scientists');
export const KNOWLEDGE_DIR = path.join(CONTENT_ROOT, 'knowledge');

/** 确保（全局/兼容旧版）数据目录存在 */
export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(VECTORS_DIR, { recursive: true });
  await fs.mkdir(FEEDBACK_DIR, { recursive: true });
}

/** 读取 JSON 文件；不存在时返回 fallback */
export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** 写入 JSON */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** 列出目录下的文件名（不递归），目录不存在时返回空数组 */
export async function listDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** 读取文本文件；不存在时返回空串 */
export async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 按用户隔离的存储（需求 8.1 / 8.2 / 8.3 / 8.6）
// ----------------------------------------------------------------------------

/**
 * 越权 / 归属校验失败时抛出的错误。路由层可据此返回 403。
 */
export class OwnershipError extends Error {
  constructor(message = '无权访问该资源') {
    super(message);
    this.name = 'OwnershipError';
  }
}

/** 非法标识符（userId/classroomId 等）时抛出，防止路径穿越。 */
export class InvalidIdError extends Error {
  constructor(message = '非法的标识符') {
    super(message);
    this.name = 'InvalidIdError';
  }
}

/**
 * 校验标识符是否安全可用于文件路径片段。
 * 仅允许字母、数字、下划线、连字符；限制长度，杜绝 `.`、`/`、`..` 等穿越字符。
 */
export function isValidUserId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[A-Za-z0-9_-]+$/.test(id);
}

/** 校验课堂实例 ID（与 userId 同样规则）。 */
export function isValidClassroomId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[A-Za-z0-9_-]+$/.test(id);
}

/** 断言 userId 合法，否则抛 {@link InvalidIdError}（防路径穿越）。 */
export function assertValidUserId(userId: string): void {
  if (!isValidUserId(userId)) {
    throw new InvalidIdError(`非法的 userId: ${String(userId)}`);
  }
}

/** 断言 classroomId 合法，否则抛 {@link InvalidIdError}。 */
export function assertValidClassroomId(classroomId: string): void {
  if (!isValidClassroomId(classroomId)) {
    throw new InvalidIdError(`非法的 classroomId: ${String(classroomId)}`);
  }
}

// --- 按用户隔离的路径构造（均做 userId 合法性校验，防穿越） -----------------

/** 某用户的存储根目录：data/wulian/users/<userId> */
export function userDir(userId: string): string {
  assertValidUserId(userId);
  return path.join(USERS_DIR, userId);
}

/** 学生画像文件：users/<userId>/profile.json */
export function userProfilePath(userId: string): string {
  return path.join(userDir(userId), 'profile.json');
}

/** 定制课堂实例目录：users/<userId>/classrooms/ */
export function userClassroomsDir(userId: string): string {
  return path.join(userDir(userId), 'classrooms');
}

/** 单个定制课堂实例文件：users/<userId>/classrooms/<classroomId>.json */
export function userClassroomPath(userId: string, classroomId: string): string {
  assertValidClassroomId(classroomId);
  return path.join(userClassroomsDir(userId), `${classroomId}.json`);
}

/** 私有上传原文件目录：users/<userId>/uploads/ */
export function userUploadsDir(userId: string): string {
  return path.join(userDir(userId), 'uploads');
}

/** 上传文档向量目录：users/<userId>/vectors/ */
export function userVectorsDir(userId: string): string {
  return path.join(userDir(userId), 'vectors');
}

/** 反馈日志目录：users/<userId>/feedback/ */
export function userFeedbackDir(userId: string): string {
  return path.join(userDir(userId), 'feedback');
}

/**
 * 确保某用户的隔离目录结构存在。
 * 创建 classrooms/ uploads/ vectors/ feedback/ 子目录（profile.json 为文件，写入时按需创建）。
 */
export async function ensureUserDirs(userId: string): Promise<void> {
  assertValidUserId(userId);
  await Promise.all([
    fs.mkdir(userClassroomsDir(userId), { recursive: true }),
    fs.mkdir(userUploadsDir(userId), { recursive: true }),
    fs.mkdir(userVectorsDir(userId), { recursive: true }),
    fs.mkdir(userFeedbackDir(userId), { recursive: true }),
  ]);
}

// --- 原子读写封装（复用 MAIC writeJsonFileAtomic） ---------------------------

/** 复用 MAIC 的原子写（temp + rename），对外再导出便于其它 wulian 模块共享。 */
export { writeJsonFileAtomic };

/**
 * 原子写入用户隔离的 JSON 文件。
 * 复用 MAIC `writeJsonFileAtomic`（temp + rename）确保不产生半写文件（需求 8.2）。
 */
export async function writeUserJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await writeJsonFileAtomic(filePath, data);
}

/** 读取用户隔离的 JSON 文件；不存在时返回 null。 */
export async function readUserJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

// --- 归属（owner）校验工具（需求 8.3） --------------------------------------

/**
 * 判断某资源是否归属于指定用户。
 * `ownerId` 为资源记录上的归属字段（如 `WulianClassroomInstance.owner` 或
 * `StudentProfile.userId`）。归属字段缺失或不匹配均判为「不归属」。
 */
export function isOwnedBy(ownerId: string | null | undefined, userId: string): boolean {
  return typeof ownerId === 'string' && ownerId.length > 0 && ownerId === userId;
}

/**
 * 断言资源归属于指定用户，否则抛 {@link OwnershipError}。
 * 读取按用户隔离的数据时调用，拒绝越权访问他人数据（需求 8.3）。
 */
export function assertOwnership(ownerId: string | null | undefined, userId: string): void {
  if (!isOwnedBy(ownerId, userId)) {
    throw new OwnershipError();
  }
}

// --- 学生画像读写（需求 8.1 / 9.1） -----------------------------------------

/**
 * 读取某用户的学生画像；不存在时返回 null。
 * 读取后校验归属（profile.userId 必须等于 userId），防止数据被篡改为他人归属。
 */
export async function readProfile(userId: string): Promise<StudentProfile | null> {
  assertValidUserId(userId);
  const profile = await readUserJson<StudentProfile>(userProfilePath(userId));
  if (profile === null) return null;
  assertOwnership(profile.userId, userId);
  return profile;
}

/**
 * 原子写入某用户的学生画像。
 * 以 `profile.userId` 作为隔离键，确保只写入该用户自己的目录。
 */
export async function writeProfile(profile: StudentProfile): Promise<void> {
  assertValidUserId(profile.userId);
  await writeUserJsonAtomic(userProfilePath(profile.userId), profile);
}

// --- 定制课堂实例读写（需求 4.6 / 8.1 / 8.3 / 8.6） --------------------------

/**
 * 把 wulian 定制课堂实例投影为 MAIC `PersistedClassroomData`。
 *
 * `WulianClassroomInstance` 在结构上是 `PersistedClassroomData` 的超集
 * （`id` / `stage` / `scenes` / `createdAt` 字段同源于 `@/lib/types/stage`），
 * 额外扩展了 `owner` / `chapterId` / `personalization` / `simulators` 等 wulian 元数据
 * （需求 8.6）。此函数用于需要纯 MAIC 结构（如导出、复用 MAIC 回放）的场景。
 */
export function toPersistedClassroomData(instance: WulianClassroomInstance): PersistedClassroomData {
  return {
    id: instance.id,
    stage: instance.stage,
    scenes: instance.scenes,
    createdAt: instance.createdAt,
  };
}

/**
 * 原子写入某用户的定制课堂实例（需求 4.6 / 8.1 / 8.2 / 8.6）。
 *
 * - 以 `instance.owner` 作为隔离键，确保实例只落到该用户自己的目录下，
 *   配合 {@link userClassroomPath} 对 `owner`/`id` 做合法性校验，杜绝路径穿越。
 * - 复用 MAIC `writeJsonFileAtomic`（temp + rename）避免半写文件。
 * - 存储结构兼容 `PersistedClassroomData` 并附带 wulian 元数据。
 */
export async function saveClassroomInstance(instance: WulianClassroomInstance): Promise<void> {
  assertValidUserId(instance.owner);
  assertValidClassroomId(instance.id);
  await writeUserJsonAtomic(userClassroomPath(instance.owner, instance.id), instance);
}

/**
 * 读取某用户的定制课堂实例，并校验归属（需求 8.3）。
 *
 * - 文件不存在时返回 `null`。
 * - 读取成功后校验 `instance.owner === userId`，若被篡改为他人归属则抛
 *   {@link OwnershipError}，拒绝越权访问他人数据。
 */
export async function getClassroomInstance(
  userId: string,
  classroomId: string,
): Promise<WulianClassroomInstance | null> {
  assertValidUserId(userId);
  assertValidClassroomId(classroomId);
  const instance = await readUserJson<WulianClassroomInstance>(
    userClassroomPath(userId, classroomId),
  );
  if (instance === null) return null;
  assertOwnership(instance.owner, userId);
  return instance;
}

/**
 * 列出某用户（owner）的定制课堂实例，可选按 `chapterId` 过滤（需求 4.1 / 8.3）。
 *
 * - 仅扫描该 owner 自己的 `classrooms/` 目录，天然按用户隔离。
 * - 逐个读取实例并校验归属；归属不符的文件被跳过（防御性，正常情况下不应出现）。
 * - 目录不存在（用户尚无任何实例）时返回空数组。
 * - 结果按 `updatedAt` 倒序（最近更新在前），便于「最近课堂」展示。
 */
export async function listClassroomInstances(
  owner: string,
  chapterId?: string,
): Promise<WulianClassroomInstance[]> {
  assertValidUserId(owner);
  const dir = userClassroomsDir(owner);
  const entries = await listDir(dir);

  const instances: WulianClassroomInstance[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const instance = await readUserJson<WulianClassroomInstance>(path.join(dir, entry));
    if (instance === null) continue;
    // 跳过归属不符的实例（防御性校验，拒绝越权暴露他人数据）。
    if (!isOwnedBy(instance.owner, owner)) continue;
    if (chapterId !== undefined && instance.chapterId !== chapterId) continue;
    instances.push(instance);
  }

  instances.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return instances;
}
