'use client';

import type { ChatMessage } from '@/lib/wulian/types';
import { MarkdownLite } from './Latex';
import { RoleAvatar, UserAvatar } from './Avatar';
import { QuizCard } from './QuizCard';

export function MessageBubble({
  message,
  chapterId,
  speaking,
}: {
  message: ChatMessage;
  chapterId: string;
  speaking?: boolean;
}) {
  const isUser = message.role === 'user';
  if (isUser) {
    const speech = (message.content as { speech: string }).speech;
    return (
      <div className="w-msg user">
        <UserAvatar size="sm" />
        <div className="w-msg-bubble">
          <MarkdownLite text={speech} />
        </div>
      </div>
    );
  }
  const turn = message.content as Extract<ChatMessage['content'], { speakerRole: unknown }>;
  return (
    <div className="w-msg">
      <RoleAvatar role={turn.speakerRole} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="meta">
          {turn.speakerName}
          {speaking && (
            <span style={{ marginLeft: 8 }}>
              <span className="w-speaking-dot" />
            </span>
          )}
        </div>
        <div className="w-msg-bubble">
          <MarkdownLite text={turn.speech || (speaking ? '…' : '（无内容）')} />
          {turn.citations && turn.citations.length > 0 && (
            <div className="citations">
              引用：
              {turn.citations.map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>
          )}
        </div>
        {turn.quiz && <QuizCard quiz={turn.quiz} chapterId={chapterId} />}
      </div>
    </div>
  );
}
