/**
 * 物联智讲 - 首页（章节选择）
 * 服务端组件，直接读章节 JSON。
 */

import Link from 'next/link';
import { loadAllChapters } from '@/lib/wulian/agents/chapter';
import { loadAllPersonas } from '@/lib/wulian/agents/persona';
import type { Chapter, ScientistPersona } from '@/lib/wulian/types';

export default async function WulianHomePage() {
  const chapters = await loadAllChapters();
  const personas = await loadAllPersonas();

  const ready = chapters.filter((c) => c.status === 'ready');
  const preview = chapters.filter((c) => c.status === 'preview');

  return (
    <div className="w-home">
      <header className="w-home-hero">
        <div>
          <div className="w-brand">物联智讲 · OpenMAIC × Physics</div>
          <h1>
            和科学家一起<em>重做</em>大学物理实验
          </h1>
          <p className="lead">
            选择一个章节，由对应时代的科学家亲自讲解。AI 助教随时答疑，AI
            同学暴露常见误区，白板同步推导公式，实验台可调参数即时看到结果。
            还能上传你自己的课件，让课堂围着你的学习目标转。
          </p>
          <Link
            href={ready[0] ? `/wulian/lesson/${ready[0].id}` : `/wulian/lesson/em-induction`}
            style={{
              display: 'inline-block',
              background: 'var(--w-accent)',
              color: '#1a1a1a',
              padding: '12px 22px',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            进入旗舰章节：电磁感应
          </Link>
        </div>
        <div className="w-card-stack">
          <div className="w-stack-card">
            <div className="who">Michael Faraday · 1831</div>
            <div className="formula">ε = -dΦ/dt</div>
          </div>
          <div className="w-stack-card">
            <div className="who">James Clerk Maxwell · 1865</div>
            <div className="formula">∇ × E = -∂B/∂t</div>
          </div>
        </div>
      </header>

      <section>
        <div className="w-section-title">
          <h2>已就绪的章节</h2>
          <span className="hint">完整内容 + 模拟器 + RAG 检索</span>
        </div>
        <div className="w-chapter-grid">
          {ready.map((c) => (
            <ChapterCard key={c.id} chapter={c} personas={personas} />
          ))}
        </div>
      </section>

      {preview.length > 0 && (
        <section>
          <div className="w-section-title">
            <h2>预览中的章节</h2>
            <span className="hint">可以试讲，但内容尚未完全收录</span>
          </div>
          <div className="w-chapter-grid">
            {preview.map((c) => (
              <ChapterCard key={c.id} chapter={c} personas={personas} />
            ))}
          </div>
        </section>
      )}

      <footer style={{ marginTop: 60, textAlign: 'center', color: 'var(--w-ink-soft)', fontSize: 12 }}>
        基于 OpenMAIC 的物理化定制 · 内容仅供学习参考，遇到错误请通过反馈按钮告知
      </footer>
    </div>
  );
}

function ChapterCard({
  chapter,
  personas,
}: {
  chapter: Chapter;
  personas: Map<string, ScientistPersona>;
}) {
  const teacher = personas.get(chapter.primaryScientist);
  const statusLabel = chapter.status === 'ready' ? '已就绪' : chapter.status === 'preview' ? '预览' : '规划中';
  const statusClass =
    chapter.status === 'ready'
      ? 'w-status-ready'
      : chapter.status === 'preview'
        ? 'w-status-preview'
        : 'w-status-planned';
  return (
    <Link href={`/wulian/lesson/${chapter.id}`} style={{ textDecoration: 'none' }}>
      <div className="w-chapter-card" role="button" tabIndex={0}>
        <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
        <span className="subject-tag">{chapter.subject}</span>
        <h3>{chapter.title}</h3>
        <p>{chapter.summary}</p>
        {teacher && (
          <div className="scientist">
            <span style={{ fontSize: 11, opacity: 0.7 }}>主讲</span>
            <span style={{ color: 'var(--w-accent-soft)', fontWeight: 500 }}>{teacher.name}</span>
            <span style={{ opacity: 0.7 }}>· {teacher.era}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
