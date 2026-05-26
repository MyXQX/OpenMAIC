/**
 * 物联智讲 - 多 Agent 课堂状态机 + SSE 事件生成
 *
 * MVP 状态机：
 *   - 当历史为空（首回合）           -> teacher 开场讲解
 *   - 当用户消息存在                 -> assistant 回答 + 偶尔 classmate 提误区
 *   - 当 teacher 上一轮 nextState=await_student 而用户回了 -> teacher 继续讲
 *
 * 不是循环跑 LLM N 次，是每次 user 提问只跑 1~2 个 agent，把控延迟。
 */

import { jsonrepair } from 'jsonrepair';
import type { LanguageModel } from 'ai';
import { streamLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import type {
  AgentRole,
  AgentTurn,
  ChatMessage,
  Chapter,
  RetrievedChunk,
  ScientistPersona,
  WulianStreamEvent,
} from '@/lib/wulian/types';
import { buildSystemPrompt, buildUserPrompt } from './prompts';

const log = createLogger('Wulian Orchestrator');

interface RunOptions {
  chapter: Chapter;
  teacherPersona: ScientistPersona;
  /** 用户消息为空时认为是开场 */
  studentMessage: string;
  history: ChatMessage[];
  retrieved: RetrievedChunk[];
  mode: 'course' | 'mine' | 'compare';
  forceAgent?: AgentRole;
  languageModel: LanguageModel;
  signal: AbortSignal;
}

/** 简单状态机：决定本回合让哪些 agent 发言（按顺序） */
function decideAgentSequence(opts: RunOptions): AgentRole[] {
  if (opts.forceAgent) return [opts.forceAgent];
  if (!opts.studentMessage || opts.studentMessage.trim().length === 0) {
    // 开场：老师讲，再让同学提一个误区
    return ['teacher', 'classmate'];
  }
  // 用户提问：助教回答；如果问题较长可能引出新概念，让老师收尾延伸
  return ['assistant'];
}

/** 给历史消息生成简短摘要（用于注入下一轮 prompt） */
function summarizeHistory(history: ChatMessage[]): string {
  if (history.length === 0) return '';
  const last = history.slice(-6);
  return last
    .map((m) => {
      if (m.role === 'user') return `学生：${(m.content as { speech: string }).speech}`;
      const turn = m.content as AgentTurn;
      return `${turn.speakerName}：${turn.speech}`;
    })
    .join('\n');
}

/** 用 LLM 生成一个 agent 的发言（流式） */
async function* runOneAgent(params: {
  role: AgentRole;
  opts: RunOptions;
}): AsyncGenerator<WulianStreamEvent> {
  const { role, opts } = params;
  const teacherPersona = role === 'teacher' ? opts.teacherPersona : undefined;

  const speakerName =
    role === 'teacher'
      ? `${opts.teacherPersona.name} 教授`
      : role === 'assistant'
        ? '小麦 助教'
        : '小恒 同学';
  const speakerId =
    role === 'teacher' ? `teacher_${opts.teacherPersona.id}` : role === 'assistant' ? 'assistant_xiaomai' : 'classmate_xiaoheng';

  yield { type: 'agent_start', speakerRole: role, speakerId, speakerName };

  const system = buildSystemPrompt({
    role,
    teacherPersona,
    chapter: opts.chapter,
    knowledgePointTitle: opts.chapter.knowledgePoints[0]?.title,
    retrieved: opts.retrieved,
    studentMessage: opts.studentMessage,
    conversationDigest: summarizeHistory(opts.history),
    mode: opts.mode,
  });
  const user = buildUserPrompt({
    role,
    teacherPersona,
    chapter: opts.chapter,
    knowledgePointTitle: opts.chapter.knowledgePoints[0]?.title,
    retrieved: opts.retrieved,
    studentMessage: opts.studentMessage,
    conversationDigest: summarizeHistory(opts.history),
    mode: opts.mode,
  });

  let raw = '';
  let speechBuffer = '';
  let speechStarted = false;
  let speechClosed = false;
  // 用增量解析的小巧方式：一边接 token，一边尝试把 speech 字段抽出来送给前端
  // （JSON 还没收完时直接 stream，体验更好）
  try {
    const result = streamLLM(
      {
        model: opts.languageModel,
        system,
        prompt: user,
        temperature: role === 'classmate' ? 0.85 : 0.4,
        abortSignal: opts.signal,
      },
      `wulian-${role}`,
    );

    for await (const chunk of result.textStream) {
      if (opts.signal.aborted) return;
      raw += chunk;

      if (!speechClosed) {
        // 抽取 "speech": "...." 段，做边接边送
        const idx = raw.indexOf('"speech"');
        if (idx >= 0) {
          // 找到 "speech": " 后面的内容到下一未转义引号
          const afterKey = raw.slice(idx);
          const colonIdx = afterKey.indexOf(':');
          const firstQuote = afterKey.indexOf('"', colonIdx + 1);
          if (firstQuote > 0) {
            const valStart = firstQuote + 1;
            // 寻找未转义的结束引号
            let i = valStart;
            let endQuote = -1;
            while (i < afterKey.length) {
              const c = afterKey[i];
              if (c === '\\') {
                i += 2;
                continue;
              }
              if (c === '"') {
                endQuote = i;
                break;
              }
              i++;
            }
            const val = afterKey.slice(valStart, endQuote === -1 ? afterKey.length : endQuote);
            // 解析转义后的可见文本
            const decoded = val
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            const newPart = decoded.slice(speechBuffer.length);
            if (newPart.length > 0) {
              if (!speechStarted) speechStarted = true;
              speechBuffer = decoded;
              yield { type: 'agent_delta', speakerId, deltaText: newPart };
            }
            if (endQuote !== -1) speechClosed = true;
          }
        }
      }
    }
  } catch (err) {
    if (opts.signal.aborted) return;
    log.error(`Agent ${role} stream failed:`, err);
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  // 解析完整 JSON
  const turn = parseAgentTurn(raw, { role, speakerId, speakerName });
  yield { type: 'agent_complete', turn };
}

/** 容错地把 LLM 输出解析成 AgentTurn */
function parseAgentTurn(
  raw: string,
  meta: { role: AgentRole; speakerId: string; speakerName: string },
): AgentTurn {
  let parsed: Record<string, unknown> | null = null;
  // 取出最外层 JSON：找首个 { 到末尾匹配的 }
  const trimmed = raw.trim().replace(/^```json\s*/, '').replace(/```$/, '');
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  const slice = firstBrace !== -1 && lastBrace !== -1 ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;

  try {
    parsed = JSON.parse(slice);
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(slice));
    } catch (err) {
      log.warn(`Failed to parse agent turn JSON: ${(err as Error).message}; raw=${slice.slice(0, 200)}`);
    }
  }

  const obj = parsed ?? {};
  const speech = typeof obj.speech === 'string' && obj.speech.trim().length > 0
    ? obj.speech
    : '（未生成有效讲解。请再问一次。）';

  return {
    speakerRole: meta.role,
    speakerId: meta.speakerId,
    speakerName: meta.speakerName,
    speech,
    whiteboard: Array.isArray(obj.whiteboard) ? (obj.whiteboard as AgentTurn['whiteboard']) : [],
    avatarAction:
      obj.avatarAction && typeof obj.avatarAction === 'object'
        ? (obj.avatarAction as AgentTurn['avatarAction'])
        : { emotion: 'neutral' },
    quiz: obj.quiz && typeof obj.quiz === 'object' ? (obj.quiz as AgentTurn['quiz']) : undefined,
    citations: Array.isArray(obj.citations) ? (obj.citations as string[]) : undefined,
    nextState:
      obj.nextState === 'continue' || obj.nextState === 'await_student' || obj.nextState === 'finished'
        ? (obj.nextState as AgentTurn['nextState'])
        : 'await_student',
  };
}

/** 主入口：跑一回合 */
export async function* runClassroomTurn(opts: RunOptions): AsyncGenerator<WulianStreamEvent> {
  const sequence = decideAgentSequence(opts);
  for (const role of sequence) {
    if (opts.signal.aborted) break;
    yield* runOneAgent({ role, opts });
  }
  yield { type: 'turn_end' };
}
