/**
 * 极简向量存储（JSON 持久化）
 *
 * 不引入 Chroma 等服务依赖。把每个 corpus 的 chunks 存到一个 JSON 文件。
 * - 内置课程语料：content/wulian/knowledge/<chapter>.json （由 build-content 脚本预生成）
 * - 上传资料（全局，已弃用）：data/wulian/vectors/<docId>.json
 * - 上传资料（按用户隔离，需求 8.1 / task 5.1）：data/wulian/users/<userId>/vectors/<docId>.json
 *
 * 检索：embedding 存在时余弦排序；不存在时关键词打分（需求 2.4）。
 */

import path from 'node:path';
import { createLogger } from '@/lib/logger';
import type { DocumentChunk, RetrievedChunk } from '@/lib/wulian/types';
import {
  CHAPTERS_DIR,
  KNOWLEDGE_DIR,
  VECTORS_DIR,
  readJson,
  writeJson,
  userVectorsDir,
  assertValidUserId,
} from '@/lib/wulian/storage';
import { cosineSim, embedTexts, keywordScore } from './embed';

const log = createLogger('Wulian RAG');

interface ChapterCorpus {
  chapterId: string;
  chunks: DocumentChunk[];
}

interface UploadCorpus {
  docId: string;
  filename: string;
  chunks: DocumentChunk[];
}

const memoryCache = new Map<string, DocumentChunk[]>();

function chapterCorpusPath(chapterId: string): string {
  return path.join(KNOWLEDGE_DIR, `${chapterId}.json`);
}

function uploadCorpusPath(docId: string): string {
  return path.join(VECTORS_DIR, `${docId}.json`);
}

/** 按用户隔离的上传资料路径（需求 8.1 / task 5.1） */
function userUploadCorpusPath(userId: string, docId: string): string {
  assertValidUserId(userId);
  return path.join(userVectorsDir(userId), `${docId}.json`);
}

/** 加载某章节的内置语料块 */
export async function loadChapterCorpus(chapterId: string): Promise<DocumentChunk[]> {
  const cacheKey = `chapter:${chapterId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const corpus = await readJson<ChapterCorpus | null>(chapterCorpusPath(chapterId), null);
  if (!corpus) {
    log.warn(`No corpus for chapter ${chapterId} (run pnpm wulian:build-content)`);
    return [];
  }
  memoryCache.set(cacheKey, corpus.chunks);
  return corpus.chunks;
}

export async function saveChapterCorpus(chapterId: string, chunks: DocumentChunk[]): Promise<void> {
  await writeJson(chapterCorpusPath(chapterId), { chapterId, chunks });
  memoryCache.set(`chapter:${chapterId}`, chunks);
}

/** 保存上传文档的 chunks（全局，已弃用，保留以兼容旧代码） */
export async function saveUploadCorpus(corpus: UploadCorpus): Promise<void> {
  await writeJson(uploadCorpusPath(corpus.docId), corpus);
  memoryCache.set(`upload:${corpus.docId}`, corpus.chunks);
}

/** 保存上传文档的 chunks（按用户隔离，需求 8.1 / task 5.1） */
export async function saveUserUploadCorpus(userId: string, corpus: UploadCorpus): Promise<void> {
  assertValidUserId(userId);
  await writeJson(userUploadCorpusPath(userId, corpus.docId), corpus);
  // 缓存键带 userId 避免跨用户污染
  memoryCache.set(`upload:${userId}:${corpus.docId}`, corpus.chunks);
}

export async function loadUploadCorpus(docId: string): Promise<UploadCorpus | null> {
  return await readJson<UploadCorpus | null>(uploadCorpusPath(docId), null);
}

/** 加载用户隔离的上传语料（需求 8.1 / task 5.1） */
export async function loadUserUploadCorpus(
  userId: string,
  docId: string,
): Promise<UploadCorpus | null> {
  assertValidUserId(userId);
  return await readJson<UploadCorpus | null>(userUploadCorpusPath(userId, docId), null);
}

export async function loadUploadChunks(docId: string): Promise<DocumentChunk[]> {
  const cacheKey = `upload:${docId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;
  const corpus = await loadUploadCorpus(docId);
  if (!corpus) return [];
  memoryCache.set(cacheKey, corpus.chunks);
  return corpus.chunks;
}

/** 加载用户隔离的上传文档 chunks（需求 8.1 / task 5.1） */
export async function loadUserUploadChunks(userId: string, docId: string): Promise<DocumentChunk[]> {
  assertValidUserId(userId);
  const cacheKey = `upload:${userId}:${docId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;
  const corpus = await loadUserUploadCorpus(userId, docId);
  if (!corpus) return [];
  memoryCache.set(cacheKey, corpus.chunks);
  return corpus.chunks;
}

/** 从一组 chunks 中按 query 召回 topK */
export async function searchChunks(params: {
  query: string;
  chunks: DocumentChunk[];
  topK: number;
  source: 'builtin' | 'uploaded';
  sourceLabel: string;
}): Promise<RetrievedChunk[]> {
  const { query, chunks, topK, source, sourceLabel } = params;
  if (chunks.length === 0) return [];

  // 检查 chunks 是否都有 embedding
  const hasEmbeddings = chunks.every((c) => c.embedding && c.embedding.length > 0);
  if (hasEmbeddings) {
    const queryEmb = await embedTexts([query]);
    if (queryEmb && queryEmb[0]) {
      const qVec = queryEmb[0];
      const scored = chunks.map((c) => ({
        id: c.id,
        text: c.text,
        score: cosineSim(qVec, c.embedding as number[]),
        source,
        sourceLabel,
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK).filter((s) => s.score > 0);
    }
  }

  // 关键词兜底
  const scored = chunks.map((c) => ({
    id: c.id,
    text: c.text,
    score: keywordScore(query, c.text),
    source,
    sourceLabel,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter((s) => s.score > 0);
}

/** 综合检索：内置语料 + 选择的上传文档（全局，已弃用，保留以兼容旧代码） */
export async function retrieve(params: {
  chapterId: string;
  query: string;
  uploadedDocIds?: string[];
  mode: 'course' | 'mine' | 'compare';
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const topK = params.topK ?? 4;
  const results: RetrievedChunk[] = [];

  // 内置课程
  if (params.mode === 'course' || params.mode === 'compare') {
    const builtin = await loadChapterCorpus(params.chapterId);
    const hits = await searchChunks({
      query: params.query,
      chunks: builtin,
      topK,
      source: 'builtin',
      sourceLabel: '课程内置教材',
    });
    results.push(...hits);
  }

  // 上传资料
  if ((params.mode === 'mine' || params.mode === 'compare') && params.uploadedDocIds?.length) {
    for (const docId of params.uploadedDocIds) {
      const corpus = await loadUploadCorpus(docId);
      if (!corpus) continue;
      const hits = await searchChunks({
        query: params.query,
        chunks: corpus.chunks,
        topK,
        source: 'uploaded',
        sourceLabel: corpus.filename,
      });
      results.push(...hits);
    }
  }

  // 合并：按 score 排序后截断到 topK*1.5
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.ceil(topK * 1.5));
}

/** 综合检索：内置语料 + 选择的上传文档（按用户隔离，需求 8.1 / task 5.1） */
export async function retrieveForUser(params: {
  userId: string;
  chapterId: string;
  query: string;
  uploadedDocIds?: string[];
  mode: 'course' | 'mine' | 'compare';
  topK?: number;
}): Promise<RetrievedChunk[]> {
  assertValidUserId(params.userId);
  const topK = params.topK ?? 4;
  const results: RetrievedChunk[] = [];

  // 内置课程（需求 2.1）
  if (params.mode === 'course' || params.mode === 'compare') {
    const builtin = await loadChapterCorpus(params.chapterId);
    const hits = await searchChunks({
      query: params.query,
      chunks: builtin,
      topK,
      source: 'builtin',
      sourceLabel: '课程内置教材',
    });
    results.push(...hits);
  }

  // 用户上传资料（需求 2.1 / 8.1）
  if ((params.mode === 'mine' || params.mode === 'compare') && params.uploadedDocIds?.length) {
    for (const docId of params.uploadedDocIds) {
      const corpus = await loadUserUploadCorpus(params.userId, docId);
      if (!corpus) continue;
      const hits = await searchChunks({
        query: params.query,
        chunks: corpus.chunks,
        topK,
        source: 'uploaded',
        sourceLabel: corpus.filename,
      });
      results.push(...hits);
    }
  }

  // 合并：按 score 排序后截断到 topK*1.5
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.ceil(topK * 1.5));
}

/** 把检索结果格式化为 prompt 友好的文本 */
export function formatRetrievalForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '（未检索到相关资料，请基于通用知识严谨作答，并明确标注。）';
  return chunks
    .map(
      (c, i) =>
        `[#${i + 1}] 来源：${c.sourceLabel}（${c.source === 'builtin' ? '课程' : '用户'}）\n${c.text.trim()}`,
    )
    .join('\n\n---\n\n');
}

/**
 * 把检索结果格式化为生成阶段的参考上下文（需求 2.1, 2.2, 2.5, 2.6 / task 5.2）
 *
 * 与 formatRetrievalForPrompt 的区别：
 * - compare 模式会分组展示内置与上传资料，并添加对照提示
 * - 为生成流水线优化格式（更结构化的分区标识）
 * - 无命中时返回明确的基于一般教材提示（需求 2.6）
 */
export function formatRetrievalForGeneration(
  chunks: RetrievedChunk[],
  mode: 'course' | 'mine' | 'compare',
): string {
  // 需求 2.6：检索无命中时明确告知
  if (chunks.length === 0) {
    return '（未检索到相关资料。以下内容将基于一般教材和物理学通识知识生成，请注意可能与特定教材存在差异。）';
  }

  // 需求 2.2：compare 模式分组标注一致点与差异
  if (mode === 'compare') {
    const builtinChunks = chunks.filter((c) => c.source === 'builtin');
    const uploadedChunks = chunks.filter((c) => c.source === 'uploaded');

    let result = '## 参考资料（对照模式）\n\n';
    result += '**注意：** 以下同时包含课程内置教材与用户上传资料。生成内容时请：\n';
    result += '1. 标注两者的一致点（共识知识）\n';
    result += '2. 明确指出差异之处（如定义、公式形式、应用范例等）\n';
    result += '3. 当存在冲突时，以课程内置教材为准，同时说明用户资料的不同观点\n\n';

    if (builtinChunks.length > 0) {
      result += '### 课程内置教材\n\n';
      result += builtinChunks
        .map((c, i) => `[#${i + 1}] 来源：${c.sourceLabel}\n${c.text.trim()}`)
        .join('\n\n---\n\n');
      result += '\n\n';
    }

    if (uploadedChunks.length > 0) {
      result += '### 用户上传资料\n\n';
      result += uploadedChunks
        .map((c, i) => `[#${builtinChunks.length + i + 1}] 来源：${c.sourceLabel}\n${c.text.trim()}`)
        .join('\n\n---\n\n');
      result += '\n\n';
    }

    return result.trim();
  }

  // 单一模式（course 或 mine）：统一编号（需求 2.5）
  const modeLabel = mode === 'course' ? '课程内置教材' : '用户上传资料';
  let result = `## 参考资料（${modeLabel}）\n\n`;
  result += chunks
    .map((c, i) => `[#${i + 1}] 来源：${c.sourceLabel}\n${c.text.trim()}`)
    .join('\n\n---\n\n');

  return result;
}

// 工具函数：建供检索用 chunks 时复用嵌入
export { embedTexts };

// 让 TS 知道 CHAPTERS_DIR 仅用于类型一致性，构建脚本用
export { CHAPTERS_DIR };
