/**
 * 文档解析：从 buffer 提取纯文本
 *
 * 支持：
 * - PDF: 使用 unpdf（OpenMAIC 已安装）
 * - TXT/MD: 直接 utf-8 解码
 *
 * DOCX 解析在 MVP 暂不支持；前端 UI 会过滤后缀。
 */

import { extractText, getDocumentProxy } from 'unpdf';

export interface ParsedDoc {
  text: string;
  /** 估计页数 */
  pages?: number;
}

export async function parseDocument(params: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ParsedDoc> {
  const { filename, buffer } = params;
  const lower = filename.toLowerCase();

  if (lower.endsWith('.pdf') || params.mimeType === 'application/pdf') {
    return parsePdf(buffer);
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return { text: buffer.toString('utf-8') };
  }
  throw new Error(`不支持的文件类型: ${filename}（MVP 暂仅支持 PDF/TXT/Markdown）`);
}

async function parsePdf(buffer: Buffer): Promise<ParsedDoc> {
  const u8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(u8);
  const { text } = await extractText(pdf, { mergePages: true });
  // unpdf 在 mergePages 时返回 string；类型上是 string | string[]
  const merged = Array.isArray(text) ? text.join('\n\n') : text;
  return { text: merged, pages: pdf.numPages };
}

/** 自动从 chunks 生成简短摘要：取前 2 段不超过 240 字 */
export function quickSummary(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 240) return cleaned;
  return cleaned.slice(0, 240) + '…';
}
