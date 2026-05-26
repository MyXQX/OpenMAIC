/**
 * 科学家 persona 加载器
 *
 * Persona 数据放在 content/wulian/scientists/<id>.json，便于内容编辑者用纯文本维护。
 */

import path from 'node:path';
import { SCIENTISTS_DIR, listDir, readJson } from '@/lib/wulian/storage';
import type { ScientistPersona } from '@/lib/wulian/types';

let memoryCache: Map<string, ScientistPersona> | null = null;

export async function loadAllPersonas(): Promise<Map<string, ScientistPersona>> {
  if (memoryCache) return memoryCache;
  const map = new Map<string, ScientistPersona>();
  const files = await listDir(SCIENTISTS_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const persona = await readJson<ScientistPersona | null>(
      path.join(SCIENTISTS_DIR, file),
      null,
    );
    if (persona && persona.id) map.set(persona.id, persona);
  }
  memoryCache = map;
  return map;
}

export async function getPersona(id: string): Promise<ScientistPersona | null> {
  const all = await loadAllPersonas();
  return all.get(id) ?? null;
}

/** 单元测试或运行时换内容时清缓存 */
export function clearPersonaCache(): void {
  memoryCache = null;
}
