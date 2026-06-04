import type { ScientistPersona } from '@/lib/wulian/types';
import type { AgentConfig } from '@/lib/orchestration/registry/types';

// Map scientist visualKey to color hexes
const VISUAL_KEY_COLORS: Record<string, string> = {
  amber: '#f59e0b',
  indigo: '#6366f1',
  slate: '#64748b',
  emerald: '#10b981',
  rose: '#f43f5e',
  violet: '#8b5cf6',
};

const WHITEBOARD_ACTIONS = [
  'wb_open',
  'wb_close',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_draw_code',
  'wb_edit_code',
  'wb_clear',
  'wb_delete',
];

const SLIDE_ACTIONS = ['spotlight', 'laser', 'play_video'];

/**
 * Maps Wulian classroom participants (teacher/scientist, assistant, classmate)
 * to standard MAIC AgentConfigs for orchestration graph execution.
 */
export function mapWulianAgentsToMaic(
  primaryScientist: ScientistPersona,
  secondaryScientist?: ScientistPersona | null
): AgentConfig[] {
  const configs: AgentConfig[] = [];

  // 1. Primary Scientist (Teacher)
  const teacherColor = VISUAL_KEY_COLORS[primaryScientist.visualKey] || '#3b82f6';
  configs.push({
    id: 'teacher',
    name: `${primaryScientist.name} 教授`,
    role: 'teacher',
    persona: `You are the lead teacher of this physics classroom. You are the historical physicist ${primaryScientist.name} (${primaryScientist.englishName}).
Your details:
- National/Era: ${primaryScientist.era}
- Field: ${primaryScientist.field}
${primaryScientist.signatureFormula ? `- Representative Formula: ${primaryScientist.signatureFormula}` : ''}

Your teaching style and persona constraints:
${primaryScientist.systemPromptPersona}

Speak with your specific voice style: ${primaryScientist.voiceStyle}.
Always explain physics concepts step-by-step. Feel free to use the whiteboard for drawing LaTeX formulas, lines, shapes, and notes. Highlight or spotlight elements when referencing slides. Speak exclusively in Chinese.`,
    avatar: `/avatars/teacher.png`,
    color: teacherColor,
    allowedActions: [...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS],
    priority: 10,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 2. Assistant (小麦助教)
  configs.push({
    id: 'assistant',
    name: '小麦 助教',
    role: 'assistant',
    persona: `You are the classroom teaching assistant. You support the lead teacher by explaining complex ideas in simpler, everyday terms, and summarizing key take-aways.
Help students stay engaged and clear up doubts. Support the teacher respectfully. Speak exclusively in Chinese.`,
    avatar: '/avatars/assist.png',
    color: '#10b981',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 7,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 3. Classmate (小恒同学)
  configs.push({
    id: 'classmate',
    name: '小恒 同学',
    role: 'student',
    persona: `You are a student in this classroom. You are enthusiastic, curious, but occasionally hold common misconceptions or struggle with formulas.
Ask clarifying questions when concepts are deep. Keep your responses short, conversational, and natural. Speak exclusively in Chinese.`,
    avatar: '/avatars/clown.png',
    color: '#f59e0b',
    allowedActions: [],
    priority: 5,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 4. Secondary Scientist (if present, as secondary teacher/co-instructor)
  if (secondaryScientist) {
    const secColor = VISUAL_KEY_COLORS[secondaryScientist.visualKey] || '#8b5cf6';
    configs.push({
      id: 'secondary_teacher',
      name: `${secondaryScientist.name} 教授`,
      role: 'assistant',
      persona: `You are the co-instructor. You are the historical physicist ${secondaryScientist.name} (${secondaryScientist.englishName}).
Your background: ${secondaryScientist.systemPromptPersona}.
Speak in your style: ${secondaryScientist.voiceStyle}. Work together with ${primaryScientist.name} to explain physics. Speak in Chinese.`,
      avatar: '/avatars/thinker.png',
      color: secColor,
      allowedActions: [...WHITEBOARD_ACTIONS],
      priority: 8,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }


  return configs;
}
