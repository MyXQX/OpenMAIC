#!/usr/bin/env node
/**
 * 物联智讲 - 内置语料构建脚本
 *
 * 用法：
 *   pnpm wulian:build-content
 *
 * 流程：
 *   1. 扫描 content/wulian/corpus/<chapter>/*.md
 *   2. 调 lib/wulian/rag/chunk.ts 切块（脚本里直接复刻一份逻辑，避免 ts 依赖）
 *   3. 如果配置了 EMBEDDING_*（或自动嗅探到 OPENAI/QWEN/...）就批量嵌入
 *   4. 输出到 content/wulian/knowledge/<chapter>.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CORPUS_ROOT = path.join(ROOT, 'content', 'wulian', 'corpus');
const KNOWLEDGE_ROOT = path.join(ROOT, 'content', 'wulian', 'knowledge');

const MAX_CHARS = 700;
const OVERLAP = 80;

function splitByHeading(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = { body: '' };
  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current.body.trim().length > 0 || current.heading) sections.push(current);
      current = { heading: m[2], body: '' };
    } else {
      current.body += line + '\n';
    }
  }
  if (current.body.trim().length > 0 || current.heading) sections.push(current);
  if (sections.length === 0) sections.push({ body: text });
  return sections;
}

function windowChunks(text, maxChars, overlap) {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const out = [];
  let buffer = '';
  for (const p of paragraphs) {
    if ((buffer + '\n\n' + p).length > maxChars && buffer.length > 0) {
      out.push(buffer);
      buffer = buffer.length > overlap ? buffer.slice(-overlap) + '\n\n' + p : p;
    } else {
      buffer = buffer.length > 0 ? buffer + '\n\n' + p : p;
    }
  }
  if (buffer.trim().length > 0) out.push(buffer);
  return out.flatMap((c) => {
    if (c.length <= maxChars) return [c];
    const pieces = [];
    for (let i = 0; i < c.length; i += maxChars - overlap) {
      pieces.push(c.slice(i, i + maxChars));
    }
    return pieces;
  });
}

function chunkText(text) {
  const sections = splitByHeading(text);
  const chunks = [];
  let idx = 0;
  for (const section of sections) {
    const parts = windowChunks(section.body.trim(), MAX_CHARS, OVERLAP);
    for (const part of parts) {
      if (part.trim().length === 0) continue;
      chunks.push({
        index: idx++,
        text: section.heading ? `# ${section.heading}\n${part}` : part,
        heading: section.heading,
      });
    }
  }
  return chunks;
}

function resolveEmbeddingConfig() {
  if (process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_API_KEY) {
    return {
      baseUrl: process.env.EMBEDDING_BASE_URL.replace(/\/$/, ''),
      apiKey: process.env.EMBEDDING_API_KEY,
      model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    };
  }
  const candidates = [
    {
      key: 'QWEN_API_KEY',
      baseUrl:
        process.env.QWEN_BASE_URL?.replace(/\/$/, '') ??
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'text-embedding-v3',
    },
    {
      key: 'OPENAI_API_KEY',
      baseUrl: process.env.OPENAI_BASE_URL?.replace(/\/$/, '') ?? 'https://api.openai.com/v1',
      defaultModel: 'text-embedding-3-small',
    },
    {
      key: 'GLM_API_KEY',
      baseUrl:
        process.env.GLM_BASE_URL?.replace(/\/$/, '') ?? 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'embedding-3',
    },
    {
      key: 'SILICONFLOW_API_KEY',
      baseUrl:
        process.env.SILICONFLOW_BASE_URL?.replace(/\/$/, '') ?? 'https://api.siliconflow.cn/v1',
      defaultModel: 'BAAI/bge-m3',
    },
  ];
  for (const c of candidates) {
    if (process.env[c.key]) {
      return {
        baseUrl: c.baseUrl,
        apiKey: process.env[c.key],
        model: process.env.EMBEDDING_MODEL ?? c.defaultModel,
      };
    }
  }
  return null;
}

async function embedTexts(texts) {
  const cfg = resolveEmbeddingConfig();
  if (!cfg) return null;
  const out = [];
  const batchSize = 16;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, input: batch }),
    });
    if (!res.ok) {
      console.warn(`[wulian:build-content] embedding failed (${res.status}); falling back to keyword`);
      return null;
    }
    const json = await res.json();
    for (const item of json.data) out.push(item.embedding);
  }
  return out;
}

async function loadEnv() {
  // 试着读 .env.local 中的 KEY，让脚本免去 dotenv 依赖
  const envFile = path.join(ROOT, '.env.local');
  try {
    const raw = await fs.readFile(envFile, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const k = m[1];
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k] && v.length > 0) process.env[k] = v;
    }
  } catch {
    /* no .env.local, ignore */
  }
}

async function buildOne(folder) {
  const dir = path.join(CORPUS_ROOT, folder);
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    console.log(`[wulian:build-content] skip ${folder} (no corpus folder)`);
    return null;
  }
  const allChunks = [];
  for (const file of entries.sort()) {
    if (!file.endsWith('.md')) continue;
    const text = await fs.readFile(path.join(dir, file), 'utf-8');
    const chunks = chunkText(text);
    for (const c of chunks) {
      allChunks.push({
        id: `${folder}-${file.replace(/\.md$/, '')}-${c.index}`,
        docId: `builtin:${folder}`,
        index: allChunks.length,
        text: c.text,
        metadata: { heading: c.heading, source: file },
        embedding: null,
      });
    }
  }
  if (allChunks.length === 0) return null;

  const embeddings = await embedTexts(allChunks.map((c) => c.text));
  if (embeddings) {
    for (let i = 0; i < allChunks.length; i++) {
      allChunks[i].embedding = embeddings[i];
    }
    console.log(`[wulian:build-content] ${folder}: embedded ${allChunks.length} chunks`);
  } else {
    console.log(`[wulian:build-content] ${folder}: ${allChunks.length} chunks (no embeddings, will use keyword retrieval)`);
  }

  await fs.mkdir(KNOWLEDGE_ROOT, { recursive: true });
  await fs.writeFile(
    path.join(KNOWLEDGE_ROOT, `${folder}.json`),
    JSON.stringify({ chapterId: folder, chunks: allChunks }, null, 2),
    'utf-8',
  );
  return { folder, count: allChunks.length };
}

async function main() {
  await loadEnv();
  let folders;
  try {
    folders = await fs.readdir(CORPUS_ROOT);
  } catch {
    console.error('[wulian:build-content] no corpus folder found at', CORPUS_ROOT);
    process.exit(1);
  }
  const results = [];
  for (const folder of folders) {
    const stat = await fs.stat(path.join(CORPUS_ROOT, folder));
    if (!stat.isDirectory()) continue;
    const r = await buildOne(folder);
    if (r) results.push(r);
  }
  console.log('[wulian:build-content] done:', results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
