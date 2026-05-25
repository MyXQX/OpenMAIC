/**
 * app/api/generate/agent-profiles/route.ts
 * 
 * 文件作用：
 * 代理配置生成API端点。根据课程阶段信息和场景大纲生成AI代理配置。
 * 代理包括教师（teacher）、助手（assistant）和学生（student）三个角色。
 * 
 * 运行机理：
 * 1. 输入参数：
 *    - stage：课程阶段信息（标题、学习目标等）
 *    - outlines：场景大纲数组
 *    - 可选的：教学风格、代理偏好等
 * 2. 代理角色定义：
 *    - teacher：主教师代理，讲授课程内容
 *    - assistant：助理代理，提供学习支持和答疑
 *    - student：学生代理，代表学生角色进行交互
 * 3. 代理生成流程：
 *    - 调用 LLM 根据课程信息生成每个角色的配置
 *    - 每个代理的配置包括：名称、角色描述、个性特点、知识背景等
 *    - 确保代理之间的互补和一致性
 * 4. 配置信息：
 *    - 代理头像或形象选择
 *    - 代理的语气和表达风格
 *    - 代理的知识领域和专业背景
 * 5. 用途：
 *    - 在课堂中为不同的交互场景使用不同的代理
 *    - 增强课堂的互动性和沉浸感
 * 
 * 与其他代码的关联：
 * - Stage (lib/types/stage)：课程阶段数据结构
 * - SceneOutline (lib/types/generation)：场景大纲
 * - Agent (lib/types/agent)：代理配置数据结构
 * - /api/chat：聊天API 中使用生成的代理配置
 */

/**
 * Agent Profiles Generation API
 *
 * Generates agent profiles (teacher, assistant, student) for a course stage
 * based on stage info and scene outlines.
 */

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { AGENT_COLOR_PALETTE } from '@/lib/constants/agent-defaults';

const log = createLogger('Agent Profiles API');

export const maxDuration = 120;

interface RequestBody {
  stageInfo: { name: string; description?: string };
  sceneOutlines?: { title: string; description?: string }[];
  languageDirective: string;
  availableAvatars: string[];
  avatarDescriptions?: Array<{ path: string; desc: string }>;
  availableVoices?: Array<{
    providerId: string;
    voiceId: string;
    voiceName: string;
    voiceLanguage?: string;
  }>;
}

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

export async function POST(req: NextRequest) {
  let stageName: string | undefined;
  let modelString: string | undefined;
  try {
    const body = (await req.json()) as RequestBody;
    const {
      stageInfo,
      sceneOutlines,
      languageDirective,
      availableAvatars,
      avatarDescriptions,
      availableVoices,
    } = body;
    stageName = stageInfo?.name;

    // ── Validate required fields ──
    if (!stageInfo?.name) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageInfo.name is required');
    }
    if (!languageDirective) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'languageDirective is required');
    }
    if (!availableAvatars || availableAvatars.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'availableAvatars is required and must not be empty',
      );
    }

    // ── Model resolution from request headers/body ──
    const {
      model: languageModel,
      modelString: _modelString,
      thinkingConfig,
    } = await resolveModelFromRequest(req, body);
    modelString = _modelString;

    // ── Build prompt ──
    const sceneSummary = sceneOutlines?.length
      ? sceneOutlines
          .map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ''}`)
          .join('\n')
      : null;

    const systemPrompt = `You are an expert instructional designer. Generate agent profiles for a multi-agent classroom simulation. Decide the appropriate number of agents (typically 3-5) based on the course content and complexity. Return ONLY valid JSON, no markdown or explanation.`;

    // Build voice list for prompt (if available)
    const voiceListStr =
      availableVoices && availableVoices.length > 0
        ? JSON.stringify(
            availableVoices.map((v) => ({
              id: `${v.providerId}::${v.voiceId}`,
              name: v.voiceName,
              language: v.voiceLanguage || 'unknown',
            })),
          )
        : '';

    const voicePrompt = voiceListStr
      ? `- Each agent should be assigned a voice that matches their persona from this list: ${voiceListStr}
  - Prefer a voice whose language matches the course language directive
  - Pick a voice that suits the agent's personality and role (e.g. authoritative voice for teacher, lively voice for energetic student)
  - Try to use different voices for each agent`
      : '';

    const voiceJsonField = voiceListStr
      ? ',\n      "voice": "string (voice id from available list, e.g. \'qwen-tts::Cherry\')"'
      : '';

    const userPrompt = `Generate agent profiles for the following course:

Course name: ${stageInfo.name}
${stageInfo.description ? `Course description: ${stageInfo.description}` : ''}
${sceneSummary ? `\nScene outlines:\n${sceneSummary}\n` : ''}
Requirements:
- Decide the appropriate number of agents based on the course content (typically 3-5)
- Exactly 1 agent must have role "teacher", the rest can be "assistant" or "student"
- Priority values: teacher=10 (highest), assistant=7, student=4-6
- Each agent needs: name, role, persona (2-3 sentences describing personality and teaching/learning style)
- Language directive for this course: ${languageDirective}
  Agent names and personas must follow this language directive.
- Each agent must be assigned one avatar from this list: ${JSON.stringify(avatarDescriptions && avatarDescriptions.length > 0 ? avatarDescriptions.map((a) => ({ path: a.path, description: a.desc })) : availableAvatars)}
  - Pick an avatar that visually matches the agent's personality and role
  - Try to use different avatars for each agent
  - Use the "path" value as the avatar field in the output
- Each agent must be assigned one color from this list: ${JSON.stringify(AGENT_COLOR_PALETTE)}
  - Each agent must have a different color
${voicePrompt}

Return a JSON object with this exact structure:
{
  "agents": [
    {
      "name": "string",
      "role": "teacher" | "assistant" | "student",
      "persona": "string (2-3 sentences)",
      "avatar": "string (from available list)",
      "color": "string (hex color from palette)",
      "priority": number (10 for teacher, 7 for assistant, 4-6 for student)${voiceJsonField}
    }
  ]
}`;

    log.info(`Generating agent profiles for "${stageInfo.name}" [model=${modelString}]`);

    const rawResult = (
      await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
        },
        'agent-profiles',
        undefined,
        thinkingConfig,
      )
    ).text;

    // ── Parse LLM response ──
    const rawText = stripCodeFences(rawResult);
    let parsed: {
      agents: Array<{
        name: string;
        role: string;
        persona: string;
        avatar: string;
        color: string;
        priority: number;
        voice?: string;
      }>;
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
      log.error('Failed to parse LLM response as JSON:', rawText.substring(0, 500));
      return apiError('PARSE_FAILED', 500, 'Failed to parse agent profiles from LLM response');
    }

    // ── Validate parsed structure ──
    if (!parsed.agents || !Array.isArray(parsed.agents) || parsed.agents.length < 2) {
      log.error(`Expected at least 2 agents, got ${parsed.agents?.length ?? 0}`);
      return apiError(
        'GENERATION_FAILED',
        500,
        `Expected at least 2 agents but LLM returned ${parsed.agents?.length ?? 0}`,
      );
    }

    const teacherCount = parsed.agents.filter((a) => a.role === 'teacher').length;
    if (teacherCount !== 1) {
      log.error(`Expected exactly 1 teacher, got ${teacherCount}`);
      return apiError(
        'GENERATION_FAILED',
        500,
        `Expected exactly 1 teacher but LLM returned ${teacherCount}`,
      );
    }

    // ── Build output with IDs ──
    const agents = parsed.agents.map((agent, index) => {
      // Parse voice "providerId::voiceId" format
      let voiceConfig: { providerId: string; voiceId: string } | undefined;
      if (agent.voice && agent.voice.includes('::')) {
        const [providerId, voiceId] = agent.voice.split('::');
        if (providerId && voiceId) {
          voiceConfig = { providerId, voiceId };
        }
      }

      return {
        id: `gen-${nanoid(8)}`,
        name: agent.name,
        role: agent.role,
        persona: agent.persona,
        avatar: agent.avatar || availableAvatars[index % availableAvatars.length],
        color: agent.color || AGENT_COLOR_PALETTE[index % AGENT_COLOR_PALETTE.length],
        priority:
          agent.priority ?? (agent.role === 'teacher' ? 10 : agent.role === 'assistant' ? 7 : 5),
        ...(voiceConfig ? { voiceConfig } : {}),
      };
    });

    log.info(`Successfully generated ${agents.length} agent profiles for "${stageInfo.name}"`);

    return apiSuccess({ agents });
  } catch (error) {
    log.error(
      `Agent profiles generation failed [stage="${stageName ?? 'unknown'}", model=${modelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
