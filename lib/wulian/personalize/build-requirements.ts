import type { WulianPersonalizationInput } from '@/lib/wulian/types';
import type { UserRequirements } from '@/lib/types/generation';
import { getChapter } from '@/lib/wulian/agents/chapter';
import { getPersona } from '@/lib/wulian/agents/persona';
import { retrieveForUser, formatRetrievalForGeneration } from '@/lib/wulian/rag/store';
import { getSimulator } from '@/lib/wulian/simulators/registry';

/**
 * Builds the user requirement text and reference materials context for the OpenMAIC generation pipeline
 * based on the customization input.
 *
 * @param input Customized personalization parameters from Setup Wizard
 * @param userId User identifier for uploads isolation
 */
export async function buildGenerationRequirements(
  input: WulianPersonalizationInput,
  userId: string
): Promise<{
  requirements: UserRequirements;
  pdfContent?: { text: string; images: string[] };
}> {
  // 1. 获取章节和科学家Persona信息
  const chapter = await getChapter(input.chapterId);
  if (!chapter) {
    throw new Error(`Chapter not found: ${input.chapterId}`);
  }

  const primaryScientist = await getPersona(chapter.primaryScientist);
  const secondaryScientist = chapter.secondaryScientist
    ? await getPersona(chapter.secondaryScientist)
    : null;

  // 2. 构造个性化学习指示 prompt
  const profile = input.studentProfile;
  const gradeText = profile.gradeOrMajor ? `年级/专业：${profile.gradeOrMajor}` : '未指定';
  const levelText = profile.level === 'beginner' ? '物理入门基础（概念直观理解为主）' :
                    profile.level === 'intermediate' ? '物理进阶水平（注重定理与中等推导）' :
                    '物理高级/专业水平（深度物理机制与严谨公式推导）';

  const goalText = profile.goals.map((g) => {
    if (g === 'exam') return '期末/学术考试应试';
    if (g === 'interest') return '科普与物理兴趣培养';
    if (g === 'research') return '学术研究与学术探索准备';
    return g;
  }).join('、');

  const paceText = profile.pacePreference === 'slow' ? '节奏偏慢，讲解详实' :
                    profile.pacePreference === 'fast' ? '节奏偏快，直达核心要点' :
                    '正常教学节奏';

  const scientistToneText = primaryScientist
    ? `主讲教师为物理学家 ${primaryScientist.name} (${primaryScientist.englishName})。` +
      `在整堂课的讲解内容中，必须采用${primaryScientist.name}的口吻和讲话风格(${primaryScientist.voiceStyle})。` +
      (primaryScientist.signatureFormula ? `必须适当在课件中呈现并推导其代表性公式：${primaryScientist.signatureFormula}。` : '')
    : '';

  const secondaryScientistText = secondaryScientist
    ? `助教/副讲教师为 ${secondaryScientist.name}。`
    : '';

  // 3. 模拟器约束
  let simulatorConstraints = '';
  if (input.selectedSimulatorIds && input.selectedSimulatorIds.length > 0) {
    simulatorConstraints = `## 物理模拟器课件嵌入约束：\n` +
      `本堂课选定了以下物理模拟器作为可交互场景(interactive)嵌入课件大纲中相应知识点的位置：\n`;
    for (const simId of input.selectedSimulatorIds) {
      const sim = getSimulator(simId);
      if (sim) {
        simulatorConstraints += `- 模拟器 ID: "${sim.id}" (${sim.title})，对应知识点关联：${sim.knowledgePointHint || '对应物理现象'}。\n` +
          `  【重要指令】：大纲生成阶段，必须在讲解 "${sim.knowledgePointHint || '对应物理现象'}" 的地方，产出一个场景类型为 "interactive" 的场景。该场景必须设置 widgetType="wulian-simulator" 并指定 widgetOutline 属性（以 wulian 模拟器形式适配渲染）。\n`;
      }
    }
  }

  // 4. 组装最终的大纲生成 requirement prompt
  const requirementPrompt = `
【物联智讲 - 物理个性化定制课堂大纲生成指令】
请根据以下定制化需求，为章节「${chapter.title}」生成适合该学生的课件大纲和场景序列。

# 学生画像与个性化设置：
- ${gradeText}
- 学习水平：${levelText}
- 学习目标：${goalText}
- 学习节奏：${paceText}
- ${primaryScientist ? `讲解风格偏好：${primaryScientist.name}的学术/口吻风格` : ''}

# 教师团队 Persona 约束：
${scientistToneText}
${secondaryScientistText}
在生成大纲的 remark、教学要点和教学内容描述中，必须融合教师人物角色的口吻和物理背景。

# 章节大纲框架参考：
章节标题：${chapter.title}
课程主题：${chapter.subject}
核心学习目标：
${chapter.objectives.map((o, idx) => `${idx + 1}. ${o}`).join('\n')}

${simulatorConstraints}

${input.extraInstructions ? `## 学生额外自定义指令：\n${input.extraInstructions}\n` : ''}

【格式要求】：请确保大纲里的每一个场景都有对应的教学目的、内容概要。如果在以上约束中指定了嵌入模拟器，请务必在对应的知识点段落中放置 interactive 类型场景，确保 widgetType="wulian-simulator"。
`.trim();

  // 5. 检索 RAG 语料，获取参考上下文作为 pdfText / pdfContent 注入
  // 用章节标题 +Objectives 作为搜索 query
  const searchQuery = `${chapter.title} ${chapter.objectives.join(' ')}`;
  // topK 取 12 获得比较丰富但又不至于超限的参考语料
  const hits = await retrieveForUser({
    userId,
    chapterId: input.chapterId,
    query: searchQuery,
    uploadedDocIds: input.uploadedDocIds,
    mode: input.materialMode,
    topK: 12,
  });

  const formattedContext = formatRetrievalForGeneration(hits, input.materialMode);

  return {
    requirements: {
      requirement: requirementPrompt,
      userNickname: profile.gradeOrMajor,
      userBio: `物理水平：${profile.level}，目标：${goalText}`,
      interactiveMode: true, // 强制开启 interactive 场景以支持模拟器
    },
    pdfContent: {
      text: formattedContext,
      images: [], // 物理内容主要靠 text 注入
    },
  };
}
