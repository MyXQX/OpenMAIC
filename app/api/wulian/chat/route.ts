import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import { apiError } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';
import type {
  ChatRequestBody,
  WulianStreamEvent,
  WhiteboardItem,
  AgentRole,
  ChatMessage,
} from '@/lib/wulian/types';
import { getChapter } from '@/lib/wulian/agents/chapter';
import { getPersona } from '@/lib/wulian/agents/persona';
import { retrieveForUser } from '@/lib/wulian/rag/store';
import { getUserIdFromSessionToken, SESSION_COOKIE_NAME } from '@/lib/wulian/auth/session';
import { getClassroomInstance } from '@/lib/wulian/storage';
import { mapWulianAgentsToMaic } from '@/lib/wulian/agents/agent-mapper';
import { statelessGenerate } from '@/lib/orchestration/stateless-generate';
import type { StatelessChatRequest } from '@/lib/types/chat';
import type { UIMessage } from 'ai';

const log = createLogger('Wulian Chat API');

export const maxDuration = 60;

/**
 * Maps MAIC whiteboard actions to Wulian whiteboard items.
 */
function maicActionToWulianWhiteboard(name: string, params: any): WhiteboardItem | null {
  if (name === 'wb_draw_latex') {
    return { type: 'formula', latex: String(params.latex || ''), caption: String(params.caption || '') };
  }
  if (name === 'wb_draw_text') {
    return { type: 'note', markdown: String(params.content || params.markdown || '') };
  }
  if (name === 'wb_draw_chart' || name === 'wb_draw_shape') {
    return {
      type: 'figure',
      svg: String(params.svg || params.shapeName || ''),
      caption: String(params.caption || ''),
    };
  }
  if (name === 'wb_draw_code' || name === 'wb_edit_code') {
    return {
      type: 'note',
      markdown: `\`\`\`${params.language || 'code'}\n${params.code || ''}\n\`\`\``,
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let body: ChatRequestBody | null = null;

  try {
    body = (await req.json()) as ChatRequestBody;

    if (!body.chapterId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'chapterId is required');
    }
    const chapter = await getChapter(body.chapterId);
    if (!chapter) {
      return apiError('INVALID_REQUEST', 404, `Chapter not found: ${body.chapterId}`);
    }
    const teacherPersona = await getPersona(chapter.primaryScientist);
    if (!teacherPersona) {
      return apiError('INVALID_REQUEST', 500, `Persona missing: ${chapter.primaryScientist}`);
    }

    const secondaryScientist = chapter.secondaryScientist
      ? await getPersona(chapter.secondaryScientist)
      : null;

    // 获取登录状态隔离键
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const userId = (await getUserIdFromSessionToken(sessionToken)) || 'guest';

    // 解析模型与鉴权凭据
    let resolved;
    try {
      resolved = await resolveModelFromHeaders(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/API key required/i.test(msg) || /api[-_]?key/i.test(msg)) {
        return apiError(
          'MISSING_API_KEY',
          401,
          '需要配置 API Key。请在项目根的 .env.local 中填入 DEEPSEEK_API_KEY 或 QWEN_API_KEY 等。',
        );
      }
      throw err;
    }
    if (isProviderKeyRequired(resolved.providerId) && !resolved.apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        '需要配置 API Key。请在 .env.local 中填入对应 provider 的 *_API_KEY。',
      );
    }

    // 检索资料（已升级为按用户隔离检索，需求 2.3）
    const queryForRetrieval =
      body.userMessage?.trim() || `${chapter.title} ${chapter.objectives.join(' ')}`;
    const retrieved = await retrieveForUser({
      userId,
      chapterId: chapter.id,
      query: queryForRetrieval,
      uploadedDocIds: body.uploadedDocIds,
      mode: body.mode ?? 'course',
      topK: 4,
    });

    log.info(
      `[Chat] chapter=${chapter.id} user=${userId} mode=${body.mode ?? 'course'} retrieved=${retrieved.length} model=${resolved.modelString}`,
    );

    // 载入定制课堂实例，重建 storeState 信息
    let storeState = {
      stage: {
        id: 'temp-stage',
        name: chapter.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any,
      scenes: [] as any[],
      currentSceneId: null as string | null,
      mode: 'playback' as const,
      whiteboardOpen: false,
    };

    if (body.classroomId && userId !== 'guest') {
      try {
        const instance = await getClassroomInstance(userId, body.classroomId);
        if (instance) {
          storeState = {
            stage: instance.stage,
            scenes: instance.scenes,
            currentSceneId: instance.scenes[0]?.id || null,
            mode: 'playback',
            whiteboardOpen: false,
          };
        }
      } catch (err) {
        log.warn(`Failed to preload classroom instance ${body.classroomId} for chat RAG context:`, err);
      }
    }

    // 映射消息历史记录为 standard UIMessages
    const historyList = body.history || [];
    const messages: any[] = historyList.map((m) => {
      const isUser = m.role === 'user';
      const contentStr = isUser
        ? (m.content as { speech: string }).speech
        : (m.content as any).speech;
      const metadata = isUser
        ? {}
        : {
            agentId: (m.content as any).speakerId,
            senderName: (m.content as any).speakerName,
            originalRole: (m.content as any).speakerRole,
          };

      return {
        id: m.id || nanoid(),
        role: isUser ? 'user' : 'assistant',
        content: contentStr,
        metadata,
      };
    });

    if (body.userMessage) {
      messages.push({
        id: nanoid(),
        role: 'user',
        content: body.userMessage,
      });
    }

    // 构建 LangGraph Orchestration 配置
    const agentConfigs = mapWulianAgentsToMaic(teacherPersona, secondaryScientist);
    const triggerAgentId = body.forceAgent || (body.userMessage ? 'assistant' : 'teacher');

    const chatConfig = {
      agentIds: agentConfigs.map((a) => a.id),
      agentConfigs,
      sessionType: 'discussion' as const,
      discussionTopic: body.userMessage || `${chapter.title}的讲解与互动讨论`,
      discussionPrompt: retrieved.length > 0
        ? `参考检索资料：\n${retrieved.map((r, idx) => `[#${idx + 1}] ${r.text}`).join('\n')}`
        : '请基于你的知识体系和历史角色口吻进行讨论。',
      triggerAgentId,
    };

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const signal = req.signal;

    const send = async (event: WulianStreamEvent) => {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch {
        /* writer closed */
      }
    };

    // 心跳保活
    const heartbeat = setInterval(() => {
      writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => clearInterval(heartbeat));
    }, 15_000);

    (async () => {
      try {
        let currentSpeech = '';
        let currentAgentId = '';
        let currentSpeakerRole: AgentRole = 'teacher';
        let currentSpeakerId = '';
        let currentSpeakerName = '';
        let currentWhiteboard: WhiteboardItem[] = [];

        const flushCurrentAgent = async () => {
          if (currentAgentId) {
            await send({
              type: 'agent_complete',
              turn: {
                speakerRole: currentSpeakerRole,
                speakerId: currentSpeakerId,
                speakerName: currentSpeakerName,
                speech: currentSpeech || '（正在思考中...）',
                whiteboard: currentWhiteboard.length > 0 ? currentWhiteboard : undefined,
                avatarAction: { emotion: 'neutral' },
                nextState: 'await_student',
              },
            });
            currentSpeech = '';
            currentWhiteboard = [];
            currentAgentId = '';
          }
        };

        const statelessRequest: StatelessChatRequest = {
          messages: messages as any,
          storeState,
          config: chatConfig as any,
          apiKey: resolved.apiKey || '',
          baseUrl: resolved.baseUrl || undefined,
          model: resolved.modelString,
        };

        const abortController = new AbortController();
        signal.addEventListener('abort', () => abortController.abort());

        const generator = statelessGenerate(
          statelessRequest,
          abortController.signal,
          resolved.model,
          undefined,
        );

        for await (const event of generator) {
          if (signal.aborted) break;

          if (event.type === 'agent_start') {
            await flushCurrentAgent();
            currentAgentId = event.data.agentId;
            currentSpeakerRole =
              currentAgentId === 'teacher'
                ? 'teacher'
                : currentAgentId === 'assistant'
                  ? 'assistant'
                  : 'classmate';
            currentSpeakerId =
              currentAgentId === 'teacher'
                ? `teacher_${teacherPersona.id}`
                : currentAgentId === 'assistant'
                  ? 'assistant_xiaomai'
                  : 'classmate_xiaoheng';
            currentSpeakerName =
              currentAgentId === 'teacher'
                ? `${teacherPersona.name} 教授`
                : currentAgentId === 'assistant'
                  ? '小麦 助教'
                  : '小恒 同学';

            await send({
              type: 'agent_start',
              speakerRole: currentSpeakerRole,
              speakerId: currentSpeakerId,
              speakerName: currentSpeakerName,
            });
          } else if (event.type === 'text_delta') {
            currentSpeech += event.data.content;
            await send({
              type: 'agent_delta',
              speakerId: currentSpeakerId,
              deltaText: event.data.content,
            });
          } else if (event.type === 'action') {
            const wbItem = maicActionToWulianWhiteboard(event.data.actionName, event.data.params);
            if (wbItem) {
              currentWhiteboard.push(wbItem);
            }
          } else if (event.type === 'error') {
            await send({
              type: 'error',
              message: event.data.message,
            });
          }
        }

        await flushCurrentAgent();
        await send({ type: 'turn_end' });

      } catch (err) {
        log.error('orchestration error:', err);
        await send({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearInterval(heartbeat);
        try {
          await writer.close();
        } catch {
          /* already closed */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    log.error(`chat POST failed (chapter=${body?.chapterId ?? 'n/a'}):`, err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : 'chat failed',
    );
  }
}
