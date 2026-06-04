'use client';

import { useState } from 'react';
import { UploadPanel, type UploadedDoc } from './UploadPanel';

interface MaterialsTabProps {
  docs: UploadedDoc[];
  onChangeDocs: (next: UploadedDoc[]) => void;
  materialMode: 'course' | 'mine' | 'compare';
  onMaterialModeChange: (mode: 'course' | 'mine' | 'compare') => void;
  isGuest: boolean;
  chapterTitle?: string;
}

export function MaterialsTab({
  docs,
  onChangeDocs,
  materialMode,
  onMaterialModeChange,
  isGuest,
  chapterTitle = '本章教材',
}: MaterialsTabProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleModeClick = (mode: 'course' | 'mine' | 'compare') => {
    if (isGuest && (mode === 'mine' || mode === 'compare')) {
      setErrorMsg('访客模式无法使用个人资料定制，请先登录账号。');
      return;
    }
    setErrorMsg(null);
    onMaterialModeChange(mode);
  };

  return (
    <div className="w-materials-tab">
      {/* 模式选择 */}
      <div className="w-mode-selection">
        <div style={{ fontSize: 12, color: 'var(--w-ink-soft)', marginBottom: 8, fontWeight: 500 }}>
          检索资料模式
        </div>
        <div className="w-mode-buttons">
          <button
            type="button"
            className={`mode-btn${materialMode === 'course' ? ' active' : ''}`}
            onClick={() => handleModeClick('course')}
          >
            📘 课程内置
          </button>
          <button
            type="button"
            className={`mode-btn${materialMode === 'mine' ? ' active' : ''}${isGuest ? ' guest-lock' : ''}`}
            onClick={() => handleModeClick('mine')}
            title={isGuest ? '需要登录' : ''}
          >
            👤 我的资料
          </button>
          <button
            type="button"
            className={`mode-btn${materialMode === 'compare' ? ' active' : ''}${isGuest ? ' guest-lock' : ''}`}
            onClick={() => handleModeClick('compare')}
            title={isGuest ? '需要登录' : ''}
          >
            ⚖️ 对照模式
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="w-guest-alert">
          <span className="icon">⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 内置共享资料 */}
      <div className="w-material-section" style={{ marginTop: 18 }}>
        <div className="section-title">课程内置教材</div>
        <div className="w-doc-list">
          <div className="w-doc-row builtin">
            <div className="title">
              <span style={{ fontWeight: 600 }}>📖 {chapterTitle} (物理大学基础教材)</span>
              <span className="pill-tag">共享只读</span>
            </div>
            <div className="summary">
              系统内置共享的物理课本知识片段，包含公式、图表以及详细推导步骤。
            </div>
            <div className="meta">100+ 语义知识片段 · 自动匹配检索</div>
          </div>
        </div>
      </div>

      {/* 个人上传资料 */}
      <div className="w-material-section" style={{ marginTop: 22 }}>
        <div className="section-title">
          个人补充资料
          {isGuest && <span className="title-lock-badge">登录可用</span>}
        </div>
        <UploadPanel docs={docs} onChange={onChangeDocs} isGuest={isGuest} />
      </div>

      <style jsx global>{`
        .w-materials-tab {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .w-mode-selection {
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          border-radius: 10px;
          padding: 12px;
        }
        .w-mode-buttons {
          display: flex;
          gap: 6px;
        }
        .mode-btn {
          flex: 1;
          background: rgba(13, 20, 36, 0.4);
          border: 1px solid var(--w-border);
          color: var(--w-ink-soft);
          border-radius: 8px;
          padding: 8px 6px;
          font-size: 11px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .mode-btn:hover {
          color: var(--w-ink);
          border-color: var(--w-accent-soft);
        }
        .mode-btn.active {
          background: var(--w-accent);
          color: #1a1a1a;
          border-color: var(--w-accent);
          font-weight: 600;
        }
        .mode-btn.guest-lock {
          opacity: 0.55;
        }
        .w-guest-alert {
          background: rgba(239, 108, 140, 0.12);
          border: 1px solid rgba(239, 108, 140, 0.3);
          color: var(--w-bad);
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: fadeIn 0.2s ease;
        }
        .w-guest-alert .icon {
          font-size: 14px;
        }
        .w-material-section .section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--w-ink);
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .title-lock-badge {
          font-size: 10px;
          background: rgba(239, 108, 140, 0.15);
          color: var(--w-bad);
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid rgba(239, 108, 140, 0.3);
        }
        .pill-tag {
          font-size: 10px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--w-ink-soft);
          padding: 1px 6px;
          border-radius: 4px;
        }
        .w-doc-row.builtin {
          border-left: 3px solid var(--w-accent-soft);
        }
      `}</style>
    </div>
  );
}
