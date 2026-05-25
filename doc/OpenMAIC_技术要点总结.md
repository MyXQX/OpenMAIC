# OpenMAIC 技术要点总结 & 对标学习路线

## 📚 目录
1. [核心技术栈速查表](#核心技术栈速查表)
2. [关键概念解释](#关键概念解释)
3. [学习路线图](#学习路线图)
4. [常用命令速查](#常用命令速查)
5. [代码模板](#代码模板)

---

## 核心技术栈速查表

### 前端技术栈

| 技术 | 版本 | 用途 | 学习优先级 |
|------|------|------|-----------|
| **React** | 19.2 | UI框架 | ⭐⭐⭐⭐⭐ |
| **Next.js** | 16.1 | 全栈框架 | ⭐⭐⭐⭐ |
| **TypeScript** | 5 | 类型安全 | ⭐⭐⭐⭐ |
| **Tailwind CSS** | 4 | 样式 | ⭐⭐⭐ |
| **Zustand** | 5.0 | 状态管理 | ⭐⭐⭐ |
| **Radix UI** | 1.1 | 组件库 | ⭐⭐ |
| **React Hook Form** | 最新 | 表单处理 | ⭐⭐⭐ |

### 后端/AI 技术栈

| 技术 | 版本 | 用途 | 学习优先级 |
|------|------|------|-----------|
| **LangGraph** | 1.1 | 多智能体编排 | ⭐⭐⭐⭐⭐ |
| **Vercel AI SDK** | 3.0 | AI模型统一接口 | ⭐⭐⭐⭐ |
| **LangChain** | 0.1 | 链式调用工具 | ⭐⭐⭐ |
| **ProseMirror** | 1.25 | 富文本编辑 | ⭐⭐⭐ |
| **Dexie** | 4.2 | 浏览器数据库 | ⭐⭐ |

### 部署/工具

| 工具 | 用途 |
|------|------|
| **Next.js** | 服务器 + API 路由 |
| **Vercel** | 云部署 |
| **Docker** | 容器化 |
| **pnpm** | 包管理 |
| **Vitest** | 单元测试 |
| **Playwright** | 端到端测试 |

---

## 关键概念解释

### 1. 🔄 LangGraph 编排系统

**是什么？**
一个框架，用于编排多个 AI 的协作。

**类比**：
```
导演在拍电影：
  • 导演决定谁该表演
  • 演员A说一句台词
  • 演演员B回应
  • 导演决定下一步
  • ... 直到完成
```

**代码示例**：
```typescript
import { StateGraph, START, END } from '@langchain/langgraph';

// 定义状态
const state = {
  messages: [],
  currentAgent: 'teacher',
  turnCount: 0
};

// 创建图
const graph = new StateGraph(state)
  .addNode('director', directorNode)      // 导演节点
  .addNode('teacher_generate', teacherNode) // 教师节点
  .addNode('peer_generate', peerNode)      // 同学节点
  .addEdge(START, 'director')              // 开始 → 导演
  .addConditionalEdges(
    'director',
    (state) => {
      // 导演决策：谁该说话？
      if (state.turnCount === 0) return 'teacher_generate';
      if (state.turnCount < 5) return 'peer_generate';
      return END;
    }
  )
  .addEdge('teacher_generate', 'director') // 教师 → 回到导演
  .addEdge('peer_generate', 'director');   // 同学 → 回到导演

const compiled = graph.compile();
```

**流程图**：
```
START
  ↓
director 节点 (决策)
  ├─ 条件 1: 第一轮 → teacher_generate
  ├─ 条件 2: 可以继续 → peer_generate
  └─ 条件 3: 轮数满 → END
  
各个 agent 节点执行 (生成文本、调用工具)
  ↓
返回给 director 节点 (循环)
```

### 2. 📡 流式处理 (Streaming)

**问题**：
AI 生成文本需要时间。不能让用户等待整个响应完成。

**解决**：
用"流式处理"，一个字一个字发送给用户。

**代码示例**：
```typescript
// 后端：发送流
export async function POST(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      // 获取 AI 响应（流）
      const response = await llm.generateStream({
        prompt: 'explain quantum physics'
      });
      
      for await (const chunk of response) {
        // 发送每个数据块
        controller.enqueue(
          JSON.stringify({ type: 'text', content: chunk }) + '\n'
        );
      }
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

// 前端：接收流
const response = await fetch('/api/chat', { method: 'POST' });
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  const lines = text.split('\n').filter(l => l);
  
  for (const line of lines) {
    const data = JSON.parse(line);
    console.log('收到:', data);  // 一个字一个字打印
    
    // 实时更新 UI
    setMessages(prev => [...prev, data]);
  }
}
```

**好处**：
- 用户不用等待整个响应
- 可以看到实时进度
- 感觉很"聪慧"

### 3. 🛠️ 工具调用 (Tool Use)

**概念**：
AI 不仅能说话，还能做事情（如"创建幻灯片"、"绘制图形"）。

**工作原理**：
```
AI 生成响应:
  "让我创建一个幻灯片..."
  [工具调用开始]
  Tool: create_slide
  Parameters: {
    title: "量子物理基础",
    content: "波函数..."
  }
  [工具调用结束]
  
前端收到此消息，执行对应的工具（创建幻灯片）
```

**代码示例**：
```typescript
// 定义工具
const tools = [
  {
    name: 'create_slide',
    description: '创建幻灯片',
    execute: async (params) => {
      // 后端执行：创建幻灯片
      const slide = await createSlide({
        title: params.title,
        content: params.content
      });
      return { success: true, slideId: slide.id };
    }
  }
];

// AI 生成时自动选择工具
const response = await llm.generateWithTools({
  prompt: 'explain the theory and show it on a slide',
  tools: tools,
  onToolCall: async (toolName, params) => {
    // AI 决定调用工具时
    const tool = tools.find(t => t.name === toolName);
    const result = await tool.execute(params);
    return result;
  }
});
```

### 4. 🎬 SSE (Server-Sent Events)

**是什么？**
一种让服务器主动发送数据给客户端的技术。

**对比**：
```
传统 HTTP:
  客户端 → 服务器（请求）
  客户端 ← 服务器（一次性响应）
  
SSE:
  客户端 → 服务器（建立连接）
  客户端 ← 服务器（持续发送数据）
  客户端 ← 服务器（...）
  连接断开
```

**代码示例**：
```typescript
// 后端
export async function POST(request: Request) {
  return new Response(
    new ReadableStream({
      async start(controller) {
        // 发送多条消息
        controller.enqueue('data: {"msg":"开始生成"}\n\n');
        await sleep(1000);
        
        controller.enqueue('data: {"msg":"处理输入"}\n\n');
        await sleep(1000);
        
        controller.enqueue('data: {"msg":"生成完成"}\n\n');
        controller.close();
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    }
  );
}

// 前端
const eventSource = new EventSource('/api/stream');
eventSource.onmessage = (event) => {
  console.log('收到:', JSON.parse(event.data));
};
eventSource.onerror = () => {
  eventSource.close();
};
```

### 5. 🗄️ Dexie (浏览器数据库)

**是什么？**
在浏览器中存储数据的库（不需要服务器）。

**用途**：
- 存储用户笔记
- 缓存下载的内容
- 保存用户偏好设置

**代码示例**：
```typescript
import Dexie from 'dexie';

// 定义数据库
const db = new Dexie('classroom');
db.version(1).stores({
  notes: '++id, classroomId, timestamp',
  cache: '++id, url'
});

// 添加数据
await db.notes.add({
  classroomId: 'xyz',
  content: '今天学到的概念...',
  timestamp: Date.now()
});

// 查询
const myNotes = await db.notes
  .where('classroomId')
  .equals('xyz')
  .toArray();

// 删除
await db.notes.where('id').equals(1).delete();
```

**优点**：
- 数据在用户浏览器中，隐私性强
- 不需要网络就能访问
- 可以离线工作

---

## 学习路线图

### 第一阶段：基础（1-2周）

**目标**：能运行项目，理解基本概念

- [ ] 学习 React Hooks（useState, useEffect, useContext）
- [ ] 学习 Next.js 基础（pages/api, routing）
- [ ] 学习 TypeScript 基础（types, interfaces）
- [ ] **任务**：本地运行 OpenMAIC，创建一个课堂
- [ ] **任务**：改变课堂的主题色

**推荐资源**：
- React 官方教程：https://react.dev/learn
- Next.js 官方教程：https://nextjs.org/learn
- TypeScript 官方：https://www.typescriptlang.org/docs/

### 第二阶段：LangGraph 和 AI（2-3周）

**目标**：理解多智能体编排

- [ ] 学习 LangChain 基础概念
- [ ] 学习 LangGraph 的状态机
- [ ] 读懂 `director-graph.ts` 文件
- [ ] 学习流式处理和工具调用
- [ ] **任务**：添加一个新的智能体角色
- [ ] **任务**：修改导演决策逻辑

**推荐资源**：
- LangChain 文档：https://python.langchain.com/docs/
- LangGraph 文档：https://langchain-ai.github.io/langgraph/
- OpenAI API 文档：https://platform.openai.com/docs/

### 第三阶段：高级定制（3-4周）

**目标**：能够定制功能和扩展

- [ ] 学习 API 路由的编写
- [ ] 学习数据库操作（SQL）
- [ ] 学习部署流程
- [ ] **任务**：添加一个新的工具（如"Web搜索"）
- [ ] **任务**：修改生成逻辑，支持自定义参数

**推荐资源**：
- SQL 入门：https://www.w3schools.com/sql/
- Next.js 高级：https://nextjs.org/docs
- 部署指南：https://vercel.com/docs

### 第四阶段：生产级应用（4+周）

**目标**：能够用于实际项目

- [ ] 学习认证和授权（Auth）
- [ ] 学习缓存和性能优化
- [ ] 学习错误处理和日志
- [ ] **任务**：完整部署到 Vercel/Docker
- [ ] **任务**：实现一个特定行业的定制版本

**推荐资源**：
- NextAuth.js：https://next-auth.js.org/
- Redis 缓存：https://redis.io/docs/
- Sentry 错误追踪：https://sentry.io/

---

## 常用命令速查

### 开发命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 启动生产服务器
pnpm start

# 运行测试
pnpm test

# 运行 E2E 测试
pnpm test:e2e

# 代码格式化
pnpm format

# 代码检查
pnpm lint
```

### Git 命令

```bash
# 克隆项目
git clone https://github.com/THU-MAIC/OpenMAIC.git

# 创建新分支
git checkout -b feature/my-feature

# 提交代码
git add .
git commit -m "feat: add my feature"

# 推送到远程
git push origin feature/my-feature

# 查看分支
git branch -a

# 合并分支
git merge feature/my-feature
```

### Docker 命令

```bash
# 构建镜像
docker build -t openmaic .

# 运行容器
docker run -p 3000:3000 openmaic

# 使用 docker-compose
docker compose up --build

# 查看日志
docker logs -f container_name

# 停止容器
docker stop container_name
```

### 环境相关

```bash
# 检查 Node 版本
node --version

# 检查 npm 版本
npm --version

# 全局安装 pnpm
npm install -g pnpm

# 安装特定版本依赖
pnpm add package-name@1.2.3
```

---

## 代码模板

### 模板 1：创建一个新的 API 路由

```typescript
// app/api/my-feature/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('MyFeature');

export async function POST(request: NextRequest) {
  try {
    // 1. 解析请求
    const { param1, param2 } = await request.json();
    
    log('Processing request', { param1, param2 });
    
    // 2. 验证输入
    if (!param1) {
      return NextResponse.json(
        { error: 'param1 is required' },
        { status: 400 }
      );
    }
    
    // 3. 执行业务逻辑
    const result = await doSomething(param1, param2);
    
    // 4. 返回结果
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    log.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 模板 2：创建一个流式 API

```typescript
// app/api/stream-feature/route.ts

export async function POST(request: NextRequest) {
  const { topic } = await request.json();
  
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          // 流式生成数据
          for (let i = 0; i < 10; i++) {
            controller.enqueue(
              JSON.stringify({
                type: 'progress',
                step: i + 1,
                total: 10
              }) + '\n'
            );
            
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          controller.enqueue(
            JSON.stringify({
              type: 'done',
              result: 'success'
            }) + '\n'
          );
          
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    }
  );
}
```

### 模板 3：React 组件使用 Streaming

```typescript
// components/MyComponent.tsx

import { useState, useEffect } from 'react';

export function MyComponent() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  async function handleStream() {
    setLoading(true);
    setMessages([]);
    
    try {
      const response = await fetch('/api/stream-feature', {
        method: 'POST',
        body: JSON.stringify({ topic: 'example' })
      });
      
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l);
        
        for (const line of lines) {
          const data = JSON.parse(line);
          setMessages(prev => [...prev, data]);
        }
      }
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div>
      <button onClick={handleStream} disabled={loading}>
        {loading ? '处理中...' : '开始'}
      </button>
      
      <div>
        {messages.map((msg, i) => (
          <div key={i}>{JSON.stringify(msg)}</div>
        ))}
      </div>
    </div>
  );
}
```

### 模板 4：自定义 LangGraph 编排

```typescript
// lib/orchestration/my-orchestration.ts

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';

// 定义状态
const MyState = Annotation.Root({
  messages: Annotation<any[]>,
  currentAgent: Annotation<string>,
  turnCount: Annotation<number>
});

// 定义节点
async function myDirector(state: typeof MyState.State) {
  // 决定下一步
  if (state.turnCount < 3) {
    return {
      ...state,
      currentAgent: state.turnCount % 2 === 0 ? 'agent_a' : 'agent_b'
    };
  }
  return state; // 结束
}

async function agentA(state: typeof MyState.State) {
  // Agent A 的逻辑
  return {
    ...state,
    messages: [...state.messages, { agent: 'A', text: 'response' }],
    turnCount: state.turnCount + 1
  };
}

// 构建图
const graph = new StateGraph(MyState)
  .addNode('director', myDirector)
  .addNode('agent_a', agentA)
  .addEdge(START, 'director')
  .addConditionalEdges('director', (state) => {
    if (state.turnCount >= 3) return END;
    return 'agent_a';
  })
  .addEdge('agent_a', 'director');

export const compiled = graph.compile();
```

### 模板 5：添加新工具到 Tool Registry

```typescript
// lib/orchestration/my-tools.ts

export const myTools = [
  {
    name: 'web_search',
    description: '搜索网络获取信息',
    parameters: {
      query: { type: 'string', description: '搜索关键词' },
      limit: { type: 'number', description: '结果数量' }
    },
    execute: async (params: any) => {
      // 调用搜索 API
      const results = await fetch(
        `https://api.search.example.com?q=${params.query}&limit=${params.limit}`
      ).then(r => r.json());
      
      return {
        success: true,
        results: results
      };
    }
  },
  
  {
    name: 'create_visualization',
    description: '创建数据可视化',
    parameters: {
      type: { type: 'string', enum: ['line', 'bar', 'pie'] },
      data: { type: 'array' }
    },
    execute: async (params: any) => {
      // 生成图表
      const chartId = `chart_${Date.now()}`;
      // ... 实现图表生成逻辑
      
      return {
        success: true,
        chartId: chartId,
        url: `/charts/${chartId}`
      };
    }
  }
];
```

---

## 扩展阅读

### 官方文档
- [Next.js 文档](https://nextjs.org/docs)
- [React 文档](https://react.dev)
- [LangChain 文档](https://js.langchain.com/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)

### 相关开源项目
- [Vercel AI SDK](https://github.com/vercel/ai)
- [LangChain.js](https://github.com/langchain-ai/langchainjs)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-python)

### 视频教程
- Next.js 完整教程（Vercel 官方）
- React 18 深度讲解
- LangGraph 快速入门

### 实战项目
1. **改造成多语言版本**
   - 添加支持 20+ 语言
   - 支持 RTL（阿拉伯语、希伯来语）

2. **添加学生管理系统**
   - 班级管理
   - 成绩追踪
   - 学习路径推荐

3. **集成知识库**
   - 向量数据库（Pinecone/Weaviate）
   - RAG（检索增强生成）
   - 语义搜索

4. **离线模式**
   - 下载课程到本地
   - 离线播放
   - 离线笔记同步

---

## 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `Cannot find module 'react'` | 依赖未安装 | `pnpm install` |
| `Port 3000 already in use` | 端口被占用 | `pnpm dev --port 3001` |
| `Invalid API key` | API 密钥错误 | 检查 `.env.local` 中的密钥 |
| `Cannot GET /classroom/xyz` | 课堂不存在 | 创建新课堂或检查 ID |
| `CORS error` | 跨域请求被阻止 | 检查 CORS 配置 |
| `Memory exceeded` | 内存不足 | 增加 Node 堆大小：`NODE_OPTIONS=--max-old-space-size=2048` |
| `Timeout` | 请求超时 | 增加超时时间或优化性能 |

---

**更新日期**：2026-05-24
**版本**：v0.2.1
**维护者**：OpenMAIC Community

