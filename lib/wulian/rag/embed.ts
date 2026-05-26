/**
 * 嵌入模型适配
 *
 * 设计目标：让物联智讲在「有/无 embedding API」两种环境下都能跑。
 *
 * - 当配置了 EMBEDDING_PROVIDER（例如 qwen / openai / glm / siliconflow）时，
 *   走 OpenAI-compatible /v1/embeddings 接口取真向量
 * - 否则返回 null，调用方自动降级到 BM25-Lite 关键词匹配
 *
 * 这样即便用户只有 DeepSeek（没有 embedding 端点），demo 也能跑通。
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('Wulian Embedding');

interface EmbeddingProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 读取环境变量，返回首个可用的 embedding 配置 */
function resolveEmbeddingConfig(): EmbeddingProviderConfig | null {
  // 优先：用户显式指定 EMBEDDING_*
  if (process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_API_KEY) {
    return {
      baseUrl: process.env.EMBEDDING_BASE_URL.replace(/\/$/, ''),
      apiKey: process.env.EMBEDDING_API_KEY,
      model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    };
  }

  // 自动嗅探常见 provider
  const candidates: { key: string; baseUrl: string; defaultModel: string }[] = [
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
    const apiKey = process.env[c.key];
    if (apiKey) {
      return {
        baseUrl: c.baseUrl,
        apiKey,
        model: process.env.EMBEDDING_MODEL ?? c.defaultModel,
      };
    }
  }

  return null;
}

/** 单文本批量嵌入 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const cfg = resolveEmbeddingConfig();
  if (!cfg) {
    log.info('No embedding provider configured, falling back to keyword retrieval');
    return null;
  }

  try {
    // 大多数 OpenAI 兼容 embedding 端点限制单次最多 16~64 条；分批
    const batchSize = 16;
    const out: number[][] = [];
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
        const txt = await res.text().catch(() => '');
        log.warn(`Embedding call failed: ${res.status} ${txt.slice(0, 200)}`);
        return null;
      }
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      for (const item of json.data) out.push(item.embedding);
    }
    return out;
  } catch (err) {
    log.warn('Embedding request failed:', err);
    return null;
  }
}

/** 余弦相似度 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** 用于「未配置 embedding」时的简易关键词检索打分。
 *  对中英文字符与数字做 bigram + unigram 的 jaccard 近似。 */
export function keywordScore(query: string, text: string): number {
  const q = tokenize(query);
  const t = tokenize(text);
  if (q.size === 0 || t.size === 0) return 0;
  let inter = 0;
  for (const tok of q) if (t.has(tok)) inter++;
  return inter / Math.sqrt(q.size * t.size);
}

function tokenize(s: string): Set<string> {
  const tokens = new Set<string>();
  // 英文/数字按词
  for (const m of s.toLowerCase().matchAll(/[a-z0-9]+/g)) tokens.add(m[0]);
  // 中文按 bigram
  const cn = s.replace(/[^\u4e00-\u9fa5]/g, ' ');
  for (const seg of cn.split(/\s+/)) {
    if (seg.length === 0) continue;
    if (seg.length === 1) {
      tokens.add(seg);
      continue;
    }
    for (let i = 0; i + 1 < seg.length; i++) tokens.add(seg.slice(i, i + 2));
  }
  return tokens;
}
