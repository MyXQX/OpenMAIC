/**
 * 文本切块
 *
 * 简单的中文友好切块器：
 * 1. 按 markdown 二/三级标题切大段
 * 2. 大段超过 maxChars 时按段落滑窗
 * 3. 每个 chunk 最多 maxChars，相邻 chunk 留 overlap 个字符
 */

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

export interface RawChunk {
  text: string;
  heading?: string;
  index: number;
}

/** 按 markdown 标题分段；标题随段落保留 */
function splitByHeading(text: string): { heading?: string; body: string }[] {
  const lines = text.split(/\r?\n/);
  const sections: { heading?: string; body: string }[] = [];
  let current: { heading?: string; body: string } = { body: '' };

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

/** 把长段按段落滑窗切成多个 chunk */
function windowChunks(text: string, maxChars: number, overlap: number): string[] {
  if (text.length <= maxChars) return [text];

  // 优先按空行（自然段）切分
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const out: string[] = [];
  let buffer = '';

  for (const p of paragraphs) {
    if ((buffer + '\n\n' + p).length > maxChars && buffer.length > 0) {
      out.push(buffer);
      // 保留最后 overlap 个字符
      buffer = buffer.length > overlap ? buffer.slice(-overlap) + '\n\n' + p : p;
    } else {
      buffer = buffer.length > 0 ? buffer + '\n\n' + p : p;
    }
  }
  if (buffer.trim().length > 0) out.push(buffer);

  // 如果某段本身就超长（很少见），再用硬窗口切
  return out.flatMap((c) => {
    if (c.length <= maxChars) return [c];
    const pieces: string[] = [];
    for (let i = 0; i < c.length; i += maxChars - overlap) {
      pieces.push(c.slice(i, i + maxChars));
    }
    return pieces;
  });
}

export function chunkText(text: string, opts: ChunkOptions = {}): RawChunk[] {
  const maxChars = opts.maxChars ?? 700;
  const overlap = opts.overlap ?? 80;
  const sections = splitByHeading(text);
  const chunks: RawChunk[] = [];
  let idx = 0;

  for (const section of sections) {
    const parts = windowChunks(section.body.trim(), maxChars, overlap);
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
