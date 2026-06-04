'use client';

import { useMemo } from 'react';

interface SubtitleOverlayProps {
  speakerName: string | null;
  speechText: string | null;
  activeSpeakerId: string | null;
}

export function SubtitleOverlay({
  speakerName,
  speechText,
  activeSpeakerId,
}: SubtitleOverlayProps) {
  // 决定音色头像和边框高亮色
  const speakerColor = useMemo(() => {
    if (!activeSpeakerId) return 'var(--w-ink-soft)';
    if (activeSpeakerId.startsWith('teacher_')) {
      return 'var(--w-accent-soft)'; // 科学家（黄/金）
    }
    if (activeSpeakerId === 'assistant_xiaomai') {
      return '#60a5fa'; // 助教小麦（淡蓝）
    }
    if (activeSpeakerId === 'classmate_xiaoheng') {
      return 'var(--w-good)'; // 同学小恒（翠绿）
    }
    return 'var(--w-accent-soft)';
  }, [activeSpeakerId]);

  if (!speechText) return null;

  return (
    <div className="w-subtitle-overlay animate-slide-up">
      <div className="w-subtitle-bubble">
        {speakerName && (
          <div className="w-subtitle-speaker" style={{ color: speakerColor }}>
            <span className="w-pulse-dot" style={{ backgroundColor: speakerColor }} />
            {speakerName}
          </div>
        )}
        <div className="w-subtitle-text">{speechText}</div>
      </div>

      <style jsx global>{`
        .w-subtitle-overlay {
          position: absolute;
          bottom: 20px;
          left: 5%;
          right: 5%;
          z-index: 15;
          pointer-events: none; /* 穿透鼠标，不影响 PPT 的其它点按 */
          display: flex;
          justify-content: center;
        }
        .w-subtitle-bubble {
          background: rgba(13, 20, 36, 0.85);
          border: 1px solid var(--w-border);
          border-left: 4px solid var(--w-accent);
          border-radius: 12px;
          padding: 12px 18px;
          max-width: 800px;
          width: 100%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .w-subtitle-speaker {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
          text-transform: uppercase;
        }
        .w-subtitle-text {
          font-size: 14px;
          line-height: 1.6;
          color: var(--w-ink);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
        }
        .w-pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
          animation: w-pulse 1.2s infinite ease-in-out;
        }

        .animate-slide-up {
          animation: slideUp 0.3s ease-out forwards;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes w-pulse {
          0% {
            transform: scale(0.85);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(0.85);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}
