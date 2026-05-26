'use client';

/** 使用 KaTeX 渲染单段 LaTeX。OpenMAIC 已在根 layout 引入了 katex.min.css。 */

import { useEffect, useRef } from 'react';
import katex from 'katex';

export function Latex({
  source,
  displayMode = false,
  className,
}: {
  source: string;
  displayMode?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(source, ref.current, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
        output: 'html',
      });
    } catch {
      if (ref.current) ref.current.textContent = source;
    }
  }, [source, displayMode]);

  return <span ref={ref} className={className} />;
}

/**
 * 渲染包含 $...$ 与 $$...$$ 的 markdown 段落。
 * 不支持完整 markdown，仅处理粗体、行内代码与公式 - 足够课堂场景。
 */
export function MarkdownLite({ text }: { text: string }) {
  const parts: { kind: 'text' | 'inline' | 'block' | 'bold' | 'code'; value: string }[] = [];
  // 先按 $$...$$ 切，再按 $...$ 切
  const blocks = text.split(/(\$\$[\s\S]+?\$\$)/g);
  for (const block of blocks) {
    if (block.startsWith('$$') && block.endsWith('$$')) {
      parts.push({ kind: 'block', value: block.slice(2, -2).trim() });
      continue;
    }
    const inlines = block.split(/(\$[^$\n]+\$)/g);
    for (const seg of inlines) {
      if (seg.startsWith('$') && seg.endsWith('$') && seg.length > 2) {
        parts.push({ kind: 'inline', value: seg.slice(1, -1) });
        continue;
      }
      // 简单粗体与代码
      const tokens = seg.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      for (const t of tokens) {
        if (!t) continue;
        if (t.startsWith('**') && t.endsWith('**')) parts.push({ kind: 'bold', value: t.slice(2, -2) });
        else if (t.startsWith('`') && t.endsWith('`')) parts.push({ kind: 'code', value: t.slice(1, -1) });
        else parts.push({ kind: 'text', value: t });
      }
    }
  }
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'block') return <Latex key={i} source={p.value} displayMode />;
        if (p.kind === 'inline') return <Latex key={i} source={p.value} />;
        if (p.kind === 'bold')
          return (
            <strong key={i} style={{ fontWeight: 600 }}>
              {p.value}
            </strong>
          );
        if (p.kind === 'code')
          return (
            <code
              key={i}
              style={{
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                fontSize: '0.92em',
                background: 'rgba(255,255,255,0.06)',
                padding: '0 4px',
                borderRadius: 4,
              }}
            >
              {p.value}
            </code>
          );
        return <span key={i}>{p.value}</span>;
      })}
    </>
  );
}
