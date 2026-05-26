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
}: {
  docs: UploadedDoc[];
  onChange: (next: UploadedDoc[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
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
    [docs, onChange],
  );

  return (
    <div>
      <div
        className={`w-upload-zone${dragging ? ' dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer?.files) upload(e.dataTransfer.files);
        }}
      >
        {busy ? '正在解析中…' : '点击或拖拽上传 PDF / TXT / Markdown（≤30 MB）'}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
        }}
      />
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--w-bad)' }}>
          上传失败：{err}
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
          <div style={{ fontSize: 12, color: 'var(--w-ink-soft)' }}>
            还没有上传资料。上传后可在右侧切换为「我的资料」模式做针对性问答。
          </div>
        )}
      </div>
    </div>
  );
}
