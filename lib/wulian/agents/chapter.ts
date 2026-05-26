/**
 * 章节加载器
 */

import path from 'node:path';
import { CHAPTERS_DIR, listDir, readJson } from '@/lib/wulian/storage';
import type { Chapter } from '@/lib/wulian/types';

let memoryCache: Map<string, Chapter> | null = null;

export async function loadAllChapters(): Promise<Chapter[]> {
  if (memoryCache) return Array.from(memoryCache.values());
  const map = new Map<string, Chapter>();
  const files = await listDir(CHAPTERS_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const ch = await readJson<Chapter | null>(path.join(CHAPTERS_DIR, file), null);
    if (ch && ch.id) map.set(ch.id, ch);
  }
  memoryCache = map;
  return Array.from(map.values());
}

export async function getChapter(id: string): Promise<Chapter | null> {
  await loadAllChapters();
  return memoryCache?.get(id) ?? null;
}

export function clearChapterCache(): void {
  memoryCache = null;
}
