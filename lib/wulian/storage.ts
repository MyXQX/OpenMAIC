/**
 * 物联智讲 - 数据目录与文件存储辅助
 *
 * 所有运行时数据存到项目根的 data/wulian/，已通过 .gitignore 排除。
 * 文件操作集中在这里以方便后续替换为对象存储。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 项目根目录下的数据根 */
export const DATA_ROOT = path.join(process.cwd(), 'data', 'wulian');
export const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');
export const VECTORS_DIR = path.join(DATA_ROOT, 'vectors');
export const FEEDBACK_DIR = path.join(DATA_ROOT, 'feedback');

/** 内置物理内容根 */
export const CONTENT_ROOT = path.join(process.cwd(), 'content', 'wulian');
export const CHAPTERS_DIR = path.join(CONTENT_ROOT, 'chapters');
export const SCIENTISTS_DIR = path.join(CONTENT_ROOT, 'scientists');
export const KNOWLEDGE_DIR = path.join(CONTENT_ROOT, 'knowledge');

/** 确保数据目录存在 */
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
