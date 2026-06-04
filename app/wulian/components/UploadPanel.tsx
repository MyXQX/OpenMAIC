'use client';

import { useCallback, useRef, useState } from 'react';

export interface UploadedDoc {
  docId: string;
  filename: string;
  summary: string;
  chunkCount: number;
  hasEmbedding: boolean;
  uploadedAt: number;
}

export function UploadPanel({
  docs,
  onChange,
  isGuest = false,
}: {
  docs: UploadedDoc[];
  onChange: (next: UploadedDoc[]) => void;
  isGuest?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (isGuest) {
        setErr('您目前处于访客模式，无法上传个人资料。请先登录您的账号。');
        return;
      }
      const list = Array.from(files);
      if (list.length === 0) return;
      setBusy(true);
      setErr(null);
      try {
        const next = [...docs];
        for (const file of list) {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/wulian/ingest', { method: 'POST', body: fd });
          const j = await res.json();
          if (!res.ok || !j.success) {
            throw new Error(j.error || `${file.name} 上传失败`);
          }
          next.push({
            docId: j.docId,
            filename: j.filename,
            summary: j.summary,
            chunkCount: j.chunkCount,
            hasEmbedding: j.hasEmbedding,
            uploadedAt: j.uploadedAt,
          });
        }
        onChange(next);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [docs, onChange, isGuest],
  );

  const handleClick = () => {
    if (isGuest) {
      setErr('您目前处于访客模式，无法上传个人资料。请先登录您的账号。');
      return;
    }
    inputRef.current?.click();
  };

  return (
    <div>
      <div
        className={`w-upload-zone${dragging ? ' dragging' : ''}${isGuest ? ' guest-disabled' : ''}`}
        onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isGuest) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (isGuest) {
            setErr('您目前处于访客模式，无法上传个人资料。请先登录您的账号。');
            return;
          }
          if (e.dataTransfer?.files) upload(e.dataTransfer.files);
        }}
        style={isGuest ? { cursor: 'not-allowed', opacity: 0.65 } : {}}
      >
        {isGuest ? (
          <div style={{ color: 'var(--w-warn)' }}>
            ⚠️ 访客模式已禁止上传资料，请先登录账号
          </div>
        ) : busy ? (
          '正在解析中…'
        ) : (
          '点击或拖拽上传 PDF / TXT / Markdown（≤30 MB）'
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown"
        multiple
        style={{ display: 'none' }}
        disabled={isGuest}
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
        }}
      />
      {err && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'rgba(239,108,140,0.1)',
            border: '1px solid rgba(239,108,140,0.3)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--w-bad)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {err}
        </div>
      )}
      <div className="w-doc-list">
        {docs.map((d) => (
          <div className="w-doc-row" key={d.docId}>
            <div className="title">
              <span style={{ fontWeight: 600 }}>📄 {d.filename}</span>
              <button
                type="button"
                className="remove"
                onClick={() => onChange(docs.filter((x) => x.docId !== d.docId))}
              >
                移除
              </button>
            </div>
            <div className="summary">{d.summary}</div>
            <div className="meta">
              {d.chunkCount} 个片段 · {d.hasEmbedding ? '语义检索' : '关键词检索'}
            </div>
          </div>
        ))}
        {docs.length === 0 && !busy && (
          <div style={{ fontSize: 12, color: 'var(--w-ink-soft)', marginTop: 8 }}>
            还没有上传资料。
          </div>
        )}
      </div>
    </div>
  );
}
