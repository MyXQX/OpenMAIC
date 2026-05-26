# 物联智讲（Wulian Zhi-Jiang）

> AI 科学巨匠互动学习系统 —— 在 OpenMAIC 之上的**大学物理多智能体课堂**。

这是基于「物联智讲：AI 科学巨匠互动学习系统」开发方案的一份 MVP 实现。它**不替换** OpenMAIC，而是作为一个独立模块挂到同一个 Next.js 项目里，复用 OpenMAIC 已经装好的依赖（AI SDK、KaTeX、Tailwind 4、Next.js 16）。

入口路径 `/wulian`，所有 API 都在 `/api/wulian/*`，原 OpenMAIC 入口（`/`、`/classroom/[id]` 等）一切照旧。

---

## 第一次启动（5 分钟）

```bash
# 1. 进入项目目录（已经在你电脑里）
cd C:\Users\xqx\Documents\code_libraries\digitalAI\openmaic-plan

# 2. 复制 env 模板
copy .env.wulian.example .env.local

# 3. 编辑 .env.local，填入任一 LLM Key（推荐 DeepSeek 或 Qwen）

# 4. 构建物理内置语料（首次必须；如果配置了 embedding 会顺带嵌入）
pnpm wulian:build-content

# 5. 启动开发服务器
pnpm dev

# 6. 浏览器打开
#    http://localhost:3000/wulian            首页（章节选择）
#    http://localhost:3000/wulian/lesson/em-induction   旗舰章节：电磁感应
```

第一次跑别忘了执行 `pnpm wulian:build-content`，否则 RAG 会从空语料里检索。

---

## 当前已交付

### 4 个章节

| ID                | 学科     | 主讲科学家         | 状态     |
| ----------------- | -------- | ------------------ | -------- |
| `em-induction`    | 电磁学   | 法拉第（+ 麦克斯韦）| ✅ ready  |
| `newton-laws`     | 力学     | 牛顿               | preview |
| `double-slit`     | 光学     | 惠更斯（+ 麦克斯韦） | preview |
| `photoelectric`   | 近代物理 | 爱因斯坦（+ 玻尔）  | preview |

「ready」的章节 RAG 语料更丰富（电磁感应有 14 个 chunk）；其余章节也能完整跑通对话/白板/小测/上传，只是内置教材片段精简。

### 6 位科学家 persona

法拉第、麦克斯韦、牛顿、爱因斯坦、玻尔、惠更斯。

每位有：身份、年代、代表公式、风格、系统提示。新增只需在 `content/wulian/scientists/` 放一个 JSON。

### 3 类 Agent

- **科学家导师**（teacher）：主讲，按章节绑定到对应科学家
- **小麦 助教**（assistant）：基于 RAG 答疑，结构化回答
- **小恒 同学**（classmate）：主动提常见误区

### 4 个交互模拟器

`flux-loop-slider`、`photoelectric`、`double-slit`、`newton-block`。所有滑块即时改参数即时看现象，老师讲到时也可以让 LLM 输出 `whiteboard:[{type:'simulation', simulationId:..., params:{...}}]` 来嵌入。

### 5 个 API 接口

```
GET  /api/wulian/lesson                 // 列出章节
GET  /api/wulian/lesson?id=<id>         // 章节详情 + 主讲 + 助教/同学
POST /api/wulian/chat                   // SSE 多 Agent 课堂
POST /api/wulian/ingest                 // 上传 PDF/TXT/Markdown
POST /api/wulian/feedback               // 收集 quiz / rating / comment
```

### 资料模式

- **课程**：仅查内置教材
- **我的**：仅查上传的资料
- **对照**：两者都查，老师会在回答中标注一致点和差异

---

## 目录结构

```
openmaic-plan/
├── app/
│   ├── api/
│   │   └── wulian/                     # ← 物联智讲 API
│   │       ├── chat/route.ts
│   │       ├── ingest/route.ts
│   │       ├── lesson/route.ts
│   │       └── feedback/route.ts
│   └── wulian/                         # ← 物联智讲 UI
│       ├── layout.tsx
│       ├── page.tsx                    # 首页
│       ├── wulian.css                  # 独立样式（不污染 OpenMAIC）
│       ├── lesson/[id]/page.tsx        # 课堂页（服务端外壳）
│       └── components/
│           ├── LessonRoom.tsx          # 课堂主组件（客户端）
│           ├── Whiteboard.tsx
│           ├── Simulation.tsx          # 4 个模拟器
│           ├── MessageBubble.tsx
│           ├── QuizCard.tsx
│           ├── UploadPanel.tsx
│           ├── Latex.tsx               # KaTeX 渲染
│           ├── Avatar.tsx
│           └── useWulianChat.ts        # SSE 客户端 hook
├── lib/
│   └── wulian/
│       ├── types.ts                    # 共享类型定义
│       ├── storage.ts                  # 数据目录约定
│       ├── agents/
│       │   ├── chapter.ts              # 加载章节
│       │   ├── persona.ts              # 加载科学家 persona
│       │   ├── prompts.ts              # 角色 system/user prompt
│       │   └── orchestrator.ts         # 多 Agent 状态机 + SSE
│       └── rag/
│           ├── chunk.ts                # 中文友好切块
│           ├── embed.ts                # 嵌入适配（OpenAI 兼容）+ BM25 兜底
│           ├── parse.ts                # PDF/TXT/MD 解析
│           └── store.ts                # JSON 持久化向量存储
├── content/
│   └── wulian/                         # ← 课程内容（手工编辑友好）
│       ├── chapters/*.json
│       ├── scientists/*.json
│       ├── corpus/<chapter>/*.md       # 源教材（构建时切块）
│       └── knowledge/<chapter>.json    # 构建产物（向量索引）
├── scripts/
│   └── wulian-build-content.mjs        # 构建语料的脚本
└── data/
    └── wulian/                         # 运行时数据（gitignored）
        ├── uploads/                    # 上传的文件
        ├── vectors/                    # 上传文档的 chunk 向量
        └── feedback/                   # 反馈日志（jsonl）
```

---

## 扩展指南

### 新增一个章节

1. 在 `content/wulian/chapters/<id>.json` 写章节配置（参考 `em-induction.json`）
2. 在 `content/wulian/corpus/<id>/` 放若干 `.md` 教材片段（按 # 二级标题分段）
3. 重新跑 `pnpm wulian:build-content`
4. 立刻能在首页看到新章节卡片

### 新增一位科学家

只需在 `content/wulian/scientists/<id>.json` 添加一个 JSON。`visualKey` 决定头像颜色（`amber/indigo/violet/emerald/slate/rose`）。

### 新增一个模拟器

在 `app/wulian/components/Simulation.tsx` 的 `Simulation` 函数 switch 里加 case，再写一个 React 组件即可。
然后让 LLM 在 `whiteboard` 里输出 `{ type: 'simulation', simulationId: 'xxx', params: { ... } }` 就能嵌入课堂。

### 切换模型/换商

`.env.local` 里改 `DEFAULT_MODEL`，例如：

| 想用什么          | DEFAULT_MODEL                  |
| ----------------- | ------------------------------ |
| DeepSeek V4 Flash | `deepseek:deepseek-v4-flash`   |
| Qwen3.6 Flash     | `qwen:qwen3.6-flash`           |
| GLM-4.7 Flash     | `glm:glm-4.7-flash`            |
| OpenAI GPT-5.4-mini | `openai:gpt-5.4-mini`        |

任何 OpenMAIC 已支持的 provider 都可以直接用 — 物联智讲走的是同一条 `lib/server/resolve-model.ts` 抽象层。

---

## 故障排查

**「需要配置 API Key」**：去 `.env.local` 填一个 `*_API_KEY` 并设置对应的 `DEFAULT_MODEL`，重启 `pnpm dev`。

**RAG 检索看起来太弱**：默认是关键词检索（BM25-Lite）。配上 `EMBEDDING_*` 或 `QWEN_API_KEY`、`OPENAI_API_KEY` 中任一，重新 `pnpm wulian:build-content` 即可走语义检索。

**白板没有公式**：检查浏览器控制台。LLM 偶尔会返回不合规的 JSON；orchestrator 用 `jsonrepair` 兜底，但极个别情况下 quiz/whiteboard 字段可能缺失。点击「请老师再讲一遍」即可重生成。

**上传 PDF 失败**：`/api/wulian/ingest` 上限 30 MB，且依赖 `unpdf`（OpenMAIC 已安装）。中文扫描件可能解析空白 — 这是已知限制（MVP 不接 OCR）。

---

## 与原方案的关系

本实现严格遵循开发方案 §1 的「OpenMAIC 课堂内核 + 轻量 RAG 后端」路线，并按照 §10.3 的不做清单：

- ❌ 没做完整 3D 数字人 → 用头像/视觉键 + LaTeX 板书 + 模拟器
- ❌ 没做模型微调 → RAG + 系统提示工程
- ❌ 没做 Neo4j 知识图谱 → JSON/Markdown 章节图谱
- ❌ 没做完整账号系统 → 服务端无状态，前端会话维护
- ❌ 没做 Kubernetes → `pnpm dev` 本地零外部服务
- ❌ 没接全部大学物理 → 4 个章节，1 个完整旗舰

下一步可做（按 §9 路线图二期）：
1. 把另外 3 章的 corpus 充实到 ready 级别
2. 接入真正的 MAIC-UI 做更复杂的实验仿真
3. 加入语音输出（TTS）—— OpenMAIC 已自带 Edge-TTS/VoxCPM2，直接复用即可
4. 错题本与学习轨迹（已经有 feedback 接口收集，做一个聚合页就行）
