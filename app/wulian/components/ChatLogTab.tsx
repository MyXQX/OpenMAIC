'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/wulian/types';
import { MessageBubble } from './MessageBubble';

interface ChatLogTabProps {
  messages: ChatMessage[];
  activeSpeakerId: string | null;
  loading: boolean;
  error: string | null;
  onSendMessage: (text: string) => void;
  onCancelMessage: () => void;
  chapterId: string;
}

export function ChatLogTab({
  messages,
  activeSpeakerId,
  loading,
  error,
  onSendMessage,
  onCancelMessage,
  chapterId,
}: ChatLogTabProps) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, activeSpeakerId]);

  const handleSend = () => {
    const val = input.trim();
    if (!val || loading) return;
    onSendMessage(val);
    setInput('');
  };

  return (
    <div className="w-chat-log-tab">
      {/* 消息时间轴 */}
      <div className="w-msg-list" ref={listRef}>
        {messages.length === 0 ? (
          <div className="w-chat-log-empty">
            课堂转写流尚未开始。
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              chapterId={chapterId}
              speaking={
                m.role === 'agent' &&
                'speakerId' in m.content &&
                activeSpeakerId === m.content.speakerId
              }
            />
          ))
        )}
      </div>

      {error && (
        <div className="w-chat-log-error">
          ⚠️ {error}
        </div>
      )}

      {/* 底部提问输入行 */}
      <div className="w-chat-input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? '老师回答中...' : '输入学术问题或指令，按 Enter 发送...'}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="button-group">
          {loading ? (
            <button type="button" className="stop-btn" onClick={onCancelMessage}>
              ⏹ 停止
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              发送
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        .w-chat-log-tab {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }
        .w-chat-log-empty {
          color: var(--w-ink-soft);
          font-size: 13px;
          text-align: center;
          margin-top: 80px;
          font-style: italic;
        }
        .w-chat-log-error {
          margin: 8px 12px;
          padding: 8px 10px;
          background: rgba(239, 108, 140, 0.1);
          border: 1px solid rgba(239, 108, 140, 0.3);
          border-radius: 8px;
          font-size: 12px;
          color: var(--w-bad);
        }
        .w-chat-input-area {
          border-top: 1px solid var(--w-border);
          padding: 12px 10px 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: rgba(13, 20, 36, 0.2);
        }
        .w-chat-input-area textarea {
          width: 100%;
          height: 60px;
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          resize: none;
          outline: none;
          font-family: inherit;
          line-height: 1.5;
        }
        .w-chat-input-area textarea:focus {
          border-color: var(--w-accent);
        }
        .w-chat-input-area .button-group {
          display: flex;
          justify-content: flex-end;
        }
        .w-chat-input-area .send-btn {
          background: var(--w-accent);
          color: #1a1a1a;
          border: 0;
          border-radius: 6px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .w-chat-input-area .send-btn:hover:not(:disabled) {
          background: var(--w-accent-soft);
        }
        .w-chat-input-area .send-btn:disabled {
          background: var(--w-border);
          color: var(--w-ink-soft);
          cursor: not-allowed;
          opacity: 0.5;
        }
        .w-chat-input-area .stop-btn {
          background: var(--w-bad);
          color: white;
          border: 0;
          border-radius: 6px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
