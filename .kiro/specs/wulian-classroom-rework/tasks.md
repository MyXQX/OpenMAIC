# 实现计划：物联智讲课堂重构（Wulian Classroom Rework）

本任务列表由 `requirements.md` 与 `design.md` 推导而来，按「基础设施 → 后端内核适配 → 前端播放器 → 增强功能 → 集成验证」的顺序增量推进。每个任务聚焦编码、可独立验证，并标注覆盖的需求。

> 约定：所有 wulian 代码位于 `lib/wulian/*`、`app/wulian/*`、`app/api/wulian/*`，复用 MAIC 模块以 import 方式接入，避免对共享组件做破坏性改动（需求 11）。

---

- [ ] 
- [X] 1.1 扩展 `lib/wulian/types.ts` 新增重构所需类型
  - 新增 `StudentProfile`、`WulianPersonalizationInput`、`WulianClassroomInstance`、`SimulatorDefinition`、`UserAccount`、`WulianGenerationJob`
  - 为 `ChatRequestBody` 增加可选 `classroomId`
  - 从 MAIC 复用导入 `Stage` / `Scene`（`lib/types/stage`）、生成与回放相关类型，确保类型可编译
  - _需求: 1, 4, 7, 8, 9_

- [x] 1.2 编写类型层属性测试（往返序列化/不变量）
  - 用 PBT 验证 `WulianClassroomInstance`、`WulianPersonalizationInput` 的 JSON 序列化往返一致
  - 验证 `SimulatorDefinition.params` 的范围不变量（min ≤ default ≤ max）
  - _需求: 3, 8_

- [ ] 

- [x] 2.1 实现 wulian 用户隔离存储模块 `lib/wulian/storage.ts` 扩展

  - 定义按 `userId` 隔离的目录结构（`data/wulian/users/<userId>/{profile.json,classrooms/,uploads/,vectors/,feedback/}`）
  - 复用 MAIC `writeJsonFileAtomic`（原子写）封装实例/画像读写
  - 提供 owner 校验工具（读取时校验归属）
  - _需求: 8.1, 8.2, 8.3, 8.6_
- [x] 2.2 实现定制课堂实例的持久化读写 + owner 校验

  - `saveClassroomInstance` / `getClassroomInstance` / `listClassroomInstances(owner, chapterId)`
  - 结构兼容 `PersistedClassroomData` 并扩展 wulian 元数据
  - _需求: 4.6, 8.1, 8.3, 8.6_
- [x] 2.3 存储层属性测试

  - PBT：任意 `userId` 写入后只能由该 owner 读出；跨 owner 读取被拒绝
  - PBT：原子写在并发/中断模拟下不产生半写文件（以临时文件存在性断言）
  - _需求: 8.2, 8.3_

- [ ] 

- [x] 3.1 实现账号存储与密码哈希 `lib/wulian/auth/accounts.ts`

  - JSON 文件账号表（预留可插拔接口），`scrypt` 加盐哈希与校验
  - 用户名唯一性校验
  - _需求: 7.1, 7.2, 7.7, 12.4_
- [x] 3.2 实现会话签发与校验 `lib/wulian/auth/session.ts`

  - HMAC 签名会话 token（与 middleware 思路一致），绑定 userId，定长比较
  - cookie 名 `wulian_session`，签发/解析/失效
  - _需求: 7.3, 7.4, 12.2, 12.4_
- [x] 3.3 实现 Auth API 路由

  - `POST /api/wulian/auth/register|login|logout`、`GET /api/wulian/auth/me`
  - 统一错误码（`apiError`），用户名冲突返回明确错误
  - _需求: 7.1, 7.5, 7.7, 12.5_
- [x] 3.4 扩展 `middleware.ts` 识别 wulian 会话并与 ACCESS_CODE 并存

  - `/api/wulian/*`（除 `auth/*`）解析会话；无会话允许访客降级
  - 不破坏现有 ACCESS_CODE 站点级口令逻辑
  - _需求: 7.4, 7.6, 11.2_
- [x] 3.5 Auth 属性测试

  - PBT：任意密码 `hash→verify` 正确；错误密码必拒
  - PBT：篡改任意一位的会话 token 必被拒绝；合法 token 必通过
  - _需求: 7.2, 7.3, 12.2_

- [ ] 

- [x] 4.1 建立模拟器注册表 `lib/wulian/simulators/registry.ts`

  - 录入现有 4 个模拟器（id/title/subject/参数定义），关联知识点
  - 提供 `GET /api/wulian/simulators` 与 `getSimulator(id)`
  - _需求: 3.1, 3.6_
- [x] 4.2 定义模拟器 → MAIC interactive 场景适配协议

  - 实现 wulian 模拟器场景 payload 与 MAIC 交互场景渲染容器的稳定映射
  - 渲染失败降级占位逻辑
  - _需求: 3.2, 3.5, 3.6_
- [x] 4.3 迁移/包装现有 `Simulation.tsx` 为自包含场景组件

  - 保持 4 个模拟器实时调参能力，去除对旧 LessonRoom 的耦合
  - 暴露受控 `params` 接口供 Agent 动作设置
  - _需求: 3.3, 3.4_
- [x] 4.4 模拟器场景适配属性测试

  - PBT：任意合法 `SimulatorDefinition` → 生成的 interactive 场景 payload 可被适配协议解析回等价配置
  - _需求: 3.2, 3.6_

- [ ] 

- [x] 5.1 升级上传/检索为按用户隔离

  - `POST /api/wulian/ingest` 写入 `users/<userId>/uploads|vectors`（访客写本地由前端处理，服务端按会话隔离）
  - 复用现有 chunk/embed/parse；保留关键词降级
  - _需求: 2.4, 6.3, 8.1, 12.1_
- [ ] 5.2 实现检索结果 → 生成参考上下文格式化

  - `formatRetrievalForGeneration`：按 course/mine/compare 汇总并编号化
  - compare 模式标注一致点/差异提示
  - _需求: 2.1, 2.2, 2.5, 2.6_
- [ ] 5.3 RAG 注入属性测试

  - PBT：编号化引用与 `citations` 一一对应；无命中时返回「一般教材」提示且不抛错
  - _需求: 2.3, 2.5, 2.6_

- [ ] 

- [ ] 6.1 实现 `lib/wulian/personalize/build-requirements.ts`

  - 将 `WulianPersonalizationInput` + 章节 + 科学家 persona → MAIC `UserRequirements`
  - 注入 RAG 参考语料、Agent 配置、模拟器约束（在指定知识点产出 interactive 场景）、中文与科学家口吻
  - _需求: 1.1, 1.2, 1.3, 3.2_
- [ ] 6.2 调研并接入生成流水线注入点（最小侵入）

  - 确认 `outline-generator` / `scene-generator` 接受参考语料与约束的入口；不足处用包装层补 prompt
  - 若必须扩展生成器参数，保持向后兼容、不影响 `/api/generate/*`
  - _需求: 1.1, 1.2, 11.2, 11.3_
- [ ] 6.3 实现 wulian 课堂生成 job（复用 MAIC job 基础设施）

  - `POST /api/wulian/classroom`：创建异步 job，返回 `jobId`/`pollUrl`
  - 复用 `classroom-job-store` / `classroom-job-runner`（或 wulian 包装），完成后持久化 `WulianClassroomInstance`
  - _需求: 1.4, 1.6, 4.5, 4.6_
- [ ] 6.4 实现生成进度轮询与单场景重试

  - `GET /api/wulian/classroom/[jobId]`：分步进度 + 百分比
  - 暴露单大纲项重试（复用 `retrySingleOutline`）
  - _需求: 1.5, 1.6_
- [ ] 6.5 实例查询接口

  - `GET /api/wulian/classroom?chapterId=&owner=me`、`GET /api/wulian/classroom/instance/[id]`（owner 校验）
  - _需求: 4.1, 4.2, 8.3_
- [ ] 6.6 生成适配层属性测试

  - PBT：任意合法个性化输入 → 构造的 `UserRequirements` 必含章节主题、所选模拟器约束、科学家配置（不丢字段）
  - _需求: 1.1, 1.2, 3.2_

- [ ] 

- [ ] 7.1 实现 wulian agents → MAIC Agent 配置映射

  - 科学家(teacher) + 小麦(assistant) + 小恒(classmate) 映射为 MAIC Agent
  - _需求: 1.7, 10.1_
- [ ] 7.2 重写 `POST /api/wulian/chat` 走 `lib/orchestration`

  - SSE 流式产出 speech + 白板动作；保留 `WulianStreamEvent` 形态（或前端适配 MAIC 事件）
  - RAG 注入、`resolveModelFromHeaders`、心跳保活、MISSING_API_KEY 处理
  - 携带 `classroomId` 上下文
  - _需求: 1.7, 2.3, 12.3, 12.5_
- [ ] 7.3 移除/废弃旧 `decideAgentSequence` 状态机

  - 删除或标注弃用 `lib/wulian/agents/orchestrator.ts` 旧逻辑，确保无引用残留
  - _需求: 1.7, 11.5_
- [ ] 7.4 讨论事件协议属性测试

  - PBT：MAIC 编排事件 → `WulianStreamEvent` 适配映射可逆/字段完整（speaker/speech/whiteboard）
  - _需求: 1.7, 6.6_

- [ ] 

- [ ] 8.1 搭建 wulian 播放器外壳 `app/wulian/components/ClassroomPlayer.tsx`

  - 两栏布局（主区 + 右侧控制面板），复用 MAIC `Stage`/`SlideRenderer`/`scene-renderers`，**隐藏左侧缩略图列**
  - 以组合/包装方式接入，不破坏 `/classroom/[id]`
  - _需求: 5.1, 5.2, 11.3_
- [ ] 8.2 实现视频式进度条 `VideoProgressBar`

  - 播放/暂停、上一/下一场景、拖动跳转、倍速；驱动 `lib/playback/engine`
  - 场景时长估算（语音/动作时长）
  - _需求: 5.3, 5.5, 5.6_
- [ ] 8.3 实现字幕叠层 `SubtitleOverlay`

  - 订阅引擎 `onTextDelta`/`onSpeechStart`/`onSpeakerChange`，主画面底部滚动字幕 + 发言者标识
  - _需求: 5.4, 6.6_
- [ ] 8.4 进度恢复与响应式布局

  - 重新进入恢复 `PlaybackSnapshot`；窄视口主区/面板可堆叠折叠
  - _需求: 5.7, 5.8_

- [ ] 

- [ ] 9.1 实现控制面板容器与三 Tab `ControlPanel.tsx`

  - 资料 / 提示词 / 对话预览 切换
  - _需求: 6.1_
- [ ] 9.2 资料分区

  - 内置资料（只读）+ 我的上传（查看/上传/删除）+ 资料模式切换
  - 接 `POST /api/wulian/ingest`，显示切块数/语义检索标记
  - _需求: 6.2, 6.3_
- [ ] 9.3 提示词分区

  - 预设快捷提示词 + 自定义输入，发送触发讨论/局部重讲
  - _需求: 6.4_
- [ ] 9.4 对话预览分区

  - 实时转写流（老师/同学/学生）+ 滚动回看 + 输入框发送/停止
  - 消费 `/api/wulian/chat` SSE，更新字幕与预览
  - _需求: 6.5, 6.6, 6.7_

- [ ] 

- [ ] 10.1 实现 InitGate 判定逻辑

  - 登录态查服务端实例；访客查本地（IndexedDB/Dexie）
  - 命中 → 播放器；未命中 → 向导
  - _需求: 4.1, 4.2, 4.3, 4.7_
- [ ] 10.2 实现多步定制向导 UI

  - 学生情况 / 资料模式 / 模拟器选择 / 私有上传 / 确认
  - _需求: 4.4_
- [ ] 10.3 接入生成与进度页

  - 提交 `POST /api/wulian/classroom`，轮询进度，完成跳转播放器
  - 访客实例存本地，登录态存服务端
  - _需求: 4.5, 4.6, 4.7_
- [ ] 10.4 改造 `app/wulian/lesson/[id]/page.tsx` 外壳挂载 InitGate + Player

  - 服务端外壳传章节/科学家数据；客户端按 InitGate 分流
  - _需求: 4.1, 5.1_

- [ ] 

- [ ] 11.1 实现画像读写 API `GET/PUT /api/wulian/profile`

  - 按用户隔离存储，访客存本地
  - _需求: 9.1, 9.3, 8.1_
- [ ] 11.2 画像作为定制基线接入向导

  - 新建课堂默认采用当前画像，允许本次覆盖
  - _需求: 9.2, 9.4_

- [ ] 

- [ ] 12.1 实现迁移流程
  - 登录后将本地课堂实例/上传迁移到账号，冲突以服务端为准并提示
  - _需求: 8.5_

- [ ] 

- [ ] 13.1 白板动作叠加在 PPT

  - 复用 MAIC 动作引擎，在讨论/讲解时叠加公式/图形/高亮/laser
  - _需求: 10.1_
- [ ] 13.2 可选 TTS 开关（默认关闭）

  - 科学家音色朗读 + 字幕同步；关闭时纯字幕，不阻塞主流程
  - _需求: 10.2, 10.4_
- [ ] 13.3 深度交互模式：科学家操作模拟器

  - Agent 动作设置模拟器参数/高亮/提示
  - _需求: 3.4, 10.3, 10.4_

- [ ] 

- [ ] 14.1 端到端关键流程联调

  - 首次进入→定制→生成→播放→讨论；二次进入恢复进度
  - _需求: 4.x, 5.x, 6.x, 1.x_
- [ ] 14.2 兼容性回归

  - 验证 `/`、`/classroom/[id]`、`/api/chat`、`/api/generate/*` 行为不变；运行现有测试与构建
  - _需求: 11.1, 11.2, 11.4, 11.5_
- [ ] 14.3 安全校验

  - 上传类型/大小/SSRF；越权访问拒绝；敏感值不回显；MISSING_API_KEY 提示
  - _需求: 12.1, 12.3, 12.4, 8.3_
- [ ] 14.4 更新 WULIAN-README 与 .env 示例

  - 记录新架构、登录/存储、TTS 开关、生成流程与排错
  - _需求: 11.1_

```

```
