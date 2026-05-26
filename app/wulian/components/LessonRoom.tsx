'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chapter, ScientistPersona } from '@/lib/wulian/types';
import { useWulianChat } from './useWulianChat';
import { MessageBubble } from './MessageBubble';
import { Whiteboard } from './Whiteboard';
import { UploadPanel, type UploadedDoc } from './UploadPanel';
import { ScientistAvatar, RoleAvatar } from './Avatar';

type Mode = 'course' | 'mine' | 'compare';
type RightTab = 'chat' | 'docs' | 'objectives';

const QUICK_PROMPTS = [
  '请再讲一遍刚才那一步',
  '帮我用图说明一下',
  '出 1 道随堂题',
  '我有疑问：',
];

export function LessonRoom({
  chapter,
  teacher,
  secondary,
}: {
  chapter: Chapter;
  teacher: ScientistPersona;
  secondary: ScientistPersona | null;
}) {
  const [mode, setMode] = useState<Mode>('course');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [tab, setTab] = useState<RightTab>('chat');
  const [input, setInput] = useState('');

  const docIds = useMemo(() => docs.map((d) => d.docId), [docs]);

  const chat = useWulianChat({
    chapterId: chapter.id,
    uploadedDocIds: docIds,
    mode,
  });

  // 自动滚到底
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat.messages.length, chat.activeSpeakerId]);

  // 模式切换到 mine 但还没文档时给个提示
  useEffect(() => {
    if (mode === 'mine' && docs.length === 0) setTab('docs');
  }, [mode, docs.length]);

  const submit = async () => {
    const v = input.trim();
    if (!v || chat.loading) return;
    setInput('');
    await chat.send(v);
  };

  const startOpening = async () => {
    if (chat.loading) return;
    chat.reset();
    await chat.send('');
  };

  // 默认推荐的 simulationId
  const fallbackSim = chapter.knowledgePoints.find((kp) => kp.simulationId)?.simulationId;

  return (
    <div className="w-lesson">
      {/* === 左侧 === */}
      <aside className="w-pane w-sidebar">
        <div className="w-pane-header">
          <Link href="/wulian" className="w-back">
            ← 返回章节
          </Link>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{chapter.subject}</span>
        </div>
        <div className="w-pane-body">
          <h3>{chapter.title}</h3>
          <small>{chapter.summary}</small>

          <div style={{ marginTop: 18, fontSize: 12, color: 'var(--w-ink-soft)' }}>课堂角色</div>
          <div className="w-roster">
            <div className="w-roster-row">
              <ScientistAvatar persona={teacher} />
              <div>
                <div className="name">
                  {teacher.name}{' '}
                  {chat.activeSpeakerId?.startsWith('teacher_') && <span className="w-speaking-dot" />}
                </div>
                <div className="role">{teacher.field} · 主讲</div>
              </div>
            </div>
            {secondary && (
              <div className="w-roster-row">
                <ScientistAvatar persona={secondary} size="sm" />
                <div>
                  <div className="name">{secondary.name}</div>
                  <div className="role">{secondary.field} · 协讲</div>
                </div>
              </div>
            )}
            <div className="w-roster-row">
              <RoleAvatar role="assistant" size="sm" />
              <div>
                <div className="name">
                  小麦{' '}
                  {chat.activeSpeakerId === 'assistant_xiaomai' && <span className="w-speaking-dot" />}
                </div>
                <div className="role">AI 助教 · 答疑</div>
              </div>
            </div>
            <div className="w-roster-row">
              <RoleAvatar role="classmate" size="sm" />
              <div>
                <div className="name">
                  小恒{' '}
                  {chat.activeSpeakerId === 'classmate_xiaoheng' && <span className="w-speaking-dot" />}
                </div>
                <div className="role">AI 同学 · 抛误区</div>
              </div>
            </div>
          </div>

          <div className="w-objectives">
            <strong style={{ color: 'var(--w-ink)' }}>本章目标</strong>
            <ol>
              {chapter.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button
              type="button"
              onClick={startOpening}
              disabled={chat.loading}
              style={{
                flex: 1,
                background: 'var(--w-accent)',
                color: '#1a1a1a',
                border: 0,
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 600,
                fontSize: 13,
                cursor: chat.loading ? 'not-allowed' : 'pointer',
                opacity: chat.loading ? 0.6 : 1,
              }}
            >
              {chat.messages.length === 0 ? '请老师开场' : '重新开始'}
            </button>
          </div>
          {chat.error && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                background: 'rgba(239,108,140,0.1)',
                border: '1px solid rgba(239,108,140,0.3)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--w-bad)',
              }}
            >
              {chat.error}
            </div>
          )}
        </div>
      </aside>

      {/* === 中间：白板 + 模拟器 === */}
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Whiteboard
          items={chat.whiteboardItems}
          fallbackSimulationId={fallbackSim}
          onClear={chat.clearWhiteboard}
        />
      </main>

      {/* === 右侧：聊天 / 文档 / 目标 === */}
      <aside className="w-pane w-chat">
        <div className="w-chat-tabs">
          <button onClick={() => setTab('chat')} className={tab === 'chat' ? 'active' : ''}>
            💬 课堂
          </button>
          <button onClick={() => setTab('docs')} className={tab === 'docs' ? 'active' : ''}>
            📄 我的资料 {docs.length > 0 && `(${docs.length})`}
          </button>
          <button onClick={() => setTab('objectives')} className={tab === 'objectives' ? 'active' : ''}>
            🎯 知识点
          </button>
        </div>

        {tab === 'chat' && (
          <>
            <div className="w-mode-toggles">
              <span style={{ alignSelf: 'center', marginRight: 4, color: 'var(--w-ink-soft)' }}>
                资料模式
              </span>
              <button
                className={mode === 'course' ? 'active' : ''}
                onClick={() => setMode('course')}
              >
                课程
              </button>
              <button
                className={mode === 'mine' ? 'active' : ''}
                onClick={() => setMode('mine')}
                title={docs.length === 0 ? '请先上传资料' : ''}
              >
                我的
              </button>
              <button
                className={mode === 'compare' ? 'active' : ''}
                onClick={() => setMode('compare')}
              >
                对照
              </button>
            </div>

            <div className="w-msg-list" ref={listRef}>
              {chat.messages.length === 0 ? (
                <div
                  style={{
                    color: 'var(--w-ink-soft)',
                    fontSize: 13,
                    textAlign: 'center',
                    marginTop: 60,
                    lineHeight: 1.7,
                  }}
                >
                  课堂尚未开始。
                  <br />
                  点击左侧「请老师开场」让 {teacher.name} 教授开始讲解。
                </div>
              ) : (
                chat.messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    chapterId={chapter.id}
                    speaking={
                      m.role === 'agent' &&
                      'speakerId' in m.content &&
                      chat.activeSpeakerId === m.content.speakerId
                    }
                  />
                ))
              )}
            </div>

            <div className="w-quick-row">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setInput((v) => (v ? v + ' ' + p : p))}
                  disabled={chat.loading}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="w-input-row">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={
                  chat.loading ? '老师正在回答中…' : '输入问题，按 Enter 发送（Shift+Enter 换行）'
                }
                disabled={chat.loading}
              />
              {chat.loading ? (
                <button type="button" onClick={chat.cancel}>
                  停止
                </button>
              ) : (
                <button type="button" onClick={submit} disabled={input.trim().length === 0}>
                  发送
                </button>
              )}
            </div>
          </>
        )}

        {tab === 'docs' && (
          <div className="w-pane-body">
            <p style={{ marginTop: 0, fontSize: 13, color: 'var(--w-ink-soft)', lineHeight: 1.6 }}>
              支持 PDF / TXT / Markdown。上传后切到「我的资料」或「对照」模式，
              AI 老师将优先引用你的资料回答。
            </p>
            <UploadPanel docs={docs} onChange={setDocs} />
          </div>
        )}

        {tab === 'objectives' && (
          <div className="w-pane-body">
            <p style={{ marginTop: 0, fontSize: 13, color: 'var(--w-ink-soft)' }}>
              本章包含 {chapter.knowledgePoints.length} 个核心知识点：
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {chapter.knowledgePoints.map((kp) => (
                <div
                  key={kp.id}
                  style={{
                    padding: 12,
                    background: 'var(--w-panel-2)',
                    borderRadius: 10,
                    border: '1px solid var(--w-border)',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{kp.title}</div>
                  {kp.formulas[0] && (
                    <div
                      style={{
                        fontFamily: 'Geist Mono, monospace',
                        fontSize: 12,
                        color: 'var(--w-accent-soft)',
                        margin: '6px 0',
                      }}
                    >
                      {kp.formulas[0].caption}
                    </div>
                  )}
                  {kp.misconceptions.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--w-ink-soft)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--w-warn)' }}>易错点：</strong>
                      {kp.misconceptions[0]}
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('chat');
                        chat.send(`请重点讲解一下「${kp.title}」`);
                      }}
                      disabled={chat.loading}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--w-border)',
                        color: 'var(--w-accent-soft)',
                        borderRadius: 999,
                        fontSize: 11,
                        padding: '3px 10px',
                        cursor: chat.loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      请教这一点 →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
