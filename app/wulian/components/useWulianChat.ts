'use client';

/**
 * useWulianChat
 *
 * 管理与 /api/wulian/chat 的 SSE 会话。
 * - 收到 agent_start 时新建一个 ChatMessage（agent，speech 暂为空）
 * - 收到 agent_delta 时把 deltaText 追加到 speech
 * - 收到 agent_complete 时用完整 turn 替换该消息（保留 speech、补 whiteboard/quiz/...）
 * - 收到 turn_end / error 时结束 loading
 *
 * 不持久化历史，刷新即重置（MVP 不做用户系统）。
 */

import { useCallback, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type {
  AgentTurn,
  ChatMessage,
  ChatRequestBody,
  WhiteboardItem,
  WulianStreamEvent,
} from '@/lib/wulian/types';

interface SendOptions {
  forceAgent?: ChatRequestBody['forceAgent'];
}

interface UseWulianChatArgs {
  chapterId: string;
  uploadedDocIds: string[];
  mode: 'course' | 'mine' | 'compare';
}

export function useWulianChat({ chapterId, uploadedDocIds, mode }: UseWulianChatArgs) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [whiteboardItems, setWhiteboardItems] = useState<WhiteboardItem[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (userMessage: string, opts?: SendOptions) => {
      if (loading) return;
      const trimmed = userMessage.trim();

      // 把用户消息塞进列表
      const userMsg: ChatMessage | null =
        trimmed.length > 0
          ? {
              id: nanoid(8),
              role: 'user',
              content: { speech: trimmed },
              timestamp: Date.now(),
            }
          : null;
      const baseMessages = userMsg ? [...messages, userMsg] : messages;
      if (userMsg) setMessages(baseMessages);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);

      const body: ChatRequestBody = {
        chapterId,
        userMessage: trimmed,
        history: messages,
        uploadedDocIds,
        mode,
        forceAgent: opts?.forceAgent,
      };

      try {
        const res = await fetch('/api/wulian/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const txt = await res.text();
          let msg = res.statusText || 'request failed';
          try {
            const parsed = JSON.parse(txt);
            if (parsed && typeof parsed.error === 'string') msg = parsed.error;
          } catch {
            if (txt) msg = txt;
          }
          setError(msg);
          setLoading(false);
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        // 当前正在流式接收的 agent message id
        let activeMsgId: string | null = null;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE 用空行分隔消息
          let idx = buffer.indexOf('\n\n');
          while (idx !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            idx = buffer.indexOf('\n\n');

            const lines = raw.split('\n').filter((l) => l.startsWith('data:'));
            if (lines.length === 0) continue;
            const json = lines.map((l) => l.slice(5).trim()).join('');
            if (!json) continue;
            let event: WulianStreamEvent;
            try {
              event = JSON.parse(json);
            } catch {
              continue;
            }

            if (event.type === 'agent_start') {
              const id = nanoid(8);
              activeMsgId = id;
              setActiveSpeakerId(event.speakerId);
              const placeholder: ChatMessage = {
                id,
                role: 'agent',
                content: {
                  speakerRole: event.speakerRole,
                  speakerId: event.speakerId,
                  speakerName: event.speakerName,
                  speech: '',
                  nextState: 'continue',
                } satisfies AgentTurn,
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev, placeholder]);
            } else if (event.type === 'agent_delta') {
              if (!activeMsgId) continue;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== activeMsgId) return m;
                  const turn = m.content as AgentTurn;
                  return {
                    ...m,
                    content: { ...turn, speech: turn.speech + event.deltaText },
                  };
                }),
              );
            } else if (event.type === 'agent_complete') {
              if (!activeMsgId) {
                // 容错：没收到 start 就直接收到 complete
                setMessages((prev) => [
                  ...prev,
                  {
                    id: nanoid(8),
                    role: 'agent',
                    content: event.turn,
                    timestamp: Date.now(),
                  },
                ]);
              } else {
                setMessages((prev) =>
                  prev.map((m) => (m.id === activeMsgId ? { ...m, content: event.turn } : m)),
                );
              }
              // 同步 whiteboard
              if (event.turn.whiteboard && event.turn.whiteboard.length > 0) {
                setWhiteboardItems((prev) => [...prev, ...event.turn.whiteboard!]);
              }
              activeMsgId = null;
              setActiveSpeakerId(null);
            } else if (event.type === 'error') {
              setError(event.message);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setActiveSpeakerId(null);
        abortRef.current = null;
      }
    },
    [chapterId, loading, messages, mode, uploadedDocIds],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setActiveSpeakerId(null);
  }, []);

  const clearWhiteboard = useCallback(() => setWhiteboardItems([]), []);
  const reset = useCallback(() => {
    cancel();
    setMessages([]);
    setWhiteboardItems([]);
    setError(null);
  }, [cancel]);

  return {
    messages,
    whiteboardItems,
    activeSpeakerId,
    loading,
    error,
    send,
    cancel,
    clearWhiteboard,
    reset,
  };
}
