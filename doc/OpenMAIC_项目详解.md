# OpenMAIC 项目深度解读

## 📋 目录
1. [项目概述](#项目概述)
2. [核心技术栈](#核心技术栈)
3. [架构原理](#架构原理)
4. [运行流程](#运行流程)
5. [关键组件](#关键组件)
6. [快速开始](#快速开始)
7. [扩展应用](#扩展应用)

---

## 项目概述

### 项目名称
**OpenMAIC** = Open Multi-Agent Interactive Classroom（开放式多智能体交互课堂）

### 项目定位
一个开源的AI教育平台，可以将任何话题或文档转变成**丰富、交互式的课堂体验**。简单来说：
- **输入**：一个话题或文档（比如"量子物理学"或一份PDF讲义）
- **输出**：一个完整的虚拟课堂，包含：
  - 📊 自动生成的幻灯片
  - ❓ 动态测验
  - 🎮 交互式模拟和游戏
  - 👥 AI教师和AI同学，可以说话、在白板上画图、实时讨论

### 项目的超能力
1. **一键课堂生成**：描述一个主题，AI自动生成完整课程
2. **多智能体协作**：不是单个AI，而是多个AI角色协同教学
3. **丰富的场景类型**：幻灯片、测验、3D可视化、编程环境等
4. **实时互动**：AI边讲边在白板上演示，学生可以实时互动
5. **多端部署**：支持一键部署到Vercel、Docker等

### 相关论文
- 发表于 **JCST 2026**（计算机科学与技术学报）
- 来自清华大学MAIC实验室

---

## 核心技术栈

### 🎯 前端技术
| 技术 | 版本 | 作用 |
|------|------|------|
| **React** | 19.2.3 | 用户界面的核心库 |
| **Next.js** | 16.1.2 | 全栈框架，提供服务器端渲染、API路由等 |
| **TypeScript** | 5 | 编程语言，提供类型安全 |
| **Tailwind CSS** | 4 | 样式框架，快速构建UI |
| **Radix UI** | 组件库 | 无障碍的UI组件库 |

**通俗解释**：
- **React** = 搭建网页UI的基础框架
- **Next.js** = React的加强版，既能做前端UI，也能做后端服务器
- **TypeScript** = 加了"类型检查"的JavaScript，像是有"语法警察"的编程语言
- **Tailwind CSS** = 快速给网页涂漆/美化的工具
- **Radix UI** = 已经设计好的常用组件（按钮、对话框等），随取随用

### 🧠 AI/LLM 相关
| 技术 | 作用 |
|------|------|
| **LangGraph** | 多智能体编排框架 |
| **AI SDK** | 统一访问多个AI服务商的接口 |
| **Vercel AI SDK** | React中使用AI流媒体的工具库 |
| **Anthropic/OpenAI/Google** | AI服务商适配器 |

**通俗解释**：
- **LangGraph** = 指挥多个AI角色的"导演"，定义他们如何说话、何时出场
- **AI SDK** = 一个"万能适配器"，支持OpenAI、Google、Anthropic等多个AI厂商
- 这样做的好处：你可以随时更换AI服务商，代码基本不用改

### 📝 内容处理
| 技术 | 作用 |
|------|------|
| **ProseMirror** | 富文本编辑器框架 |
| **Shiki** | 代码高亮 |
| **KaTeX** | 数学公式渲染 |
| **UNPDF** | PDF解析 |
| **pptxgenjs** | PowerPoint文件生成 |

**通俗解释**：
- 支持编辑、高亮、渲染各种内容（文本、代码、数学公式）
- 可以从PDF导入内容，也可以导出成PowerPoint

### 🌐 其他核心库
| 技术 | 作用 |
|------|------|
| **i18next** | 国际化（多语言支持） |
| **Dexie** | 浏览器数据库（IndexedDB封装） |
| **ECharts** | 数据可视化/图表 |
| **XYFlow** | 节点图编辑器（用于流程图等） |
| **Zustand** | 全局状态管理 |

---

## 架构原理

### 🏗️ 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户浏览器 (前端)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React + Next.js                                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │  │
│  │  │ UI 组件      │  │ 编辑器       │  │ 播放器   │ │  │
│  │  │ (Radix UI)   │  │ (ProseMirror)│  │           │ │  │
│  │  └──────────────┘  └──────────────┘  └───────────┘ │  │
│  │        ↓ (WebSocket/HTTP)          ↑              │  │
│  └──────────────────────────────────────────────────────┘  │
│           ↓ (API 调用)                    ↑ (流式数据)     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                 服务器 (Next.js API)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  LangGraph 多智能体编排系统                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │  │
│  │  │ Director │  │ Agent 1  │  │ Agent N  │          │  │
│  │  │(导演)    │→ │ (教师)   │  │ (同学)   │          │  │
│  │  └──────────┘  └──────────┘  └──────────┘          │  │
│  │        ↓ (Tool 调用)         ↑                      │  │
│  └──────────────────────────────────────────────────────┘  │
│           ↓                             ↑                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  工具系统 (Tool Registry)                            │  │
│  │  ├─ 生成工具: 创建幻灯片、测验                       │  │
│  │  ├─ 白板工具: 绘制图形、公式                         │  │
│  │  ├─ 搜索工具: Web搜索、数据查询                      │  │
│  │  └─ 多媒体工具: TTS、图片生成                        │  │
│  └──────────────────────────────────────────────────────┘  │
│           ↓                             ↑                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│           外部服务 (第三方 AI/API)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │ OpenAI      │  │ Google      │  │ Anthropic    │        │
│  │ GPT-5.5     │  │ Gemini 3.1  │  │ Claude 3.5   │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │ Deepseek    │  │ Qwen (通义) │  │ 其他...      │        │
│  │ 等30+厂商   │  │ 等多个      │  │              │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 🧬 多智能体协作原理

**Director Graph（导演图）** 是项目的灵魂。它是一个状态机，定义了多个AI角色如何协作：

```
START 
  ↓
导演节点 (Director Node)
  ├─ 决策: 这一轮谁应该讲话？
  │ (初回轮: 直接启动第一个教师)
  │ (多轮对话: 用LLM判断谁该发言)
  │
  ├─ 规则: 
  │ • 单智能体: 纯代码逻辑（不调用LLM），直接启动代理
  │ • 多智能体: LLM决策谁该讲话，轮流发言
  │
  └─→ 智能体生成节点 (Agent Generate Node)
       ├─ 智能体接收上下文
       ├─ 智能体生成响应 + 执行工具
       │ (如：创建幻灯片、绘制图形、发起测验)
       ├─ 工具执行结果流式返回给用户
       │
       └─→ 回到导演节点（循环，直到达到轮数限制）
             ↓
           END
```

**核心特点**：
1. **流式处理**：不等所有内容生成完，就逐步发送给用户（SSE模式）
2. **工具调用**：AI不仅能说话，还能调用工具（生成幻灯片、绘制图形等）
3. **转向控制**：导演智能地决定轮次终止，避免无限循环

### 🔄 信息流向

```
用户输入 (文本或文档)
    ↓
┌───────────────────────────────────────┐
│  生成引擎 (Generation Pipeline)       │
├───────────────────────────────────────┤
│  1. 文档解析 (PDF/PPT → 文本)         │
│  2. 内容总结 & 课程大纲生成            │
│  3. 多智能体角色创建                   │
│  4. 初始场景设计                      │
│  5. 问卷/练习生成                     │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│  存储引擎                             │
├───────────────────────────────────────┤
│  • 课堂数据 → 服务器数据库             │
│  • 用户数据 → IndexedDB (浏览器)      │
│  • 生成内容缓存 → Redis (可选)        │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│  播放引擎 (Runtime)                   │
├───────────────────────────────────────┤
│  1. 加载课堂数据                       │
│  2. 启动 Director Graph                │
│  3. 流式生成 AI 响应                   │
│  4. 执行工具 (渲染幻灯片、TTS等)      │
│  5. 实时发送给前端                    │
│  6. 记录学生互动数据                  │
└───────────────────────────────────────┘
    ↓
学生看到动态课堂 + 学习数据被记录
```

---

## 运行流程

### 启动步骤

#### 1️⃣ 环境配置
```bash
# 克隆项目
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC

# 安装依赖 (pnpm = 包管理工具，类似npm但更快)
pnpm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，添加AI API密钥
```

**需要配置的关键环境变量**：
```env
# 至少选一个 AI 服务商
OPENAI_API_KEY=sk-...           # OpenAI (ChatGPT)
ANTHROPIC_API_KEY=sk-ant-...    # Anthropic (Claude)
GOOGLE_API_KEY=...              # Google (Gemini)

# 默认使用的模型
DEFAULT_MODEL=openai:gpt-5.5    # 格式: {厂商}:{型号}

# 可选：本地AI (无需API密钥)
LEMONADE_BASE_URL=http://localhost:13305/v1
```

**支持的AI厂商** (30+)：
- ✅ OpenAI (GPT-5.5)
- ✅ Google (Gemini 3.1)
- ✅ Anthropic (Claude 3.5)
- ✅ DeepSeek (国内)
- ✅ Qwen/通义 (阿里)
- ✅ Kimi (月之暗面)
- ✅ MiniMax (MiniMax系列)
- ✅ 本地Ollama
- 及其他...

#### 2️⃣ 启动开发服务器
```bash
# 运行开发环境
pnpm dev

# 打开浏览器
# http://localhost:3000
```

**此时发生的事**：
- ✅ Next.js 服务器启动 (Port 3000)
- ✅ 监听代码变化，自动热更新
- ✅ API routes 就绪
- ✅ 前端UI加载

#### 3️⃣ 创建课堂
用户在UI上操作：
```
点击 "Create Classroom"
    ↓
输入主题: "量子物理基础"
    ↓
选择参数:
  - 课程长度 (15min / 30min / 60min)
  - 难度等级 (初级 / 中级 / 高级)
  - 交互模式 (标准 / 深度互动)
    ↓
点击 "Generate"
    ↓
系统调用 API:
  POST /api/generate-classroom
  {
    topic: "量子物理基础",
    duration: 30,
    mode: "interactive"
  }
```

#### 4️⃣ 后端处理流程
```javascript
// 伪代码流程

async function generateClassroom(request) {
  // 1. 使用 AI 生成课程大纲
  const outline = await llm.generate({
    prompt: `为"${topic}"创建${duration}分钟的课程大纲，包括：
      - 学习目标
      - 关键概念
      - 练习题
    `
  });

  // 2. 生成多个智能体角色
  const teacher = createAgent({
    role: "teacher",
    persona: "热情的物理教师",
    model: "gpt-5.5"
  });
  
  const peer1 = createAgent({
    role: "peer",
    persona: "好奇的学生",
    model: "gemini-3-flash"
  });

  // 3. 创建多个场景
  const scenes = [
    { type: "slide", content: "量子物理概述" },
    { type: "interactive", content: "波函数可视化" },
    { type: "quiz", questions: [...] },
    { type: "discussion", topic: "..." }
  ];

  // 4. 存储课堂数据
  const classroom = {
    id: generateId(),
    topic,
    duration,
    agents: [teacher, peer1],
    scenes,
    createdAt: Date.now()
  };

  await db.save(classroom);

  // 5. 返回给前端
  return {
    classroomId: classroom.id,
    status: "ready"
  };
}
```

#### 5️⃣ 播放课堂
用户点击"进入课堂" → 启动 Director Graph：

```
前端发送: POST /api/chat
{
  classroomId: "xyz",
  messages: [{ role: "user", content: "开始上课" }]
}
    ↓
后端执行 Director Graph:
  
  START
    ↓
  导演: "这是第一轮，应该启动教师"
    ↓
  教师生成节点:
    - 教师生成: "大家好，今天我们学习..."
    - 调用工具: 创建标题幻灯片
    - 流式发送给前端: 
      { type: "text", content: "大家好..." }
      { type: "action", content: { type: "slide", ... } }
    ↓
  导演: "轮数 +1，检查是否还要继续"
    ↓
  导演: "还有轮数，让同学提问"
    ↓
  同学生成节点:
    - 同学生成: "老师，量子纠缠是什么？"
    - 流式发送给前端
    ↓
  导演: "让教师回答"
    ↓
  ... (循环直到轮数上限)
    ↓
  END
```

#### 6️⃣ 用户看到什么
```
┌──────────────────────────────┐
│  AI 课堂播放界面              │
├──────────────────────────────┤
│                              │
│  [教师名字] 正在讲话...       │
│  ♪ TTS 音频播放              │
│                              │
│  "今天我们学习量子物理..."   │
│                              │
│  ┌────────────────────────┐ │
│  │ [幻灯片可视化]         │ │
│  │                        │ │
│  │ 量子物理基础           │ │
│  │ - 波函数               │ │
│  │ - 薛定谔方程           │ │
│  │ - 量子纠缠             │ │
│  └────────────────────────┘ │
│                              │
│  [提问按钮] [记笔记] [截图] │
│                              │
└──────────────────────────────┘
```

---

## 关键组件

### 1. 📡 API 路由 (`app/api/`)

#### `/api/generate-classroom` 
**功能**：一键生成完整课堂
**输入**：
```json
{
  "topic": "量子物理",
  "duration": 30,
  "mode": "interactive",
  "documents": ["file.pdf"]  // 可选：上传文件
}
```
**输出**：课堂ID + 生成进度流

#### `/api/chat`
**功能**：运行 Director Graph，生成 AI 响应
**输入**：
```json
{
  "classroomId": "xyz",
  "messages": [
    { "role": "user", "content": "教我这个概念" }
  ]
}
```
**输出**：SSE 流 (Server-Sent Events)
```
data: {"type":"text","content":"..."}
data: {"type":"action","content":{...}}
data: {"type":"thinking",...}
```

#### `/api/parse-pdf`
**功能**：解析 PDF 文件提取内容

#### `/api/web-search`
**功能**：执行网络搜索（AI需要查资料时）

#### `/api/quiz-grade`
**功能**：自动批改测验答案

#### `/api/verify-model`
**功能**：验证 AI 模型是否可用

### 2. 🧠 编排系统 (`lib/orchestration/`)

#### `director-graph.ts` 
**是什么**：LangGraph 状态机的核心实现
**关键概念**：
```typescript
// 导演节点决策逻辑
if (isFirstTurn) {
  // 第一轮：直接启动指定的智能体
  dispatchAgent(triggerAgentId);
} else if (isMultiAgent) {
  // 多智能体：用LLM决定谁该讲话
  nextAgent = await llm.decide({
    prompt: buildDirectorPrompt(context),
    messages: conversationHistory
  });
  dispatchAgent(nextAgent);
} else if (turnCount >= maxTurns) {
  // 轮数上限：结束
  return END;
} else {
  // 提示用户
  return CUE_USER;
}
```

#### `prompt-builder.ts`
**功能**：构建发送给 AI 的提示词
**例子**：
```
你是一位热情的物理教师，正在为高中生讲授量子物理。

学生的知识背景：{studentLevel}
当前课题：{topic}
已讲解内容：{previousContent}

请：
1. 用通俗易懂的语言讲解
2. 举2个生活中的例子
3. 提出一个思考题
4. 如果需要，调用工具画图表
```

#### `tool-schemas.ts`
**功能**：定义 AI 可以调用的工具集
```typescript
const tools = [
  {
    name: "create_slide",
    description: "创建幻灯片",
    parameters: {
      title: "标题",
      content: "内容",
      style: "样式" // "title" | "content" | "formula"
    }
  },
  {
    name: "draw_diagram",
    description: "在白板上绘制图形",
    parameters: {
      shape: "形状", // "circle" | "arrow" | "formula"
      position: "位置"
    }
  },
  {
    name: "create_quiz",
    description: "创建测验题",
    parameters: {
      question: "题目",
      options: ["选项1", "选项2"],
      correct: 0  // 正确答案索引
    }
  }
  // ...更多工具
];
```

### 3. 🎨 前端组件 (`components/`)

#### 关键组件树
```
App
├─ ClassroomView (主界面)
│  ├─ AgentCard (智能体卡片)
│  │  ├─ 头像 + 名字
│  │  ├─ TTS 音频播放器
│  │  └─ 动画状态指示
│  ├─ SceneRenderer (场景渲染器)
│  │  ├─ SlideRenderer (幻灯片)
│  │  ├─ QuizRenderer (测验)
│  │  ├─ SimulationRenderer (模拟)
│  │  ├─ WhiteboardRenderer (白板)
│  │  └─ CodeEditorRenderer (代码编辑)
│  ├─ ChatPanel (聊天面板)
│  │  ├─ 消息列表
│  │  └─ 输入框 + 语音输入
│  └─ ExportMenu (导出菜单)
│     ├─ "导出为 PPTX"
│     ├─ "导出为 HTML"
│     └─ "导出为 ZIP"
├─ SettingsPanel (设置面板)
│  ├─ 模型选择
│  ├─ TTS/ASR 配置
│  ├─ 主题切换
│  └─ 语言选择
└─ AdminDashboard (管理后台)
   ├─ 课堂列表
   ├─ 学生管理
   └─ 统计数据
```

### 4. 💾 存储系统

#### 浏览器端存储 (IndexedDB)
```javascript
// Dexie 数据库结构
const db = new Dexie('OpenMAIC');
db.version(1).stores({
  classrooms: '++id, userId, createdAt',  // 课堂数据
  messages: '++id, classroomId, timestamp', // 聊天消息
  notes: '++id, classroomId',              // 笔记
  progress: '++id, classroomId, userId',  // 学习进度
  voices: '++id, agentId'                 // 音频缓存
});

// 操作示例
await db.messages.add({
  classroomId: 'xyz',
  role: 'teacher',
  content: '今天我们学习...',
  timestamp: Date.now()
});
```

#### 服务器端存储
- 课堂元数据、课程内容 → 主数据库（SQL）
- 生成缓存 → Redis（可选）
- 上传文件 → 对象存储（S3/阿里云OSS）

---

## 快速开始

### 方案 A：本地运行（适合开发者）

```bash
# 1. 克隆
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC

# 2. 安装依赖
pnpm install

# 3. 配置 API 密钥
cp .env.example .env.local
# 编辑 .env.local，添加：
# OPENAI_API_KEY=sk-...
# 或
# GOOGLE_API_KEY=...

# 4. 启动
pnpm dev

# 5. 打开浏览器
# http://localhost:3000
```

### 方案 B：Vercel 一键部署（推荐新手）

点击此链接：[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FTHU-MAIC%2FOpenMAIC)

流程：
1. 用 GitHub 账号登录 Vercel
2. 填入 AI API 密钥（OpenAI / Anthropic / Google 选一个）
3. 点击 Deploy
4. 等待 3-5 分钟，自动部署完成
5. 获得一个公网 URL，全球可访问

### 方案 C：Docker 容器部署（适合生产）

```bash
# 1. 编辑环境变量
cp .env.example .env.local
# 编辑 .env.local

# 2. 启动容器
docker compose up --build

# 3. 访问
# http://localhost:3000
```

### 方案 D：通过 OpenClaw 集成（零配置）

OpenClaw 是一个 AI 助手平台，支持 Feishu、Slack、Discord 等应用。

**步骤**：
1. 在 Feishu/Slack 中告诉你的 AI 助手："安装 OpenMAIC 技能"
2. 选择 Hosted 模式（获取访问码）或 Self-hosted 模式（自己部署）
3. 在聊天中说"教我量子物理"
4. OpenAI 自动为你创建课堂！

---

## 扩展应用

### 🎯 场景 1：学校/培训机构

**目标**：替代传统课堂

**配置方案**：
```env
# 配置 1: 经济版 (Gemini Flash)
DEFAULT_MODEL=google:gemini-3-flash

# 配置 2: 高质量 (GPT-4)
DEFAULT_MODEL=openai:gpt-4

# 配置 3: 本地版 (Ollama)
DEFAULT_MODEL=ollama:llama2
```

**定制需求**：
- 添加学生登录系统
- 记录学习进度和成绩
- 导出成绩单
- 支持班级管理

**文件修改**：
```typescript
// 1. 添加身份验证中间件
// middleware.ts

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session');
  if (!session && request.nextUrl.pathname.startsWith('/classroom')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

// 2. 添加班级管理 API
// app/api/classroom/batch-generate.ts

export async function POST(request: Request) {
  // 为整个班级一键生成课堂
  const { classId, topic } = await request.json();
  const students = await db.query(`
    SELECT * FROM students WHERE classId = ?
  `, [classId]);
  
  for (const student of students) {
    await generateClassroom({
      topic,
      userId: student.id
    });
  }
}

// 3. 生成成绩单
// app/api/report/generate.ts

export async function POST(request: Request) {
  const { userId, classroomId } = await request.json();
  
  const progress = await db.query(`
    SELECT * FROM progress 
    WHERE userId = ? AND classroomId = ?
  `, [userId, classroomId]);
  
  // 计算：完成度、测验成绩、交互次数
  return generateReport(progress);
}
```

### 🎯 场景 2：企业员工培训

**目标**：快速创建内部培训课程

**应用**：
```
1. HR 上传公司培训文档（ISO标准、安全规程等）
   ↓
2. OpenMAIC 自动生成 AI 导师
   ↓
3. 员工进入虚拟课堂，与 AI 讨论
   ↓
4. 自动生成测验和证书
```

**技术实现**：
```typescript
// app/api/enterprise/onboarding.ts

export async function POST(request: Request) {
  const { companyId, documents } = await request.json();
  
  // 1. 解析内部文档
  const content = await parseDocuments(documents);
  
  // 2. 创建企业专属 AI 角色
  const enterprise = await db.getEnterprise(companyId);
  const corporateTone = enterprise.brandVoice; // 企业风格
  
  // 3. 生成课程
  const classroom = await generateClassroom({
    content,
    agentPersona: {
      name: `${enterprise.name} 培训官`,
      instructions: `你代表${enterprise.name}，用${corporateTone}的风格讲解...`
    }
  });
  
  // 4. 返回给员工
  return { classroomId: classroom.id };
}
```

### 🎯 场景 3：教科书/内容出版

**目标**：将现有教材转换成交互式课程

**流程**：
```
数学教科书.pdf (500页)
    ↓
[章节拆分]
第一章: 代数基础
第二章: 几何
...
    ↓
[为每章生成课堂]
    ↓
每个学生可以：
  • 自学任何一章
  • 与 AI 数学家讨论
  • 做交互式练习
  • 获得个性化反馈
```

**代码框架**：
```typescript
// lib/orchestration/textbook-adapter.ts

export async function convertTextbookToClassrooms(pdfPath: string) {
  // 1. 分章节
  const chapters = await parseTextbook(pdfPath);
  
  // 2. 为每章生成课堂
  const classrooms = await Promise.all(
    chapters.map(chapter =>
      generateClassroom({
        topic: chapter.title,
        content: chapter.content,
        scenes: [
          { type: 'slide', content: chapter.summary },
          { type: 'interactive', content: chapter.visualization },
          { type: 'quiz', questions: generateQuestions(chapter) }
        ]
      })
    )
  );
  
  return classrooms;
}
```

### 🎯 场景 4：医学培训/医学教育

**特殊需求**：
- 医学案例讨论
- 症状诊断模拟
- 手术流程可视化

**配置**：
```typescript
// lib/orchestration/registry/medical-agents.ts

export const medicalAgents = {
  // 主任医生（主讲）
  chiefPhysician: {
    role: 'teacher',
    persona: '30年临床经验的主任医生，严谨但通俗易懂',
    instructions: '讲解医学概念，引导诊断思考'
  },
  
  // 住院医生（提问）
  resident: {
    role: 'peer',
    persona: '认真的住院医生，会提出实际案例',
    instructions: '提出临床场景中的问题'
  },
  
  // AI 诊断系统（辅助）
  diagnosticAI: {
    role: 'tool_provider',
    persona: '诊断决策支持系统',
    instructions: '提供症状-诊断映射表'
  }
};
```

### 🎯 场景 5：语言学习

**特殊需求**：
- 多语言对话
- 发音纠正
- 文化背景讲解

**实现**：
```typescript
// lib/orchestration/registry/language-agents.ts

export const languageAgents = {
  // 本地教师（讲解语法）
  teacher: {
    instructions: '用简单英文和目标语言的混合讲解...'
  },
  
  // 本地人（自然对话）
  nativeSpeaker: {
    instructions: '用纯目标语言交流，模拟真实场景...'
  }
};

// 启用 ASR (自动语音识别)
export const languageLearningConfig = {
  asr: {
    enabled: true,
    model: 'whisper-large',  // 高精度语音识别
    language: 'en'           // 目标语言
  },
  
  tts: {
    accent: 'native',        // 本地口音
    speed: 'slow'            // 慢速播放，便于听懂
  }
};
```

### 🎯 场景 6：知识库 QA 系统

**目标**：将现有文档转换成可对话的知识库

**架构**：
```
公司知识库文档 (PPT、Wiki、Word)
    ↓
[向量化 + 存储到向量数据库]
    ↓
用户提问
    ↓
[RAG: 检索相关文档]
    ↓
AI 基于检索结果回答
    ↓
用户获得答案 + 来源引用
```

**代码**：
```typescript
// lib/ai/rag-system.ts

import { embed } from '@ai-sdk/openai';

export async function setupKnowledgeBase(documents: string[]) {
  // 1. 文本分块
  const chunks = documents.flatMap(doc => chunk(doc, 256));
  
  // 2. 嵌入向量
  const embeddings = await Promise.all(
    chunks.map(chunk => embed({
      model: 'text-embedding-3-small',
      value: chunk
    }))
  );
  
  // 3. 存储到向量数据库
  await vectorDb.addDocuments(chunks.map((chunk, i) => ({
    text: chunk,
    embedding: embeddings[i],
    metadata: { source: 'company-kb' }
  })));
}

export async function queryKnowledgeBase(question: string) {
  // 1. 问题嵌入
  const questionEmbedding = await embed({
    model: 'text-embedding-3-small',
    value: question
  });
  
  // 2. 语义搜索
  const relevantDocs = await vectorDb.search(questionEmbedding, topK: 5);
  
  // 3. 生成答案
  const answer = await llm.generate({
    prompt: `
      基于以下文档，回答问题：
      ${relevantDocs.map(d => d.text).join('\n\n')}
      
      问题: ${question}
    `
  });
  
  return answer;
}
```

---

## 总结

### 项目的核心创新

| 创新点 | 传统教育 | OpenMAIC |
|--------|---------|----------|
| **教学形式** | 单向讲授 | 多智能体互动讨论 |
| **内容生成** | 手工编写 | 一键自动生成 |
| **交互体验** | 静态阅读 | 3D、模拟、游戏、编程 |
| **部署方式** | 需要技术团队 | 一键部署 (Vercel/Docker) |
| **支持厂商** | 绑定某个AI | 支持30+厂商，可随时切换 |
| **可扩展性** | 困难 | 模块化设计，易于定制 |

### 为什么 OpenMAIC 对你有帮助？

✅ **如果你想快速创建 AI 教育产品** → 直接 fork 这个项目修改
✅ **如果你想学习如何设计多智能体系统** → 研究 LangGraph 实现
✅ **如果你想了解 AI 流式处理** → 看 SSE + Parser 部分
✅ **如果你想做内容生成** → 参考 Prompt Builder 和 Tool Registry
✅ **如果你想做 Next.js 全栈应用** → 这是很好的参考项目

### 核心技能路线图

学习顺序：
1. **基础**：理解 React + Next.js 框架
2. **中级**：学习 LangGraph 多智能体编排
3. **高级**：实现自己的工具系统和代理
4. **应用**：改造为你自己的业务场景

---

## 相关链接

- 📚 [GitHub](https://github.com/THU-MAIC/OpenMAIC)
- 🌐 [Live Demo](https://open.maic.chat/)
- 📄 [论文](https://jcst.ict.ac.cn/en/article/doi/10.1007/s11390-025-6000-0)
- 💬 [Discord 社区](https://discord.gg/p8Pf2r3SaG)
- 🐾 [OpenClaw 集成](https://github.com/openclaw/openclaw)

---

**文档完成日期**：2026-05-24
**基于版本**：v0.2.1
**作者**：AI 助手

