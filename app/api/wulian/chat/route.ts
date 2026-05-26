/**
 * POST /api/wulian/chat
 *
 * 物联智讲 - 多 Agent 课堂主接口（SSE 流）
 *
 * Request body: ChatRequestBody
 * Response: text/event-stream，事件类型见 lib/wulian/types.ts -> WulianStreamEvent
 *
 * 支持 header：
 *   x-model    : 模型字符串，如 "deepseek:deepseek-v4-flash"
 *   x-api-key  : 当用户在前端「设置」里配置时传过来；服务端没有时回退到 .env.local
 *   x-base-url : 自定义网关
 *
 * 学生侧不需要修改任何模型参数 - 默认走 .env.local 的 DEFAULT_MODEL。
 */

import { NextRequest } from 'next/server';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import { apiError } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';
import type { ChatRequestBody, WulianStreamEvent } from '@/lib/wulian/types';
import { getChapter } from '@/lib/wulian/agents/chapter';
import { getPersona } from '@/lib/wulian/agents/persona';
import { runClassroomTurn } from '@/lib/wulian/agents/orchestrator';
import { retrieve } from '@/lib/wulian/rag/store';

const log = createLogger('Wulian Chat API');

export const maxDuration = 60;

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

    // 解析模型
    let resolved;
    try {
      resolved = await resolveModelFromHeaders(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/API key required/i.test(msg) || /api[-_]?key/i.test(msg)) {
        return apiError(
          'MISSING_API_KEY',
          401,
          '需要配置 API Key。请在项目根的 .env.local 中至少填入一个：DEEPSEEK_API_KEY、QWEN_API_KEY、OPENAI_API_KEY、GLM_API_KEY 等，并设置 DEFAULT_MODEL（如 deepseek:deepseek-v4-flash）。',
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

    // 检索资料：用最近的用户消息（或开场前的"导入提示"）作为 query
    const queryForRetrieval = body.userMessage?.trim() || `${chapter.title} ${chapter.objectives.join(' ')}`;
    const retrieved = await retrieve({
      chapterId: chapter.id,
      query: queryForRetrieval,
      uploadedDocIds: body.uploadedDocIds,
      mode: body.mode ?? 'course',
      topK: 4,
    });

    log.info(
      `chapter=${chapter.id} mode=${body.mode ?? 'course'} retrieved=${retrieved.length} model=${resolved.modelString}`,
    );

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

    // 心跳保活（防代理 30s 超时）
    const heartbeat = setInterval(() => {
      writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => clearInterval(heartbeat));
    }, 15_000);

    (async () => {
      try {
        for await (const event of runClassroomTurn({
          chapter,
          teacherPersona,
          studentMessage: body!.userMessage ?? '',
          history: body!.history ?? [],
          retrieved,
          mode: body!.mode ?? 'course',
          forceAgent: body!.forceAgent,
          languageModel: resolved.model,
          signal,
        })) {
          if (signal.aborted) break;
          await send(event);
        }
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
