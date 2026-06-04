'use client';

import { useState } from 'react';

interface PromptsTabProps {
  onSendPrompt: (prompt: string) => void;
  disabled: boolean;
}

const PRESETS = [
  { text: '🔄 请老师重讲一下刚才这一页', label: '重讲这一页' },
  { text: '💡 帮我用更通俗（大白话）的语言解释公式含义', label: '通俗解释公式' },
  { text: '📊 帮我用图示或者物理示意图详细说明', label: '请求图示说明' },
  { text: '📝 围绕当前核心物理原理出一道选择题测试我', label: '进行课堂提问' },
  { text: '❓ 我对这个原理的适用范围有些疑问：', label: '适用范围疑问' },
  { text: '🔬 科学家老师，当年您是怎么想到这个实验设计的？', label: '追问实验灵感' },
];

export function PromptsTab({ onSendPrompt, disabled }: PromptsTabProps) {
  const [input, setInput] = useState('');

  const handlePresetClick = (text: string) => {
    setInput((prev) => {
      if (prev.endsWith('：') || prev.endsWith(':')) {
        return prev + text.replace(/^[^\w\u4e00-\u9fa5]+/, '');
      }
      return text;
    });
  };

  const handleSend = () => {
    const val = input.trim();
    if (!val || disabled) return;
    onSendPrompt(val);
    setInput('');
  };

  return (
    <div className="w-prompts-tab">
      <div style={{ fontSize: 12, color: 'var(--w-ink-soft)', marginBottom: 8, fontWeight: 500 }}>
        快捷学术指令
      </div>
      <div className="w-presets-grid">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            type="button"
            className="preset-btn"
            onClick={() => handlePresetClick(p.text)}
            disabled={disabled}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--w-ink-soft)', marginTop: 16, marginBottom: 8, fontWeight: 500 }}>
        自定义学术提问
      </div>
      <div className="w-custom-prompt-box">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="在此输入您的学术提问或指令..."
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="send-btn"
        >
          {disabled ? '思考中…' : '向老师发送'}
        </button>
      </div>

      <style jsx global>{`
        .w-prompts-tab {
          display: flex;
          flex-direction: column;
        }
        .w-presets-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .preset-btn {
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
          border-radius: 8px;
          padding: 10px 8px;
          font-size: 11px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
          line-height: 1.4;
        }
        .preset-btn:hover:not(:disabled) {
          border-color: var(--w-accent-soft);
          background: rgba(216, 160, 74, 0.08);
          color: var(--w-accent-soft);
        }
        .preset-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .w-custom-prompt-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .w-custom-prompt-box textarea {
          width: 100%;
          height: 100px;
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          resize: none;
          font-family: inherit;
          outline: none;
          line-height: 1.5;
        }
        .w-custom-prompt-box textarea:focus {
          border-color: var(--w-accent);
        }
        .w-custom-prompt-box .send-btn {
          align-self: flex-end;
          background: var(--w-accent);
          color: #1a1a1a;
          border: 0;
          border-radius: 8px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .w-custom-prompt-box .send-btn:hover:not(:disabled) {
          background: var(--w-accent-soft);
        }
        .w-custom-prompt-box .send-btn:disabled {
          background: var(--w-border);
          color: var(--w-ink-soft);
          cursor: not-allowed;
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
