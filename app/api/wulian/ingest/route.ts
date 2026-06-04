/**
 * POST /api/wulian/ingest
 *
 * 上传文档并解析、切块、嵌入、保存。
 *
 * 按用户隔离存储（需求 8.1 / task 5.1）：
 *   - 登录用户：写入 `users/<userId>/uploads/` 和 `users/<userId>/vectors/`
 *   - 访客（未登录）：服务端不持久化，由前端处理本地存储（IndexedDB）
 *
 * Form-data:
 *   file       (required) 文件
 *   sessionId  (optional, deprecated) 浏览器侧的会话 id（兼容旧版本，已弃用）
 *
 * Response: { docId, filename, chunkCount, summary, hasEmbedding, userId }
 */

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import {
  ensureDataDirs,
  ensureUserDirs,
  userUploadsDir,
  userVectorsDir,
} from '@/lib/wulian/storage';
import { parseDocument, quickSummary } from '@/lib/wulian/rag/parse';
import { chunkText } from '@/lib/wulian/rag/chunk';
import { saveUploadCorpus, saveUserUploadCorpus } from '@/lib/wulian/rag/store';
import { embedTexts } from '@/lib/wulian/rag/embed';
import { getUserIdFromSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';

const log = createLogger('Wulian Ingest API');

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const ALLOWED_EXT = new Set(['.pdf', '.txt', '.md', '.markdown']);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // 尝试从会话 cookie 提取 userId（需求 2.4 / 8.1）
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = await getUserIdFromSessionToken(sessionToken);

    // 访客模式：服务端不持久化，返回明确提示让前端处理本地存储（需求 8.1）
    if (!userId) {
      return apiError(
        'INVALID_REQUEST',
        401,
        '访客模式下上传资料需在前端本地存储，服务端不持久化',
      );
    }

    // 已登录用户：按用户隔离存储
    await ensureUserDirs(userId);

    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'file 字段缺失或不是文件');
    }
    if (file.size === 0) {
      return apiError('INVALID_REQUEST', 400, '文件为空');
    }
    if (file.size > MAX_BYTES) {
      return apiError('INVALID_REQUEST', 413, `文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`);
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return apiError(
        'INVALID_REQUEST',
        415,
        `不支持的文件类型 ${ext}。MVP 仅支持 PDF、TXT、Markdown。`,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 解析（需求 2.4 / 12.1：复用现有 chunk/embed/parse）
    const parsed = await parseDocument({
      filename: file.name,
      mimeType: file.type,
      buffer,
    });
    if (!parsed.text || parsed.text.trim().length < 30) {
      return apiError('PARSE_FAILED', 422, '文档内容为空或太短，无法提取有效文本');
    }

    // 持久化原文件到用户隔离目录（需求 8.1）
    const docId = nanoid(12);
    const savedPath = path.join(userUploadsDir(userId), `${docId}${ext}`);
    await fs.writeFile(savedPath, buffer);

    // 切块
    const rawChunks = chunkText(parsed.text);
    const chunkObjs = rawChunks.map((c, i) => ({
      id: `${docId}_${i}`,
      docId,
      index: i,
      text: c.text,
      metadata: { heading: c.heading },
      embedding: null as number[] | null,
    }));

    // 嵌入（失败时降级到关键词检索，需求 2.4）
    const embeddings = await embedTexts(chunkObjs.map((c) => c.text));
    if (embeddings) {
      for (let i = 0; i < chunkObjs.length; i++) {
        chunkObjs[i].embedding = embeddings[i] ?? null;
      }
    }

    // 保存到用户隔离的 vectors 目录（需求 8.1）
    await saveUserUploadCorpus(userId, {
      docId,
      filename: file.name,
      chunks: chunkObjs,
    });

    const summary = quickSummary(parsed.text);

    log.info(
      `Ingested ${file.name} for user ${userId}: ${chunkObjs.length} chunks, embeddings=${embeddings ? 'yes' : 'no'}`,
    );

    return apiSuccess({
      docId,
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      uploadedAt: Date.now(),
      summary,
      chunkCount: chunkObjs.length,
      hasEmbedding: !!embeddings,
      userId, // 返回 userId 以便前端确认归属（需求 8.1）
    });
  } catch (err) {
    log.error('ingest failed:', err);
    return apiError(
      'PARSE_FAILED',
      500,
      err instanceof Error ? err.message : 'ingest failed',
    );
  }
}
