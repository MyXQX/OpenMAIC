# 设计文档：物联智讲课堂重构（Wulian Classroom Rework）

## 1. 概述

### 1.1 目标

把「物联智讲（Wulian）」从一个**轻量、独立、刻意绕开 OpenMAIC 内核**的 MVP，升级为**复用 OpenMAIC（MAIC）课堂内核**的完整教学产品。核心改动有四块：

1. **后端重构** —— 废弃 `lib/wulian/agents/orchestrator.ts` 里 50 行的 `decideAgentSequence` 简易状态机，改为复用 MAIC 的**两阶段课堂生成流水线**（`lib/generation`）+ **LangGraph 多智能体编排**（`lib/orchestration`）+ **回放引擎**（`lib/playback`）。在生成阶段注入：(a) wulian 已有的内置物理语料 RAG，(b) 上传资料 RAG，(c) **物理模拟器作为可交互场景嵌入课件**。
2. **前端重构** —— 进入课堂先经过**初始化网关**（首次进入：根据学生基本情况 + 私有上传资料 + 内置资料/模拟器**个性化定制课堂**）；定制完成后进入**正式课堂页**，参考 MAIC 页面：主区域显示 PPT，**删去左侧 PPT 缩略图预览/切换列**，改为**视频式进度条**驱动翻页，老师发言以**字幕**形式融入主画面；**右侧控制面板**承载查看/上传资料、查看/发送提示词、对话预览等功能。
3. **服务器端存储 + 登录** —— 新增账号体系与服务端持久化，用于**隔离课堂、个性化与设置**。
4. **吸收 MAIC 隐藏/未暴露功能** —— 把 MAIC 中 wulian 尚未使用的能力（深度交互模式、白板动作引擎、TTS/ASR、PPTX/HTML 导出、Web 搜索等）按价值择优引入 wulian。

### 1.2 设计原则

- **复用优先**：尽最大可能直接调用 MAIC 现有模块（`lib/generation`、`lib/orchestration`、`lib/playback`、`lib/action`、`components/stage`、`components/slide-renderer`、`components/scene-renderers`），不重复造轮子。
- **wulian 作为「领域适配层 + 体验外壳」**：wulian 提供物理学科语料、科学家 persona、模拟器场景类型、初始化网关、播放器外壳与控制面板；课堂内核的生成/编排/回放交给 MAIC。
- **隔离与兼容并存**：保持 `/wulian/*` 与 `/api/wulian/*` 命名空间，原 MAIC 入口（`/`、`/classroom/[id]`）零回归。新增能力以**可选**方式接入（未配置登录/存储时降级为本地匿名会话）。
- **渐进式安全**：登录与服务端存储默认开启账号隔离；未认证用户走访客模式，数据仅存本地。

### 1.3 范围边界

- **做**：后端改用 MAIC 生成/编排/回放、模拟器场景化、初始化定制、播放器式课堂 UI、右侧控制面板、账号登录、服务端按用户隔离存储、择优引入 MAIC 隐藏功能。
- **不做（本期）**：3D 数字人、模型微调、Neo4j 知识图谱、Kubernetes、覆盖全部大学物理章节（仍以现有 4 章 + 旗舰章为基线，新增章节通过内容目录扩展）。

---

## 2. 系统架构

### 2.1 总体架构（重构后）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  浏览器 (React 19 + Next.js App Router)                                        │
│                                                                                │
│  /wulian (首页/章节库)                                                          │
│      │  登录态判定 → 选择章节                                                    │
│      ▼                                                                          │
│  /wulian/lesson/[id]  ── 客户端外壳 WulianClassroomApp                          │
│      │                                                                          │
│      ├─[A] 初始化网关 InitGate                                                  │
│      │     · 判定该用户该章节是否已有「定制课堂实例」                             │
│      │     · 无 → 收集学生情况 + 上传资料 + 选模拟器 → 触发个性化生成            │
│      │     · 有 → 直接进入播放器                                                 │
│      │                                                                          │
│      └─[B] 课堂播放器 ClassroomPlayer（复用 MAIC components/stage + 改造）       │
│            ┌────────────────────────────┬──────────────────────────┐           │
│            │  主区：PPT (SlideRenderer)  │  右侧控制面板 ControlPanel │           │
│            │  + 视频式进度条 ProgressBar │  · 资料 (查看/上传)        │           │
│            │  + 字幕 SubtitleOverlay     │  · 提示词 (查看/发送)      │           │
│            │  (移除左侧缩略图列)         │  · 对话预览 (转写流)        │           │
│            └────────────────────────────┴──────────────────────────┘           │
└───────────────────────────────┬────────────────────────────────────────────────┘
                                │ fetch / SSE / 轮询
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Next.js 服务端 (/api/wulian/*)                                                 │
│                                                                                │
│  鉴权中间件 (middleware.ts 扩展: 会话 cookie + ACCESS_CODE 兼容)                 │
│                                                                                │
│  /api/wulian/auth/*          登录/登出/会话 (注册、登录、当前用户)               │
│  /api/wulian/classroom       创建定制课堂实例 (异步 job) / 查询 / 列表           │
│  /api/wulian/classroom/[job] 轮询生成进度                                        │
│  /api/wulian/chat            实时多 Agent 讨论 (复用 MAIC orchestration, SSE)    │
│  /api/wulian/ingest          上传资料 → 解析 → 切块 → 嵌入 (按 user 隔离)         │
│  /api/wulian/profile         学生画像 / 个性化设置 读写                           │
│  /api/wulian/feedback        测验/评分/评论                                      │
│                                                                                │
│        │                                                                       │
│        ▼ 调用 MAIC 内核                                                          │
│   ┌──────────────────────────────────────────────────────────────────────┐    │
│   │ MAIC 课堂内核 (复用)                                                     │    │
│   │  lib/generation  两阶段生成 (大纲 → 场景: slide/quiz/interactive/pbl)    │    │
│   │  lib/orchestration  LangGraph 导演图 (多 agent 轮次 + 白板动作)          │    │
│   │  lib/playback  回放状态机 (idle→playing→live)                            │    │
│   │  lib/action  动作引擎 (speech/whiteboard/spotlight/laser…)               │    │
│   │  lib/media / lib/audio  图像/视频/TTS/ASR                                │    │
│   └──────────────────────────────────────────────────────────────────────┘    │
│        │                                                                       │
│        ▼ wulian 领域适配                                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐    │
│   │ lib/wulian (适配层)                                                     │    │
│   │  rag/         内置 + 上传语料检索 (注入生成与讨论)                        │    │
│   │  scientists/  科学家 persona → 映射为 MAIC Agent 配置                    │    │
│   │  simulators/  物理模拟器注册表 → 映射为 interactive 场景                  │    │
│   │  personalize/ 学生画像 → 生成需求(UserRequirements) 构造                 │    │
│   └──────────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  存储层 (服务端持久化, 按 user 隔离)                                            │
│   data/wulian/users/<userId>/profile.json          学生画像 + 设置             │
│   data/wulian/users/<userId>/classrooms/<id>.json   定制课堂实例(stage+scenes)  │
│   data/wulian/users/<userId>/uploads/, vectors/     私有上传资料 + 向量         │
│   data/wulian/accounts.json (或 SQLite/可插拔)      账号凭据                     │
│   content/wulian/  (内置语料/章节/科学家/模拟器, git 跟踪, 全局共享)             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 与现状的关键差异

| 维度 | 现状（MVP） | 重构后 |
| --- | --- | --- |
| 课堂内容 | 无生成，纯实时对话 + 静态白板项 | MAIC 两阶段生成完整 PPT 课件（slide/quiz/interactive/pbl 场景） |
| 多 Agent | 50 行 `decideAgentSequence` | 复用 `lib/orchestration` LangGraph 导演图 |
| 模拟器 | 仅前端组件，靠 LLM 输出 `whiteboard.simulation` 嵌入 | 作为 **interactive 场景类型**正式嵌入生成的课件，老师可操作 |
| 课堂页 | 三栏静态（sidebar/白板/chat） | 播放器式：PPT 主区 + 进度条 + 字幕 + 右侧控制面板 |
| 初始化 | 无 | 首次进入个性化定制网关 |
| 存储 | 服务端无状态，前端内存 | 服务端按用户隔离持久化 |
| 登录 | 无（仅可选 ACCESS_CODE 站点级口令） | 账号体系（注册/登录/会话） |

---

## 3. 核心组件设计

### 3.1 初始化网关（InitGate）

**职责**：进入 `/wulian/lesson/[id]` 后判定是否需要首次个性化定制。

**判定逻辑**：
- 已登录用户：查询 `GET /api/wulian/classroom?chapterId=<id>&owner=me`，若已存在「定制课堂实例」→ 直接进入播放器；否则进入定制向导。
- 访客（未登录）：查本地（IndexedDB）是否有该章节实例；无则进入定制向导（结果存本地）。

**定制向导（多步表单）**：
1. **学生基本情况**：年级/专业、物理基础水平（入门/进阶）、学习目标（应试/兴趣/科研预备）、偏好节奏。
2. **资料来源**：勾选内置资料（课程语料）/ 上传私有资料（PDF/MD/TXT）/ 二者对照。
3. **模拟器选择**：从该章节关联的物理模拟器中选择要嵌入课件的项。
4. **确认生成**：把以上汇总为 `WulianPersonalizationInput`，调用 `POST /api/wulian/classroom` 触发异步生成 job，进入进度页（轮询）。

**产物**：一个**定制课堂实例**（MAIC `Stage + Scene[]` 结构，附 wulian 元数据），生成完成后跳转播放器。

### 3.2 个性化 → MAIC 生成适配（lib/wulian/personalize）

把 wulian 领域输入转换为 MAIC 生成流水线可消费的 `UserRequirements`，并在生成中注入 RAG 与模拟器：

```
WulianPersonalizationInput
  │  (chapter + scientistPersona + studentProfile + materialMode + selectedSimulators + uploadedDocIds)
  ▼
buildGenerationRequirements()
  ├─ 主题/需求文本：章节标题 + 学习目标 + 学生画像 → requirement 字符串
  ├─ Agent 配置：主讲科学家 persona → MAIC Agent (teacher) + 助教/同学 agents
  ├─ RAG 上下文：retrieve(章节内置 + 上传) → 作为 pdfContent/参考语料注入大纲与场景生成
  ├─ 模拟器约束：selectedSimulators → 指示生成器在指定知识点产出 interactive 场景(simulation)
  └─ 语言/风格：中文 + 科学家口吻
  ▼
runClassroomGenerationJob (复用 lib/server/classroom-job-runner，或 wulian 包装版)
  ▼
Stage + Scene[]  (含 slide / quiz / interactive(simulation) / 可选 pbl 场景)
```

**模拟器场景化**：wulian 的 4 个模拟器（`flux-loop-slider`、`photoelectric`、`double-slit`、`newton-block`）注册为 MAIC **interactive 场景**的一种内置类型。生成器在大纲对应知识点处产出一个 `interactive` 场景，其内容指向 wulian 模拟器组件 + 初始参数；回放时老师可通过动作引擎设置参数/高亮（复用 MAIC 深度交互模式的「AI 教师操作 UI」能力）。

### 3.3 课堂播放器（ClassroomPlayer）

基于 MAIC `components/stage` 改造，形成 wulian 专属外壳。布局为**两栏**（主区 + 右侧控制面板），移除原 MAIC 左侧缩略图/场景列表。

```
┌───────────────────────────────────────────────┬─────────────────────────┐
│  主区 MainStage                                 │  右侧 ControlPanel        │
│  ┌─────────────────────────────────────────┐  │  Tab: 资料 | 提示词 | 对话 │
│  │  SlideRenderer / SceneRenderer           │  │ ───────────────────────  │
│  │  (PPT / quiz / interactive-simulation)   │  │ [资料]                    │
│  │                                          │  │  · 内置资料列表(只读)      │
│  │                                          │  │  · 我的上传(查看/上传/删)  │
│  │  ┌────────────────────────────────────┐ │  │  · 资料模式 课程/我的/对照 │
│  │  │ SubtitleOverlay (老师发言字幕)      │ │  │ ───────────────────────  │
│  │  └────────────────────────────────────┘ │  │ [提示词]                  │
│  └─────────────────────────────────────────┘  │  · 预设快捷提示词          │
│  ┌─────────────────────────────────────────┐  │  · 自定义发送提示词        │
│  │ VideoProgressBar (视频式进度条)          │  │ ───────────────────────  │
│  │  ◁ ▷ ⏸  ━━━━●━━━━━━  03:12 / 12:40  1.5x │  │ [对话预览]                │
│  │  (拖动/点击跳转场景, 自动推进, 倍速)      │  │  · 实时转写流(老师/同学/我)│
│  └─────────────────────────────────────────┘  │  · 输入框 发送/停止        │
└───────────────────────────────────────────────┴─────────────────────────┘
```

**关键子组件**：

- **MainStage**：渲染当前场景。slide → `components/slide-renderer`；interactive(simulation) → wulian `Simulation` 组件包进 MAIC 交互场景容器；quiz/pbl → `components/scene-renderers`。
- **VideoProgressBar**：把「场景序列 + 每场景时长（由语音/动作时长估算）」抽象为一条时间轴。支持播放/暂停、上一/下一场景、拖动跳转、倍速。底层驱动复用 `lib/playback/engine` 的 `idle→playing→live` 状态机（已内置 `getPlaybackSpeed`、`onSceneChange`、`onProgress`）。
- **SubtitleOverlay**：订阅播放引擎 `onTextDelta` / `onSpeechStart` / `onSpeakerChange`，在主画面底部以字幕形式滚动显示当前发言者文本（替代原 MVP 的独立 chat 消息列作为主要呈现）。
- **ControlPanel**：右侧三 Tab。
  - *资料*：内置语料（只读）、我的上传（查看/上传/删除，调 `/api/wulian/ingest`）、资料模式开关（course/mine/compare）。
  - *提示词*：预设快捷指令 + 自定义提示词输入，发送即触发实时讨论（`/api/wulian/chat`）或局部重讲。
  - *对话预览*：实时转写流（lecture + discussion 合并时间线），可滚动回看；用户提问入口也在此。

**与 MAIC 的关系**：尽量复用 `Stage` 的内部播放控制与 `useStageStore`，但用 wulian 外壳重新组织布局（隐藏缩略图、加进度条与字幕、换右栏）。优先以**包装/组合**方式而非 fork。

### 3.4 实时多 Agent 讨论（复用 MAIC orchestration）

课堂播放进入 `live` 模式或用户主动提问时，走 MAIC 的 LangGraph 导演图：

```
用户提问 / 触发讨论
  ▼
/api/wulian/chat  (SSE)
  ├─ 解析模型 (resolveModelFromHeaders, 复用)
  ├─ RAG retrieve (wulian rag, 注入参考资料)
  ├─ 构造 agents: 科学家(teacher) + 小麦(assistant) + 小恒(classmate)
  ├─ 调 lib/orchestration 导演图 (statelessGenerate / director-graph)
  │     · 导演决定发言顺序与是否调用白板/工具
  │     · 流式产出 speech / whiteboard 动作
  └─ SSE 事件 → 前端字幕 + 对话预览 + 白板叠加在 PPT 上
```

字幕/对话预览消费的事件统一映射到 wulian 既有的 `WulianStreamEvent` 形态（或直接采用 MAIC 的事件协议，前端做适配），确保播放器组件协议稳定。

### 3.5 账号与会话（Auth）

- **注册/登录**：`POST /api/wulian/auth/register`、`/login`、`/logout`、`GET /api/wulian/auth/me`。
- **凭据存储**：密码以 `scrypt`/`bcrypt` 加盐哈希存储；账号记录可插拔（默认 JSON 文件 `data/wulian/accounts.json`，预留 SQLite/外部 DB 接口）。
- **会话**：登录后下发 **HMAC 签名会话 cookie**（复用 `middleware.ts` 既有的 HMAC token 校验思路，新增 `wulian_session` cookie 与用户 id 绑定）。
- **中间件扩展**：`middleware.ts` 增加 wulian 会话识别——`/api/wulian/*`（除 `auth/*`）要求有效会话或允许访客降级（由路由各自决定）；与现有 `ACCESS_CODE` 站点级口令并存不冲突。
- **访客模式**：未登录可体验，但课堂实例/上传/画像只存浏览器本地（IndexedDB/Dexie，MAIC 已依赖）；登录后可选择「迁移本地数据到账号」。

### 3.6 服务端存储（按用户隔离）

```
data/wulian/
  accounts.json                               账号表(可换 SQLite)
  users/<userId>/
    profile.json                              学生画像 + 个性化设置
    classrooms/<classroomId>.json             定制课堂实例 (PersistedClassroomData + wulian 元数据)
    uploads/<docId><ext>                      私有上传原文件
    vectors/<docId>.json                      上传文档 chunk + 向量
    feedback/<yyyymmdd>.jsonl                 反馈日志
content/wulian/                               全局内置内容 (git 跟踪, 所有用户共享只读)
    chapters/  scientists/  simulators/  corpus/  knowledge/
```

复用 MAIC `lib/server/classroom-storage.ts` 的**原子写入**（temp + rename）与 `PersistedClassroomData` 结构，wulian 在其上扩展 `owner`、`chapterId`、`personalization`、`simulators` 元数据，并把根目录换成按 `userId` 隔离的路径。

### 3.7 吸收 MAIC 隐藏/增强功能（择优）

| MAIC 能力 | 在 wulian 的用途 | 优先级 |
| --- | --- | --- |
| 深度交互模式（AI 教师操作 UI） | 让科学家在模拟器上设条件/高亮/给提示 | 高（与模拟器场景天然契合） |
| TTS（Edge-TTS / VoxCPM2） | 科学家语音讲解 + 字幕同步 | 高 |
| ASR（语音输入） | 学生口头提问 | 中 |
| 白板动作引擎（公式/图形/laser/spotlight） | 推导板书叠加在 PPT 上 | 高 |
| PPTX / HTML / ZIP 导出 | 导出定制课堂课件 | 中 |
| Web 搜索 | 讨论时检索最新资料 | 低（可选开关） |
| i18n / 暗色模式 | 界面多语言/夜间 | 低 |

---

## 4. 数据模型

### 4.1 新增/扩展类型（lib/wulian/types.ts 扩展）

```ts
// 学生画像（个性化输入）
interface StudentProfile {
  userId: string;
  gradeOrMajor?: string;                       // 年级/专业
  level: 'beginner' | 'intermediate' | 'advanced';
  goals: ('exam' | 'interest' | 'research')[]; // 学习目标
  pacePreference?: 'slow' | 'normal' | 'fast';
  preferredScientistTone?: string;             // 偏好讲解风格
  updatedAt: number;
}

// 个性化定制输入（向导汇总）
interface WulianPersonalizationInput {
  chapterId: string;
  studentProfile: StudentProfile;
  materialMode: 'course' | 'mine' | 'compare';
  uploadedDocIds: string[];
  selectedSimulatorIds: string[];
  extraInstructions?: string;
}

// 定制课堂实例（持久化）——在 MAIC PersistedClassroomData 之上扩展
interface WulianClassroomInstance {
  id: string;
  owner: string;                 // userId（访客时为本地匿名 id）
  chapterId: string;
  stage: Stage;                  // 复用 MAIC lib/types/stage
  scenes: Scene[];               // 复用 MAIC
  personalization: WulianPersonalizationInput;
  simulators: string[];          // 已嵌入的模拟器 id
  createdAt: string;
  updatedAt: string;
}

// 模拟器注册项（场景化）
interface SimulatorDefinition {
  id: string;                    // 'flux-loop-slider' 等
  title: string;
  subject: Chapter['subject'];
  knowledgePointHint?: string;   // 关联知识点
  params: { key: string; label: string; min: number; max: number; default: number; unit?: string }[];
}

// 账号
interface UserAccount {
  id: string;
  username: string;
  passwordHash: string;          // scrypt/bcrypt
  salt: string;
  createdAt: number;
}

// 生成任务（轮询）
interface WulianGenerationJob {
  jobId: string;
  owner: string;
  chapterId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  step: string;
  progress: number;              // 0..100
  classroomId?: string;          // 完成后产物
  error?: string;
}
```

### 4.2 复用的 MAIC 类型

- `Stage`、`Scene`（`lib/types/stage`）— 课堂结构与场景。
- `UserRequirements`、`GenerationSession`、`GenerationProgress`（`lib/types/generation`）— 生成流水线输入与进度。
- `PlaybackSnapshot`、`EngineMode`、`PlaybackEngineCallbacks`（`lib/playback`）— 回放状态与进度持久化。
- `PersistedClassroomData`（`lib/server/classroom-storage`）— 服务端持久化基类。

### 4.3 现有类型的去留

- `AgentTurn` / `WulianStreamEvent`：保留作为前端字幕/对话预览的稳定协议；后端来源从自研状态机切换为 MAIC orchestration 的适配输出。
- `Chapter` / `ScientistPersona` / `KnowledgePoint` / `FormulaCard`：保留并新增到 `SimulatorDefinition` 的关联（`KnowledgePoint.simulationId` → `SimulatorDefinition.id`）。
- `ChatRequestBody`：扩展可携带 `classroomId`，使讨论挂到具体定制实例上下文。

---

## 5. API 设计（/api/wulian/*）

| 方法 + 路径 | 作用 | 鉴权 | 复用的 MAIC 模块 |
| --- | --- | --- | --- |
| `POST /auth/register` | 注册账号 | 公开 | — |
| `POST /auth/login` | 登录，下发会话 cookie | 公开 | middleware HMAC 思路 |
| `POST /auth/logout` | 登出 | 会话 | — |
| `GET /auth/me` | 当前用户 | 会话/访客 | — |
| `GET /profile` / `PUT /profile` | 读写学生画像 + 设置 | 会话 | — |
| `POST /classroom` | 提交个性化生成 job（异步），返回 jobId + pollUrl | 会话/访客 | `classroom-job-store`、`classroom-job-runner`、`lib/generation` |
| `GET /classroom/[jobId]` | 轮询生成进度 | 会话/访客 | `classroom-job-store` |
| `GET /classroom?chapterId=&owner=me` | 列出/查询用户该章节定制实例 | 会话/访客 | `classroom-storage` |
| `GET /classroom/instance/[id]` | 读取定制课堂实例（stage+scenes） | 会话/访客（owner 校验） | `classroom-storage` |
| `POST /chat` | 实时多 Agent 讨论（SSE） | 会话/访客 | `lib/orchestration`、`resolve-model` |
| `POST /ingest` | 上传资料（按 user 隔离） | 会话/访客 | `unpdf`、wulian rag |
| `POST /feedback` | 测验/评分/评论 | 会话/访客 | — |
| `GET /lesson` / `GET /lesson?id=` | 章节库/详情（含模拟器、科学家） | 公开 | — |
| `GET /simulators` | 模拟器注册表 | 公开 | — |

> 兼容性：原有 `/api/wulian/lesson`、`/ingest`、`/feedback`、`/chat` 路径保留，行为升级（chat 切换到 MAIC 编排，ingest 切换到按用户隔离）。

---

## 6. 关键流程

### 6.1 首次进入 → 个性化定制 → 进入课堂

```
用户打开 /wulian/lesson/em-induction
  → InitGate 判定：该用户该章节无定制实例
  → 定制向导：填学生情况 / 选资料模式 / 选模拟器 / 上传私有资料
  → POST /api/wulian/classroom  (WulianPersonalizationInput)
  → 服务端 buildGenerationRequirements → 异步 job：
        Stage1 大纲生成 (注入 RAG + 模拟器约束)
        Stage2 场景生成 (slide/quiz/interactive-simulation/pbl)
        媒体生成 (图像/TTS, 可选)
  → 前端轮询 /api/wulian/classroom/[jobId] 直到 completed
  → 持久化 WulianClassroomInstance → 跳转播放器
```

### 6.2 二次进入

```
用户再次打开 /wulian/lesson/em-induction
  → InitGate 命中已有实例
  → GET /api/wulian/classroom/instance/[id] 载入 stage+scenes
  → 直接进入 ClassroomPlayer（恢复 PlaybackSnapshot 进度）
```

### 6.3 课堂播放与实时讨论

```
ClassroomPlayer 载入 → 回放引擎 idle→playing
  · 进度条自动推进，逐场景播放
  · SubtitleOverlay 显示老师发言 (TTS 同步)
用户在右栏「提示词/对话预览」发问 或 进度触发讨论点
  → 引擎切 live → POST /api/wulian/chat (SSE)
  → MAIC 导演图编排 teacher/assistant/classmate
  → 字幕 + 对话预览实时更新, 白板动作叠加在 PPT 上
讨论结束 → 引擎回 playing 继续
```

---

## 7. 复用 MAIC 模块清单（落地映射）

| wulian 需求 | 直接复用 | 适配/包装 |
| --- | --- | --- |
| 课堂生成 | `lib/generation/*`、`lib/server/classroom-job-*` | wulian `personalize` 构造 `UserRequirements`，注入 RAG/模拟器 |
| 多 Agent 编排 | `lib/orchestration/*` | wulian agents 配置（科学家/小麦/小恒）映射为 MAIC Agent |
| 回放/进度 | `lib/playback/*` | VideoProgressBar/SubtitleOverlay 订阅回调 |
| 动作/白板 | `lib/action/*`、`components/whiteboard` | 模拟器交互动作扩展 |
| 场景渲染 | `components/slide-renderer`、`components/scene-renderers`、`components/stage` | wulian 播放器外壳（隐藏缩略图/换右栏） |
| 媒体/语音 | `lib/media`、`lib/audio` | 科学家音色映射 |
| 存储 | `lib/server/classroom-storage` 原子写 | 按 userId 隔离路径 + wulian 元数据 |
| 鉴权 | `middleware.ts` HMAC | 新增 `wulian_session` 会话 |
| 导出 | `lib/export` | 课堂实例导出入口 |

---

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| MAIC `Stage` 与 `useStageStore` 与 wulian 外壳耦合，改动可能影响 `/classroom/[id]` | 以组合/包装为主，不 fork 共享组件；新增 wulian 专属 props/容器，原入口零改动；改动点加回归 e2e。 |
| 生成流水线接受自定义参考语料/模拟器约束的能力有限 | 先调研 `outline-generator`/`scene-generator` 的注入点（pdfContent、agents、约束 prompt）；不足处通过 wulian 包装层补 prompt，必要时最小侵入扩展生成器参数。 |
| 模拟器作为 interactive 场景与 MAIC 交互场景渲染器协议差异 | 定义 wulian 模拟器 → interactive 场景的稳定适配协议；模拟器组件保持自包含。 |
| 登录/存储引入安全面（密码、会话、越权访问他人课堂） | 密码加盐哈希；会话 HMAC 签名；所有按用户读写做 owner 校验；上传走 SSRF/类型/大小校验（复用现有 guard）。 |
| 访客与登录数据迁移一致性 | 明确迁移流程（登录后导入本地实例/上传），冲突以服务端为准并提示。 |
| 生成耗时长、轮询体验 | 沿用 MAIC 异步 job + 轮询；进度细分步骤；失败可重试单场景（复用 `retrySingleOutline`）。 |

---

## 9. 已确认的范围决策

以下决策已与需求方确认（采用推荐默认值），作为需求与实现的约束：

1. **登录强度**：MVP 采用「用户名 + 密码 + 本地文件账号」。不做邮箱验证/找回密码。
2. **部署形态**：单机自托管，JSON 文件存储为主；账号/存储层预留可插拔 DB 接口，但本期不实现 DB。
3. **访客模式**：保留免登录体验，访客数据存浏览器本地（IndexedDB/Dexie）；登录后可迁移本地数据到账号。
4. **TTS/语音**：本期先做**字幕**（SubtitleOverlay）；TTS 语音以**可选开关**接入（复用 MAIC TTS），默认关闭，不阻塞主流程。
5. **导出**：定制课堂导出（PPTX/HTML/ZIP）**列为二期**，本期不实现（但存储结构与 MAIC 导出兼容，便于后续接入）。
6. **章节范围**：本期在**现有 4 章**（旗舰 `em-induction` + 3 个 preview 章）上验证重构，不新增章节内容；新增章节通过既有内容目录扩展机制完成。
7. **模拟器范围**：本期完成**现有 4 个模拟器**（`flux-loop-slider`、`photoelectric`、`double-slit`、`newton-block`）的**场景化集成**，不新增模拟器。
```
