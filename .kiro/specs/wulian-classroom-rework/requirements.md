# 需求文档：物联智讲课堂重构（Wulian Classroom Rework）

## 简介

本需求文档由已确认的高层设计（`design.md`）推导而来。目标是把「物联智讲（Wulian）」从一个绕开 OpenMAIC 内核的轻量 MVP，升级为**复用 MAIC 课堂内核**的完整教学产品，覆盖四大改动：后端重构（采用 MAIC 生成/编排/回放 + RAG + 物理模拟器场景化）、前端重构（初始化定制网关 + 播放器式课堂页 + 右侧控制面板）、服务端按用户隔离存储 + 登录、择优吸收 MAIC 隐藏功能。

### 范围约束（来自 design.md §9）

- 登录：用户名 + 密码 + 本地文件账号；不做邮箱验证/找回密码。
- 部署：单机自托管，JSON 文件存储为主，预留可插拔 DB 接口（本期不实现 DB）。
- 访客：保留免登录体验，数据存浏览器本地；登录后可迁移本地数据。
- TTS：本期先做字幕；TTS 为可选开关，默认关闭。
- 导出：列为二期，本期不实现（存储结构保持与 MAIC 导出兼容）。
- 章节：在现有 4 章上验证；不新增章节内容。
- 模拟器：完成现有 4 个模拟器的场景化集成；不新增模拟器。

### 术语

- **定制课堂实例（Classroom Instance）**：针对某用户、某章节、依据个性化输入生成的 MAIC `Stage + Scene[]` 结构及其 wulian 元数据。
- **初始化网关（InitGate）**：进入课堂前判定是否需要首次个性化定制的逻辑。
- **控制面板（ControlPanel）**：课堂播放器右侧的「资料 / 提示词 / 对话预览」面板。
- **访客（Guest）**：未登录用户，数据仅存浏览器本地。

---

## 需求列表

### 需求 1：后端采用 MAIC 课堂生成系统

**用户故事：** 作为平台维护者，我希望 wulian 课堂内容由 MAIC 的两阶段生成流水线产出，以便获得完整的 PPT 课件、测验与交互场景，而不是仅靠实时对话。

#### 验收标准

1. WHEN 个性化定制输入被提交 THEN 系统 SHALL 通过 MAIC 生成流水线（`lib/generation`）产出包含 slide / quiz / interactive / 可选 pbl 场景的 `Stage + Scene[]` 结构。
2. WHEN 生成大纲与场景 THEN 系统 SHALL 将 wulian 的多 Agent 配置（科学家 teacher + 助教 + 同学）映射为 MAIC Agent 配置注入生成。
3. WHERE 章节关联了科学家 persona THE 系统 SHALL 在生成的讲解内容中体现该科学家口吻与代表性公式。
4. WHEN 课堂生成任务执行 THEN 系统 SHALL 以异步 job + 轮询方式运行（复用 MAIC `classroom-job-store` / `classroom-job-runner`），并返回 `jobId` 与轮询地址。
5. IF 生成过程中某个场景失败 THEN 系统 SHALL 允许针对单个大纲项重试而不丢弃整堂课已生成内容。
6. WHILE 生成进行中 THE 系统 SHALL 通过轮询接口暴露分步进度（步骤名 + 0..100 百分比）。
7. WHEN 实时讨论被触发 THEN 系统 SHALL 使用 MAIC 编排（`lib/orchestration` 导演图）决定发言顺序与白板/工具调用，而非原 50 行简易状态机。

### 需求 2：RAG 注入生成与讨论

**用户故事：** 作为学生，我希望课堂内容结合内置教材与我上传的资料，以便课程贴合权威教材与我的个人材料。

#### 验收标准

1. WHEN 构造生成需求 THEN 系统 SHALL 依据资料模式（course / mine / compare）检索内置语料与用户上传语料，并将检索结果作为参考上下文注入大纲与场景生成。
2. WHEN 资料模式为 `compare` THEN 系统 SHALL 同时检索内置与上传语料，并在内容中标注一致点与差异。
3. WHEN 实时讨论发生 THEN 系统 SHALL 对用户问题执行检索并将命中片段编号化注入提示词。
4. IF 未配置嵌入模型 THEN 系统 SHALL 自动降级为关键词检索而不报错。
5. WHEN 内容引用了检索片段 THEN 系统 SHALL 以可识别的引用编号（如 `[#1]`）在讲解与引用区呈现来源。
6. WHERE 检索无任何命中 THE 系统 SHALL 明确告知「以下基于一般教材」并仍能产出内容。

### 需求 3：物理模拟器场景化集成

**用户故事：** 作为学生，我希望物理模拟器作为可交互课件嵌入课堂，以便我能动手调参并观察现象，老师也能在模拟器上演示。

#### 验收标准

1. THE 系统 SHALL 提供模拟器注册表，至少包含现有 4 个模拟器（`flux-loop-slider`、`photoelectric`、`double-slit`、`newton-block`）及其可调参数定义。
2. WHEN 个性化输入选择了某些模拟器 THEN 系统 SHALL 在生成的课件中为对应知识点产出指向该模拟器的 interactive 场景。
3. WHEN 播放到 interactive(simulation) 场景 THEN 系统 SHALL 在主区域渲染该模拟器并允许学生实时调参看现象。
4. WHERE MAIC 深度交互模式可用 THE 系统 SHALL 允许科学家 Agent 通过动作设置模拟器参数 / 高亮 / 给提示。
5. IF 某模拟器渲染失败 THEN 系统 SHALL 降级显示占位与说明而不中断整堂课播放。
6. THE 模拟器场景 SHALL 通过稳定的适配协议接入 MAIC 交互场景渲染容器，模拟器组件保持自包含。

### 需求 4：初始化定制网关

**用户故事：** 作为学生，我第一次进入某章节时希望系统根据我的情况和资料定制课堂，再进入正式课堂，以便课程个性化。

#### 验收标准

1. WHEN 用户进入 `/wulian/lesson/[id]` THEN 系统 SHALL 判定该用户该章节是否已有定制课堂实例。
2. IF 已存在定制实例 THEN 系统 SHALL 跳过向导直接进入课堂播放器。
3. IF 不存在定制实例 THEN 系统 SHALL 引导用户进入个性化定制向导。
4. THE 定制向导 SHALL 收集学生基本情况（年级/专业、物理基础水平、学习目标、节奏偏好）、资料模式、要嵌入的模拟器、可选私有上传资料。
5. WHEN 用户确认定制 THEN 系统 SHALL 汇总为个性化输入并触发课堂生成 job，展示生成进度。
6. WHEN 生成完成 THEN 系统 SHALL 持久化定制实例并自动进入课堂播放器。
7. IF 用户为登录态 THEN 定制实例 SHALL 与该用户账号绑定；IF 用户为访客 THEN 定制实例 SHALL 存储于浏览器本地。

### 需求 5：播放器式课堂页（PPT 主区 + 进度条 + 字幕）

**用户故事：** 作为学生，我希望课堂像看视频一样：主区域是 PPT，用进度条翻页，老师讲话以字幕呈现，以便我专注于内容。

#### 验收标准

1. THE 课堂播放器 SHALL 以 PPT/场景为主区域渲染（复用 MAIC slide-renderer / scene-renderers）。
2. THE 课堂播放器 SHALL **不显示**左侧 PPT 缩略图预览/切换列。
3. THE 课堂播放器 SHALL 提供视频式进度条，支持播放/暂停、上一/下一场景、拖动跳转、倍速。
4. WHEN 老师/Agent 发言 THEN 系统 SHALL 在主画面以字幕形式滚动显示当前发言文本，并标识发言者。
5. WHILE 课堂自动播放 THE 进度条 SHALL 随场景与发言进度推进。
6. WHEN 用户拖动或点击进度条 THEN 系统 SHALL 跳转到对应场景。
7. WHERE 存在已保存的播放进度 THE 系统 SHALL 在重新进入时恢复到上次位置。
8. WHERE 视口较窄（移动端） THE 布局 SHALL 响应式适配（主区与控制面板可堆叠/折叠）。

### 需求 6：右侧控制面板

**用户故事：** 作为学生，我希望在课堂右侧随时查看/上传资料、查看/发送提示词、预览对话，以便不打断学习地与课堂互动。

#### 验收标准

1. THE 控制面板 SHALL 提供「资料 / 提示词 / 对话预览」三个分区（Tab）。
2. THE 资料分区 SHALL 显示内置资料（只读）与我的上传资料（可查看/上传/删除），并提供资料模式切换（course / mine / compare）。
3. WHEN 用户上传资料 THEN 系统 SHALL 解析、切块、嵌入并按当前用户隔离存储，成功后在列表中显示（含切块数、是否走语义检索）。
4. THE 提示词分区 SHALL 提供预设快捷提示词与自定义提示词输入，发送后触发实时讨论或局部重讲。
5. THE 对话预览分区 SHALL 实时显示发言转写流（老师/同学/学生），并可滚动回看历史。
6. WHEN 用户在对话预览发送问题 THEN 系统 SHALL 通过实时讨论接口流式返回并更新字幕与对话预览。
7. WHEN 用户停止生成 THEN 系统 SHALL 中止当前讨论请求。

### 需求 7：账号与登录

**用户故事：** 作为用户，我希望注册并登录，以便我的课堂、资料与设置在我的账号下隔离与保存。

#### 验收标准

1. THE 系统 SHALL 提供注册（用户名 + 密码）、登录、登出、获取当前用户接口。
2. WHEN 用户注册 THEN 系统 SHALL 以加盐哈希存储密码，不以明文保存。
3. WHEN 用户登录成功 THEN 系统 SHALL 下发 HMAC 签名的会话 cookie。
4. WHEN 携带有效会话访问受保护接口 THEN 系统 SHALL 识别其用户身份。
5. IF 会话无效或缺失 THEN 受保护的写接口 SHALL 拒绝或按访客降级（由路由策略决定），且 SHALL NOT 暴露他人数据。
6. WHERE 已配置站点级 `ACCESS_CODE` THE 登录机制 SHALL 与其并存而不冲突。
7. WHEN 用户名已存在的注册请求到达 THEN 系统 SHALL 返回明确的冲突错误而不覆盖既有账号。

### 需求 8：服务端按用户隔离存储

**用户故事：** 作为用户，我希望我的课堂实例、上传资料、画像与设置安全地存储在服务端并与他人隔离，以便跨设备可用且互不干扰。

#### 验收标准

1. THE 系统 SHALL 按 `userId` 隔离存储定制课堂实例、上传资料与向量、学生画像与设置、反馈日志。
2. WHEN 写入持久化数据 THEN 系统 SHALL 使用原子写（temp + rename，复用 MAIC 模式）避免半写文件。
3. WHEN 用户读取课堂实例/资料 THEN 系统 SHALL 校验归属（owner），拒绝越权访问他人数据。
4. THE 内置内容（章节/科学家/模拟器/语料）SHALL 全局共享且对用户只读。
5. WHEN 访客登录后选择迁移 THEN 系统 SHALL 将本地课堂实例与上传迁移到其账号，冲突时以服务端为准并提示用户。
6. THE 定制实例存储结构 SHALL 兼容 MAIC `PersistedClassroomData`，并扩展 owner / chapterId / personalization / simulators 元数据。

### 需求 9：学生画像与个性化设置

**用户故事：** 作为学生，我希望维护我的基本情况与偏好设置，以便每次定制课堂都贴合我的水平与目标。

#### 验收标准

1. THE 系统 SHALL 提供读取与更新学生画像/设置的接口。
2. WHEN 创建定制课堂 THEN 系统 SHALL 默认采用当前用户画像作为个性化输入基线，并允许本次覆盖。
3. WHERE 用户更新画像 THE 后续新建的定制课堂 SHALL 反映最新画像。
4. THE 画像 SHALL 至少包含物理基础水平、学习目标、节奏偏好。

### 需求 10：吸收 MAIC 增强功能（择优）

**用户故事：** 作为学生，我希望课堂具备 MAIC 的白板推导、可选语音与交互引导等能力，以便学习体验更丰富。

#### 验收标准

1. WHEN Agent 进行推导 THEN 系统 SHALL 支持在 PPT 上叠加白板动作（公式/图形/高亮/laser），复用 MAIC 动作引擎。
2. WHERE TTS 开关开启 THE 系统 SHALL 以科学家音色朗读发言并与字幕同步；WHERE 关闭 THE 课堂 SHALL 正常以字幕进行。
3. WHERE 深度交互模式适用 THE 科学家 SHALL 能操作交互场景（如模拟器）引导学生。
4. THE 引入的增强功能 SHALL 为可选/可降级，缺失对应配置时不阻塞课堂主流程。

### 需求 11：隔离与兼容（零回归）

**用户故事：** 作为平台维护者，我希望 wulian 重构不影响原 MAIC 入口，以便两套体验稳定共存。

#### 验收标准

1. THE 重构 SHALL 保持 `/wulian/*` 与 `/api/wulian/*` 命名空间。
2. THE 原 MAIC 入口（`/`、`/classroom/[id]`、`/api/chat`、`/api/generate/*`）SHALL 行为不变。
3. WHERE wulian 复用 MAIC 共享组件（`Stage`、`useStageStore`、slide-renderer 等） THE 复用 SHALL 以组合/包装为主，避免对共享组件做破坏性改动。
4. WHEN 运行现有测试与构建 THEN 重构 SHALL NOT 引入针对原 MAIC 功能的回归。
5. THE 原有 `/api/wulian/lesson`、`/ingest`、`/feedback`、`/chat` 路径 SHALL 保留（行为可升级）。

### 需求 12：安全与健壮性

**用户故事：** 作为平台维护者，我希望登录、上传与存储具备基本安全防护，以便系统可在真实环境运行。

#### 验收标准

1. WHEN 处理上传文件 THEN 系统 SHALL 校验类型与大小限制，并对外部抓取做 SSRF 防护（复用现有 guard）。
2. WHEN 校验会话签名 THEN 系统 SHALL 使用 HMAC 并以定长比较降低时序攻击风险。
3. IF 缺少 LLM provider Key THEN 相关接口 SHALL 返回明确的 `MISSING_API_KEY` 提示而非崩溃。
4. THE 系统 SHALL NOT 在响应或日志中回显密码、会话密钥等敏感值。
5. WHEN 接口出错 THEN 系统 SHALL 返回统一错误码（复用 `apiError`）与可读信息。
```
