/**
 * 物联智讲 - 核心类型定义
 *
 * 整个系统所有跨模块共享的类型都集中在这里，避免循环依赖。
 */

// 复用 MAIC 课堂内核的结构类型（仅类型导入，无运行时依赖）
import type { Stage, Scene } from '@/lib/types/stage';

// ----------------------------------------------------------------------------
// 科学家与角色
// ----------------------------------------------------------------------------

export interface ScientistPersona {
  /** 唯一 ID，例如 "faraday" */
  id: string;
  /** 中文名 */
  name: string;
  /** 英文名（用于头像/装饰） */
  englishName: string;
  /** 国籍与年代，例如 "英国 / 1791-1867" */
  era: string;
  /** 学科领域，例如 "电磁学" */
  field: string;
  /** 代表公式（LaTeX，可空） */
  signatureFormula?: string;
  /** 角色简介，给学生看的 */
  bio: string;
  /** LLM 系统提示模板片段 - 用于注入 persona */
  systemPromptPersona: string;
  /** 头像视觉风格关键词，用于 CSS 装饰 */
  visualKey: 'amber' | 'indigo' | 'slate' | 'emerald' | 'rose' | 'violet';
  /** 头像表情/口语风格 */
  voiceStyle: string;
}

/** 课堂里的三类内置 Agent */
export type AgentRole = 'teacher' | 'assistant' | 'classmate';

export interface AgentInstance {
  role: AgentRole;
  /** 教师角色时引用的科学家 ID；助教/同学固定 */
  scientistId?: string;
  displayName: string;
}

// ----------------------------------------------------------------------------
// 章节与知识结构
// ----------------------------------------------------------------------------

export interface FormulaCard {
  /** LaTeX */
  latex: string;
  /** 公式说明 */
  caption: string;
  /** 变量含义 */
  variables?: { symbol: string; meaning: string; unit?: string }[];
}

export interface KnowledgePoint {
  id: string;
  title: string;
  /** 关联科学家 ID */
  scientists: string[];
  prerequisites: string[];
  formulas: FormulaCard[];
  /** 学生常见误解，用于 AI 同学提问 */
  misconceptions: string[];
  /** 推荐的可视化组件 ID */
  simulationId?: string;
}

export interface Chapter {
  id: string;
  title: string;
  subject: '力学' | '电磁学' | '光学' | '近代物理';
  /** 主讲科学家 ID */
  primaryScientist: string;
  /** 副讲/助教科学家 ID（可选） */
  secondaryScientist?: string;
  /** 学习目标（人类可读） */
  objectives: string[];
  /** 章节包含的知识点 */
  knowledgePoints: KnowledgePoint[];
  /** RAG 检索时使用的语料目录（相对于 content/wulian/knowledge/） */
  corpusFolder: string;
  /** 章节状态 */
  status: 'ready' | 'preview' | 'planned';
  /** 简短描述 */
  summary: string;
  /** 推荐用的开场白（科学家口吻） */
  openingScript: string;
}

// ----------------------------------------------------------------------------
// 课堂消息与 Agent 输出协议（参考方案附录的 JSON 协议）
// ----------------------------------------------------------------------------

export type WhiteboardItem =
  | { type: 'formula'; latex: string; caption?: string }
  | { type: 'note'; markdown: string }
  | { type: 'figure'; svg: string; caption?: string }
  | { type: 'simulation'; simulationId: string; params?: Record<string, number | string> };

export interface AvatarAction {
  emotion: 'neutral' | 'thoughtful' | 'excited' | 'concerned' | 'curious';
  gesture?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'single_choice' | 'multi_choice' | 'short_answer';
  /** single/multi choice 时使用 */
  options?: string[];
  /** 答案，用于服务端校验，不直接返回前端 */
  answer?: string | string[];
  explanation?: string;
}

export interface AgentTurn {
  /** 用于在前端渲染时识别消息归属 */
  speakerRole: AgentRole;
  speakerId: string;
  speakerName: string;
  speech: string;
  whiteboard?: WhiteboardItem[];
  avatarAction?: AvatarAction;
  quiz?: QuizQuestion;
  /** 引用的知识库片段 ID（来自 RAG 或上传资料） */
  citations?: string[];
  /** 下一步状态 */
  nextState?: 'continue' | 'await_student' | 'finished';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  /** Agent 消息存完整结构，用户消息只用 speech */
  content: AgentTurn | { speech: string };
  timestamp: number;
}

// ----------------------------------------------------------------------------
// SSE 事件协议
// ----------------------------------------------------------------------------

export type WulianStreamEvent =
  /** 一个新 Agent 即将发言 */
  | { type: 'agent_start'; speakerRole: AgentRole; speakerId: string; speakerName: string }
  /** 该 Agent 的语音文本增量 */
  | { type: 'agent_delta'; speakerId: string; deltaText: string }
  /** 该 Agent 的完整结构化输出（speech 全文 + 白板 + quiz...） */
  | { type: 'agent_complete'; turn: AgentTurn }
  /** 整个回合结束 */
  | { type: 'turn_end' }
  /** 错误 */
  | { type: 'error'; message: string };

// ----------------------------------------------------------------------------
// 上传资料
// ----------------------------------------------------------------------------

export interface UploadedDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: number;
  /** 自动生成的摘要 */
  summary: string;
  /** 切块数量 */
  chunkCount: number;
  /** 会话标识 - MVP 用浏览器侧的 session id */
  sessionId: string;
}

export interface DocumentChunk {
  id: string;
  docId: string;
  /** 文档内顺序 */
  index: number;
  text: string;
  /** 对应原文位置元数据 */
  metadata?: {
    page?: number;
    heading?: string;
  };
  /** 嵌入向量；当无法获取嵌入时为 null，使用关键词匹配兜底 */
  embedding: number[] | null;
}

// ----------------------------------------------------------------------------
// RAG 搜索
// ----------------------------------------------------------------------------

export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
  source: 'builtin' | 'uploaded';
  /** 来源标签：章节名/文件名 */
  sourceLabel: string;
}

export interface ChatRequestBody {
  chapterId: string;
  /** 用户最新消息 */
  userMessage: string;
  /** 历史消息（可选，前端维护） */
  history?: ChatMessage[];
  /** 当前学生当前会话上传的文档 ID 列表（可选） */
  uploadedDocIds?: string[];
  /** 资料模式 */
  mode?: 'course' | 'mine' | 'compare';
  /** 强制让某位 agent 发言。默认按状态机选择。 */
  forceAgent?: AgentRole;
  /** 关联的定制课堂实例 ID，使讨论挂到具体实例上下文（重构新增） */
  classroomId?: string;
}

// ----------------------------------------------------------------------------
// 反馈
// ----------------------------------------------------------------------------

export interface FeedbackEntry {
  id: string;
  chapterId: string;
  /** quiz 答题或定性反馈 */
  type: 'quiz' | 'rating' | 'comment';
  payload: Record<string, unknown>;
  createdAt: number;
}

// ----------------------------------------------------------------------------
// 重构新增：个性化、定制课堂实例、模拟器、账号、生成任务
// （详见 design.md §4.1）
// ----------------------------------------------------------------------------

/** 学生画像（个性化输入的基线） */
export interface StudentProfile {
  userId: string;
  /** 年级/专业 */
  gradeOrMajor?: string;
  /** 物理基础水平 */
  level: 'beginner' | 'intermediate' | 'advanced';
  /** 学习目标 */
  goals: ('exam' | 'interest' | 'research')[];
  /** 偏好节奏 */
  pacePreference?: 'slow' | 'normal' | 'fast';
  /** 偏好讲解风格 */
  preferredScientistTone?: string;
  updatedAt: number;
}

/** 个性化定制输入（向导汇总） */
export interface WulianPersonalizationInput {
  chapterId: string;
  studentProfile: StudentProfile;
  /** 资料模式：仅课程内置 / 仅我的上传 / 二者对照 */
  materialMode: 'course' | 'mine' | 'compare';
  /** 选中的私有上传文档 ID */
  uploadedDocIds: string[];
  /** 选中要嵌入课件的模拟器 ID */
  selectedSimulatorIds: string[];
  /** 额外的自定义指令 */
  extraInstructions?: string;
}

/**
 * 定制课堂实例（持久化）——在 MAIC `PersistedClassroomData` 之上扩展。
 * 复用 MAIC 的 `Stage + Scene[]` 结构，附 wulian 元数据。
 */
export interface WulianClassroomInstance {
  id: string;
  /** userId（访客时为本地匿名 id） */
  owner: string;
  chapterId: string;
  /** 复用 MAIC lib/types/stage */
  stage: Stage;
  /** 复用 MAIC lib/types/stage */
  scenes: Scene[];
  personalization: WulianPersonalizationInput;
  /** 已嵌入的模拟器 id */
  simulators: string[];
  createdAt: string;
  updatedAt: string;
}

/** 模拟器可调参数定义 */
export interface SimulatorParam {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  unit?: string;
}

/** 模拟器注册项（场景化） */
export interface SimulatorDefinition {
  /** 'flux-loop-slider' 等 */
  id: string;
  title: string;
  subject: Chapter['subject'];
  /** 关联知识点提示 */
  knowledgePointHint?: string;
  params: SimulatorParam[];
}

/** 账号 */
export interface UserAccount {
  id: string;
  username: string;
  /** scrypt/bcrypt 加盐哈希，绝不明文 */
  passwordHash: string;
  salt: string;
  createdAt: number;
}

/** 课堂生成任务（轮询） */
export interface WulianGenerationJob {
  jobId: string;
  owner: string;
  chapterId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  /** 当前步骤名 */
  step: string;
  /** 0..100 百分比 */
  progress: number;
  /** 完成后产物实例 id */
  classroomId?: string;
  error?: string;
}
