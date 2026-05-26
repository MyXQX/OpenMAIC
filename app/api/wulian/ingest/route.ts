/**
 * POST /api/wulian/ingest
 *
 * 上传文档并解析、切块、嵌入、保存。
 *
 * Form-data:
 *   file       (required) 文件
 *   sessionId  (optional) 浏览器侧的会话 id
 *
 * Response: { docId, filename, chunkCount, summary }
 */

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { ensureDataDirs, UPLOADS_DIR } from '@/lib/wulian/storage';
import { parseDocument, quickSummary } from '@/lib/wulian/rag/parse';
import { chunkText } from '@/lib/wulian/rag/chunk';
import { saveUploadCorpus } from '@/lib/wulian/rag/store';
import { embedTexts } from '@/lib/wulian/rag/embed';

const log = createLogger('Wulian Ingest API');

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const ALLOWED_EXT = new Set(['.pdf', '.txt', '.md', '.markdown']);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureDataDirs();

    const form = await req.formData();
    const file = form.get('file');
    const sessionId = (form.get('sessionId') as string) || 'anonymous';

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

    // 解析
    const parsed = await parseDocument({
      filename: file.name,
      mimeType: file.type,
      buffer,
    });
    if (!parsed.text || parsed.text.trim().length < 30) {
      return apiError('PARSE_FAILED', 422, '文档内容为空或太短，无法提取有效文本');
    }

    // 持久化原文件
    const docId = nanoid(12);
    const savedPath = path.join(UPLOADS_DIR, `${docId}${ext}`);
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

    // 嵌入（失败时降级到关键词检索）
    const embeddings = await embedTexts(chunkObjs.map((c) => c.text));
    if (embeddings) {
      for (let i = 0; i < chunkObjs.length; i++) {
        chunkObjs[i].embedding = embeddings[i] ?? null;
      }
    }

    await saveUploadCorpus({
      docId,
      filename: file.name,
      chunks: chunkObjs,
    });

    const summary = quickSummary(parsed.text);

    log.info(
      `Ingested ${file.name}: ${chunkObjs.length} chunks, embeddings=${embeddings ? 'yes' : 'no'}`,
    );

    return apiSuccess({
      docId,
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      uploadedAt: Date.now(),
      summary,
      chunkCount: chunkObjs.length,
      sessionId,
      hasEmbedding: !!embeddings,
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
