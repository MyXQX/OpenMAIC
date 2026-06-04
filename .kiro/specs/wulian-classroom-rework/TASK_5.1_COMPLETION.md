# 任务 5.1 完成报告：升级上传/检索为按用户隔离

## 任务概述

**任务ID**: 5.1 升级上传/检索为按用户隔离

**需求覆盖**: 2.4, 6.3, 8.1, 12.1

**任务描述**:
- `POST /api/wulian/ingest` 写入 `users/<userId>/uploads|vectors`（访客写本地由前端处理，服务端按会话隔离）
- 复用现有 chunk/embed/parse；保留关键词降级

## 实现内容

### 1. 修改上传API路由 (`app/api/wulian/ingest/route.ts`)

**主要改动**:
- 添加会话 cookie 解析，提取 `userId`
- 访客模式（未登录）返回 401 错误，提示前端处理本地存储
- 登录用户的文件保存到 `users/<userId>/uploads/` 目录
- 向量数据保存到 `users/<userId>/vectors/` 目录
- 调用新增的 `saveUserUploadCorpus` 函数而非全局 `saveUploadCorpus`
- 返回 `userId` 字段以便前端确认归属

**关键代码片段**:
```typescript
// 从会话 cookie 提取 userId
const cookieStore = await cookies();
const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
const userId = await getUserIdFromSessionToken(sessionToken);

// 访客模式处理
if (!userId) {
  return apiError('INVALID_REQUEST', 401, '访客模式下上传资料需在前端本地存储，服务端不持久化');
}

// 按用户隔离存储
await ensureUserDirs(userId);
const savedPath = path.join(userUploadsDir(userId), `${docId}${ext}`);
await saveUserUploadCorpus(userId, { docId, filename: file.name, chunks: chunkObjs });
```

### 2. 扩展RAG存储模块 (`lib/wulian/rag/store.ts`)

**新增函数**:

1. **`userUploadCorpusPath(userId, docId)`**: 构造用户隔离的向量文件路径
2. **`saveUserUploadCorpus(userId, corpus)`**: 按用户隔离保存上传语料
3. **`loadUserUploadCorpus(userId, docId)`**: 加载用户隔离的上传语料
4. **`loadUserUploadChunks(userId, docId)`**: 加载用户隔离的文档chunks（带缓存）
5. **`retrieveForUser(params)`**: 按用户隔离的综合检索函数

**向后兼容**:
- 保留原有的 `saveUploadCorpus`、`loadUploadCorpus`、`loadUploadChunks`、`retrieve` 函数
- 标记为"已弃用"但仍然可用，以兼容旧代码

**安全性**:
- 所有用户隔离函数都调用 `assertValidUserId` 校验，防止路径穿越攻击
- 内存缓存键带 `userId` 前缀（如 `upload:userId:docId`），避免跨用户污染

**关键代码片段**:
```typescript
function userUploadCorpusPath(userId: string, docId: string): string {
  assertValidUserId(userId);
  return path.join(userVectorsDir(userId), `${docId}.json`);
}

export async function saveUserUploadCorpus(userId: string, corpus: UploadCorpus): Promise<void> {
  assertValidUserId(userId);
  await writeJson(userUploadCorpusPath(userId, corpus.docId), corpus);
  memoryCache.set(`upload:${userId}:${corpus.docId}`, corpus.chunks);
}
```

### 3. 修复无关的语法错误

修复了 `app/wulian/components/SimulatorSceneRenderer.example.tsx` 中的 JSX 语法错误（`<key={i}>` → `<li key={i}>`），该错误阻止了 TypeScript 编译。

### 4. 新增集成测试 (`tests/wulian/ingest-user-isolation.test.ts`)

**测试覆盖**:
1. ✅ 应该将上传资料保存到用户隔离的目录
2. ✅ 应该隔离不同用户的上传资料
3. ✅ 应该使用内存缓存避免重复读取
4. ✅ 应该校验userId合法性，防止路径穿越

**测试结果**: 全部通过 (4/4)

## 验收标准检查

### 需求 2.4: RAG 注入生成与讨论 - 复用现有解析与降级
- ✅ 复用现有 `parseDocument`、`chunkText`、`embedTexts` 函数
- ✅ embedding 失败时降级到关键词检索（`if (embeddings)` 判断保留）

### 需求 6.3: 右侧控制面板 - 资料上传
- ✅ 服务端 API 支持按用户隔离存储上传资料
- ✅ 返回 `userId` 字段，便于前端确认归属

### 需求 8.1: 服务端按用户隔离存储
- ✅ 按 `userId` 隔离存储上传资料与向量
- ✅ 复用 MAIC `writeJsonFileAtomic`（原子写）避免半写文件
- ✅ 访客（未登录）被明确拒绝，提示前端处理本地存储

### 需求 12.1: 安全与健壮性 - 上传校验
- ✅ 保留现有文件类型与大小限制校验
- ✅ 通过 `assertValidUserId` 防止路径穿越攻击
- ✅ 明确的错误提示（访客模式 401，解析失败 422，等）

## 文件变更清单

### 修改的文件
1. `app/api/wulian/ingest/route.ts` - 上传API按用户隔离
2. `lib/wulian/rag/store.ts` - 新增用户隔离存储函数
3. `app/wulian/components/SimulatorSceneRenderer.example.tsx` - 修复语法错误

### 新增的文件
1. `tests/wulian/ingest-user-isolation.test.ts` - 用户隔离集成测试

## 向后兼容性

- ✅ 保留全局 `saveUploadCorpus`、`loadUploadCorpus`、`retrieve` 函数
- ✅ 标记为"已弃用"但仍可用
- ✅ 新代码应使用 `saveUserUploadCorpus`、`loadUserUploadCorpus`、`retrieveForUser`

## 已知限制

1. **访客模式处理**: 当前服务端直接拒绝访客上传（返回 401），要求前端使用 IndexedDB 本地存储。这与设计文档一致（需求 8.1 / design.md §3.6）。

2. **检索功能迁移**: 虽然新增了 `retrieveForUser` 函数，但现有调用 `retrieve` 的地方（如聊天API）尚未迁移。这些迁移将在后续任务中完成（如 task 7.2 重写 `/api/wulian/chat`）。

3. **前端适配**: 前端的 `UploadPanel.tsx` 需要适配新的响应格式（包含 `userId` 字段）和访客模式错误处理。这是前端任务的一部分。

## 后续任务建议

1. **Task 5.2**: 实现检索结果 → 生成参考上下文格式化（`formatRetrievalForGeneration`）
2. **Task 7.2**: 重写 `/api/wulian/chat` 走 `lib/orchestration`，使用 `retrieveForUser` 而非 `retrieve`
3. **前端适配**: 更新 `UploadPanel.tsx` 处理访客模式，使用 IndexedDB 本地存储

## 总结

任务 5.1 已成功完成。上传和检索功能已升级为按用户隔离，满足所有验收标准：

- ✅ 登录用户资料存储到 `users/<userId>/uploads|vectors`
- ✅ 访客模式明确拒绝，提示前端处理
- ✅ 复用现有 chunk/embed/parse，保留关键词降级
- ✅ 集成测试全部通过
- ✅ 向后兼容性良好
- ✅ 防止路径穿越等安全问题

实现符合设计文档（design.md §3.6）和需求文档（requirements.md §2, §6, §8, §12）的要求。
