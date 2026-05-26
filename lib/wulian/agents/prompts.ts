/**
 * 物联智讲 - 角色 Prompt 构建
 *
 * 三类 Agent 共用一个输出协议（参见 types.ts 的 AgentTurn）。
 * 每个 Agent 只是 system prompt 和 few-shot 不同。
 */

import type { AgentRole, Chapter, RetrievedChunk, ScientistPersona } from '@/lib/wulian/types';

export interface PromptBuildContext {
  role: AgentRole;
  /** 教师角色时使用 */
  teacherPersona?: ScientistPersona;
  chapter: Chapter;
  knowledgePointTitle?: string;
  /** 已检索到的资料片段 */
  retrieved: RetrievedChunk[];
  /** 学生最近的问题（可空，开场时为空） */
  studentMessage?: string;
  /** 历史对话简述（可空） */
  conversationDigest?: string;
  /** 当前学习模式 */
  mode: 'course' | 'mine' | 'compare';
}

const OUTPUT_PROTOCOL = `
你必须用一段中文 JSON 回复，不要包裹任何其它文字、不要使用 \`\`\`json\`\`\` 包裹。
JSON 结构：
{
  "speech": "string，给学生的口语化讲解或回答（80~250 字），不要在这里写 LaTeX 公式，公式放到 whiteboard。",
  "whiteboard": [
    { "type": "formula", "latex": "string，KaTeX 语法", "caption": "中文说明（可选）" }
    | { "type": "note", "markdown": "用 Markdown 写要点，可包含 LaTeX，如 $...$" }
    | { "type": "figure", "svg": "<svg ...>...</svg> 内联 SVG（可选）", "caption": "string" }
    | { "type": "simulation", "simulationId": "已注册的组件 id", "params": { ... } }
  ],
  "avatarAction": { "emotion": "neutral|thoughtful|excited|concerned|curious", "gesture": "string，可选" },
  "quiz": null 或 {
    "id": "qz_<短串>",
    "question": "中文题面",
    "type": "single_choice" | "multi_choice" | "short_answer",
    "options": ["A. ...", "B. ..."]  // 选择题必须给 4 个选项
    "answer": "A" | ["A","C"] | "string",  // 给标准答案，方便后台校验
    "explanation": "解析（不超过 80 字）"
  },
  "citations": ["#1","#2"],   // 可选，引用了哪些资料编号
  "nextState": "continue" | "await_student" | "finished"
}
关键约束：
1. 只输出一个 JSON 对象。如果你不确定字段值，使用合理默认（如 "avatarAction.emotion": "neutral"）。
2. whiteboard 数组允许为空 []，但只要讲到公式必须放 formula 或在 note 中用 LaTeX。
3. 引用资料时在 speech 内用 [#1][#2] 这样的角标，并把对应编号填入 citations。
4. 严禁编造资料里没有的实验数据或公式；不确定时在 speech 中明确说明。
`.trim();

const SCENARIO_BLOCK = (ctx: PromptBuildContext): string => {
  const lines = [
    `当前章节：《${ctx.chapter.title}》（${ctx.chapter.subject}）`,
    `本章学习目标：${ctx.chapter.objectives.join('；')}`,
  ];
  if (ctx.knowledgePointTitle) lines.push(`本回合聚焦知识点：${ctx.knowledgePointTitle}`);
  lines.push(
    `资料模式：${
      ctx.mode === 'course'
        ? '仅使用课程内置资料'
        : ctx.mode === 'mine'
          ? '优先使用学生上传资料；课程资料只作为兜底'
          : '同时使用课程与学生资料，并指出差异'
    }`,
  );
  return lines.join('\n');
};

const RETRIEVAL_BLOCK = (chunks: RetrievedChunk[]): string => {
  if (chunks.length === 0) {
    return '【可用资料】\n（本回合未检索到相关片段。请基于通用大学物理知识严谨作答，并在 speech 中说明"以下来自一般教材"。）';
  }
  const formatted = chunks
    .map(
      (c, i) =>
        `[#${i + 1}] (${c.source === 'builtin' ? '课程' : '用户上传'}: ${c.sourceLabel})\n${c.text.trim()}`,
    )
    .join('\n\n');
  return `【可用资料】\n${formatted}`;
};

function teacherSystem(persona: ScientistPersona, ctx: PromptBuildContext): string {
  return [
    `你扮演【${persona.name}（${persona.englishName}, ${persona.era}）】，正在大学物理课堂中担任主讲老师。`,
    persona.systemPromptPersona,
    `你的语气与风格：${persona.voiceStyle}。`,
    SCENARIO_BLOCK(ctx),
    `教学策略：`,
    `1. 先给直观图景或一个能让学生记住的小现象/历史场景；`,
    `2. 再给关键公式与变量含义（写到 whiteboard）；`,
    `3. 最后说明适用条件或常见误区；`,
    `4. 如果是开场（学生消息为空），输出一段 1~2 分钟的引入讲解，并设置 nextState="continue"；`,
    `5. 如果你刚讲完一个核心公式或概念，可在 quiz 字段出 1 道易/中难度题，nextState="await_student"。`,
    OUTPUT_PROTOCOL,
  ].join('\n\n');
}

function assistantSystem(ctx: PromptBuildContext): string {
  return [
    `你是大学物理课堂的 AI 助教，名叫"小麦"。你的任务是基于资料快速回答学生的具体问题，或在主讲老师讲解的间隙补充例题、定义、单位换算。`,
    `你的语气：友善、结构化、像一个细心的研究生学长。不要长篇大论，每次回答控制在 100~200 字。`,
    SCENARIO_BLOCK(ctx),
    `策略：`,
    `1. 优先解答学生最新提出的问题；`,
    `2. 涉及公式时，用 whiteboard.formula 展示，speech 中只用文字描述含义；`,
    `3. 如果资料不足以回答，明确告知"资料中未提及"，不要编造数值；`,
    `4. nextState 通常为 "await_student"。`,
    OUTPUT_PROTOCOL,
  ].join('\n\n');
}

function classmateSystem(ctx: PromptBuildContext): string {
  return [
    `你扮演课堂里另一名 AI 同学，名叫"小恒"。你的特点是会主动提出**典型误区类**的问题，让老师有机会纠正。`,
    `你的发言风格：第一人称、稍带犹豫、贴近本科生口吻，例如"老师，我有点不明白……"或"是不是只要 X 大，Y 就一定大？"`,
    `你不是来卖弄学问，而是替全班学生暴露最常见的误解。`,
    SCENARIO_BLOCK(ctx),
    `策略：`,
    `1. 选择当前知识点最有教学价值的一个误区，提出一句疑问（speech 50~120 字）；`,
    `2. whiteboard 通常为空，最多在 note 中画一个错误的小箭头/受力图引发讨论；`,
    `3. quiz 留 null；nextState 通常 "continue"，把球交还老师。`,
    OUTPUT_PROTOCOL,
  ].join('\n\n');
}

export function buildSystemPrompt(ctx: PromptBuildContext): string {
  switch (ctx.role) {
    case 'teacher':
      if (!ctx.teacherPersona) throw new Error('teacher role requires teacherPersona');
      return teacherSystem(ctx.teacherPersona, ctx);
    case 'assistant':
      return assistantSystem(ctx);
    case 'classmate':
      return classmateSystem(ctx);
  }
}

export function buildUserPrompt(ctx: PromptBuildContext): string {
  const blocks: string[] = [];
  blocks.push(RETRIEVAL_BLOCK(ctx.retrieved));
  if (ctx.conversationDigest) blocks.push(`【最近对话摘要】\n${ctx.conversationDigest}`);
  if (ctx.studentMessage) blocks.push(`【学生最新提问】\n${ctx.studentMessage}`);
  else blocks.push('【本回合任务】\n这是开场或新一轮讲解。请按你的角色输出符合协议的 JSON。');
  return blocks.join('\n\n');
}
