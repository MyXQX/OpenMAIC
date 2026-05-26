'use client';

import { useState } from 'react';
import type { QuizQuestion } from '@/lib/wulian/types';
import { MarkdownLite } from './Latex';

export function QuizCard({
  quiz,
  chapterId,
}: {
  quiz: QuizQuestion;
  chapterId: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const correctSet = new Set(
    Array.isArray(quiz.answer)
      ? quiz.answer.map(letterOf)
      : quiz.answer
        ? [letterOf(quiz.answer)]
        : [],
  );

  const isMulti = quiz.type === 'multi_choice';
  const isShort = quiz.type === 'short_answer';

  const onPick = (letter: string) => {
    if (submitted) return;
    if (isMulti) {
      setPicked((prev) =>
        prev.includes(letter) ? prev.filter((p) => p !== letter) : [...prev, letter].sort(),
      );
    } else {
      setPicked([letter]);
    }
  };

  const isCorrect = () => {
    if (correctSet.size === 0) return null;
    if (picked.length !== correctSet.size) return false;
    return picked.every((p) => correctSet.has(p));
  };

  const submit = async () => {
    if (picked.length === 0 && !isShort) return;
    setSubmitted(true);
    try {
      await fetch('/api/wulian/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          type: 'quiz',
          payload: {
            quizId: quiz.id,
            picked,
            correct: isCorrect(),
            question: quiz.question,
          },
        }),
      });
    } catch {
      /* 静默失败 */
    }
  };

  return (
    <div className="w-quiz">
      <h5>📝 即时小测</h5>
      <div className="question">
        <MarkdownLite text={quiz.question} />
      </div>
      {!isShort && quiz.options && (
        <div className="options">
          {quiz.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const className = !submitted
              ? ''
              : correctSet.has(letter)
                ? 'correct'
                : picked.includes(letter)
                  ? 'wrong'
                  : '';
            return (
              <label key={i} className={className}>
                <input
                  type={isMulti ? 'checkbox' : 'radio'}
                  name={quiz.id}
                  checked={picked.includes(letter)}
                  onChange={() => onPick(letter)}
                  disabled={submitted}
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      )}
      {isShort && (
        <textarea
          placeholder="请简要写下你的回答…"
          rows={3}
          value={picked[0] ?? ''}
          onChange={(e) => setPicked([e.target.value])}
          disabled={submitted}
          style={{
            width: '100%',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.2)',
            color: 'var(--w-ink)',
            border: '1px solid var(--w-border)',
            padding: 8,
            fontFamily: 'inherit',
            fontSize: 13,
          }}
        />
      )}
      {!submitted ? (
        <div className="actions">
          <button onClick={submit}>提交</button>
        </div>
      ) : (
        <>
          {correctSet.size > 0 && !isShort && (
            <div className="explanation">
              {isCorrect() ? '✅ 答对了！' : `❌ 标准答案：${[...correctSet].join('、')}`}
              {quiz.explanation ? `\n${quiz.explanation}` : ''}
            </div>
          )}
          {isShort && quiz.explanation && (
            <div className="explanation">参考：{quiz.explanation}</div>
          )}
        </>
      )}
    </div>
  );
}

function letterOf(s: string): string {
  // 接受 "A"、"a"、"A. xxx"、"选项A" 等多种写法
  const m = /[A-Za-z]/.exec(s);
  return m ? m[0].toUpperCase() : s;
}
