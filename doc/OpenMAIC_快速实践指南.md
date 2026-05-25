# OpenMAIC 快速实践指南

## 🎯 目标
通过本指南，你能够：
- ✅ 在 30 分钟内本地运行 OpenMAIC
- ✅ 理解项目的运行原理
- ✅ 修改配置，定制自己的课堂
- ✅ 扩展功能，添加自己的智能体

---

## 第一部分：5分钟快速启动

### 步骤 1：安装前置工具
确保你的电脑上有：
- **Node.js** ≥ 20.9.0 (下载：https://nodejs.org/)
- **Git** (下载：https://git-scm.com/)
- **pnpm** (一个快速的包管理工具)

验证安装：
```bash
node --version    # 应该输出 v20.x.x 或更高
git --version     # 应该输出 git version ...
npm install -g pnpm  # 安装 pnpm
pnpm --version    # 应该输出 7.x.x 或更高
```

### 步骤 2：克隆项目
```bash
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC
```

### 步骤 3：获取 API 密钥
选择以下任意一个（推荐 Google Gemini，完全免费）：

#### 选项 A：Google Gemini（推荐 🎉）
1. 访问 https://aistudio.google.com/app/apikey
2. 点击 "Create API key"
3. 复制密钥

#### 选项 B：OpenAI
1. 访问 https://platform.openai.com/api/keys
2. 创建新密钥
3. 复制密钥

#### 选项 C：Anthropic Claude
1. 访问 https://console.anthropic.com/keys
2. 创建新密钥
3. 复制密钥

### 步骤 4：配置环境变量
```bash
# 创建配置文件
cp .env.example .env.local

# 编辑 .env.local (用你喜欢的编辑器打开)
# Windows: 用记事本打开
# Mac/Linux: 用 vim/nano 打开
```

**在 `.env.local` 中添加密钥**：

如果用 Google Gemini：
```env
GOOGLE_API_KEY=你复制的密钥
DEFAULT_MODEL=google:gemini-3-flash
```

如果用 OpenAI：
```env
OPENAI_API_KEY=sk-你复制的密钥
DEFAULT_MODEL=openai:gpt-4-mini
```

### 步骤 5：安装依赖并启动
```bash
# 安装依赖 (第一次可能需要 5-10 分钟)
pnpm install

# 启动开发服务器
pnpm dev
```

### 步骤 6：打开浏览器
访问 **http://localhost:3000**

🎉 **成功！** 你应该看到 OpenMAIC 的首页

---

## 第二部分：创建第一个课堂

### 方式 1：Web UI 创建（最简单）

1. 打开 http://localhost:3000
2. 点击 "Create Classroom" 或 "创建课堂"
3. 输入主题（中英文都可以）
   ```
   例如: "Python 基础入门"
   或: "Introduction to Quantum Physics"
   ```
4. 选择参数：
   - **课程时长**：15分钟 / 30分钟 / 60分钟
   - **难度**：初级 / 中级 / 高级
   - **互动模式**：标准 / 深度互动
5. 点击 "Generate"
6. 等待 2-5 分钟（AI 正在生成课程）
7. 课程生成完毕后，点击 "Enter Classroom" 进入

### 方式 2：API 创建（适合开发者）

打开你的终端或 Postman，发送以下请求：

```bash
curl -X POST http://localhost:3000/api/generate-classroom \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Machine Learning 基础",
    "duration": 30,
    "level": "beginner",
    "mode": "interactive"
  }'
```

你会得到：
```json
{
  "classroomId": "classroom_12345",
  "status": "generating",
  "progress": 0
}
```

然后你可以用这个 classroomId 进入课堂。

### 方式 3：编程生成（最灵活）

在你的代码中调用：

```javascript
// 在浏览器中执行这段 JavaScript
const response = await fetch('http://localhost:3000/api/generate-classroom', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    topic: 'Web 开发入门',
    duration: 30,
    level: 'beginner',
    mode: 'interactive'
  })
});

const data = await response.json();
console.log('课堂 ID:', data.classroomId);

// 重定向到课堂
window.location.href = `/classroom/${data.classroomId}`;
```

---

## 第三部分：深入理解架构

### 项目文件夹结构解析

```
OpenMAIC/
├── app/                          ← Next.js 应用
│   ├── api/                      ← 后端 API 路由
│   │   ├── generate-classroom/   ← 生成课堂的 API
│   │   ├── chat/                 ← 聊天和多智能体交互 API
│   │   ├── parse-pdf/            ← 解析 PDF
│   │   ├── quiz-grade/           ← 批改测验
│   │   └── ...
│   │
│   ├── classroom/                ← 课堂页面
│   │   └── [id]/page.tsx         ← 播放课堂的页面
│   │
│   └── layout.tsx                ← 主布局
│
├── components/                   ← React 组件
│   ├── ClassroomView.tsx         ← 课堂主组件
│   ├── AgentCard.tsx             ← 智能体卡片
│   ├── WhiteboardCanvas.tsx      ← 白板组件
│   ├── ChatPanel.tsx             ← 聊天面板
│   └── ...
│
├── lib/                          ← 核心逻辑库
│   ├── orchestration/            ← 多智能体编排 (⭐ 项目灵魂)
│   │   ├── director-graph.ts     ← LangGraph 状态机
│   │   ├── prompt-builder.ts     ← 构建提示词
│   │   ├── tool-schemas.ts       ← 定义工具集
│   │   └── registry/             ← 智能体注册表
│   │
│   ├── ai/                       ← AI 相关
│   │   ├── ai-sdk-adapter.ts    ← AI 模型适配器
│   │   └── providers/            ← 各个厂商的实现
│   │
│   ├── chat/                     ← 聊天逻辑
│   ├── generation/               ← 内容生成
│   ├── storage/                  ← 数据存储
│   ├── export/                   ← 导出功能 (PPTX/HTML)
│   └── ...
│
├── public/                       ← 静态资源
├── scripts/                      ← 工具脚本
├── tests/                        ← 测试文件
├── e2e/                          ← 端到端测试
│
├── .env.example                  ← 环境变量示例 (复制为 .env.local)
├── package.json                  ← 项目依赖配置
├── tsconfig.json                 ← TypeScript 配置
├── next.config.ts                ← Next.js 配置
└── README.md                     ← 项目说明
```

### 关键文件详解

#### 1. `lib/orchestration/director-graph.ts` - 多智能体的"大脑"

这是项目最核心的文件，控制如何安排多个 AI 轮流讲话。

**运作原理**（简化版）：

```typescript
// 第一轮：启动教师
Turn 1: 导演 → 教师讲解概念

// 第二轮：让同学提问
Turn 2: 导演 → 同学提出问题

// 第三轮：教师回答
Turn 3: 导演 → 教师详细解答

// ... 循环，直到达到轮数限制
```

**如何定制**：
找到这一行：
```typescript
const maxTurns = 6;  // 改这个数字控制对话轮数
```

#### 2. `lib/orchestration/registry/` - 智能体配置

这里定义了不同的 AI 角色（教师、同学等）。

**例子**：
```typescript
// lib/orchestration/registry/default-agents.ts

export const defaultAgents = [
  {
    id: 'teacher-01',
    name: '李老师',
    role: 'teacher',
    persona: '热情、耐心的数学教师',
    model: 'gpt-4-mini'  // 这个教师用 GPT-4 Mini
  },
  {
    id: 'peer-01',
    name: '小明',
    role: 'peer',
    persona: '好奇、爱提问的高中学生',
    model: 'gemini-3-flash'  // 这个同学用 Gemini
  }
];
```

**如何修改**：
- 改 `name` → 改角色名字
- 改 `persona` → 改角色人设
- 改 `model` → 改用哪个 AI 模型

#### 3. `components/ClassroomView.tsx` - 前端主界面

这是用户看到的课堂界面。

**关键部分**：
```typescript
export function ClassroomView({ classroomId }) {
  // 1. 加载课堂数据
  const classroom = useClassroom(classroomId);
  
  // 2. 启动 Director Graph
  const { messages, loading } = useDirectorGraph(classroomId);
  
  // 3. 渲染场景
  return (
    <div>
      <AgentCard agent={currentAgent} />          {/* 显示谁在讲话 */}
      <SceneRenderer scene={currentScene} />       {/* 显示内容 (幻灯片/测验) */}
      <ChatPanel messages={messages} />            {/* 显示聊天 */}
      <ExportMenu classroom={classroom} />         {/* 导出按钮 */}
    </div>
  );
}
```

#### 4. `app/api/generate-classroom/route.ts` - 课堂生成

这个 API 负责一键生成完整课堂。

**简化流程**：
```typescript
export async function POST(request: Request) {
  const { topic, duration, level } = await request.json();
  
  // 1. 用 AI 生成课程大纲
  const outline = await generateOutline(topic);
  
  // 2. 为每个环节生成场景
  const scenes = await generateScenes(outline);
  
  // 3. 创建智能体
  const agents = createAgents(outline);
  
  // 4. 保存到数据库
  const classroom = await db.save({
    topic,
    duration,
    outline,
    scenes,
    agents
  });
  
  // 5. 返回课堂 ID
  return { classroomId: classroom.id };
}
```

---

## 第四部分：修改和定制

### 任务 1：改变 AI 模型

**需求**：用 Claude 3.5 替代 GPT-4

**步骤**：

1. 编辑 `.env.local`：
```env
ANTHROPIC_API_KEY=sk-ant-你的密钥
DEFAULT_MODEL=anthropic:claude-3-5-sonnet
```

2. 重启服务器：
```bash
# 按 Ctrl+C 停止
# 然后重新运行
pnpm dev
```

### 任务 2：自定义智能体角色

**需求**：添加一个"专家"角色

**步骤**：

1. 打开 `lib/orchestration/registry/agents.ts`
2. 添加新角色：
```typescript
export const expertAgent = {
  id: 'expert-01',
  name: '张博士',
  role: 'expert',  // 新角色类型
  persona: '该领域的顶级专家，能解释复杂概念',
  model: 'gpt-4',  // 用高端模型
  instructions: `
    你是 ${topic} 领域的顶级专家。
    - 用严谨的学术语言
    - 引用最新的研究
    - 提供深入的洞见
  `
};
```

3. 在编排规则中加入：
```typescript
// lib/orchestration/director-graph.ts
const agents = [teacherAgent, expertAgent, peerAgent];
const maxTurns = 8;  // 更多轮数来容纳新角色
```

### 任务 3：添加新的工具（如"生成图片"）

**需求**：AI 可以调用工具生成图片

**步骤**：

1. 在 `lib/orchestration/tool-schemas.ts` 添加：
```typescript
export const tools = [
  // ... 现有工具
  {
    name: 'generate_image',
    description: '生成与主题相关的图片',
    parameters: {
      description: '图片描述（英文）',
      style: 'photograph | illustration | diagram'
    },
    execute: async (params) => {
      // 调用 DALL-E 或其他图片 API
      const image = await generateImage(params.description);
      return {
        type: 'image',
        url: image.url,
        description: params.description
      };
    }
  }
];
```

2. 在智能体的指令中告诉 AI 何时使用：
```typescript
agent.instructions += `
  当需要可视化时，调用 generate_image 工具。
  例如：讲解"DNA结构"时，调用工具生成图片。
`;
```

### 任务 4：改变课堂的外观（主题/颜色）

**需求**：改为深色主题

**步骤**：

1. 编辑 `app/globals.css`：
```css
/* 改变整体主题色 */
:root {
  --primary: #3b82f6;      /* 蓝色 → 改为你想要的颜色 */
  --secondary: #10b981;    /* 绿色 */
  --background: #ffffff;   /* 白色 → 改为 #1f2937 (深灰) */
  --text: #000000;         /* 黑色 → 改为 #ffffff (白) */
}
```

2. 或使用 Tailwind CSS 预设的主题：
```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',    // 改这里
        secondary: '#10b981'
      }
    }
  }
};
```

---

## 第五部分：常见问题排查

### ❌ 问题 1：运行 `pnpm dev` 后看到错误

**症状**：
```
Error: Cannot find module 'next'
```

**解决**：
```bash
# 删除依赖并重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm dev
```

### ❌ 问题 2：API 密钥无效

**症状**：
```
Error: Invalid API key
```

**解决**：
1. 验证 `.env.local` 中的密钥是否正确
2. 确保密钥没有多余的空格或换行符
3. 测试 API 密钥是否有效（用 curl 测试）
4. 检查账户是否有余额（OpenAI 账户需要有可用余额）

### ❌ 问题 3：页面加载缓慢

**症状**：
打开 http://localhost:3000 后长时间无反应

**解决**：
1. 检查网络连接
2. 确保防火墙没有阻止 localhost:3000
3. 查看浏览器开发者工具 (F12) → Console 标签页，看是否有错误
4. 重启服务器：Ctrl+C → pnpm dev

### ❌ 问题 4：生成课堂失败

**症状**：
```
Classroom generation failed
```

**解决**：
1. 查看服务器日志（终端输出）
2. 确认 API 密钥和模型配置正确
3. 试试用不同的主题（有些复杂主题可能失败）
4. 检查磁盘空间是否充足

---

## 第六部分：部署到云端

### 方案 A：Vercel（推荐，3分钟）

1. 访问 https://github.com/login 登录 GitHub
2. Fork OpenMAIC 项目
3. 访问 https://vercel.com/new
4. 选择你 Fork 的项目
5. 填入环境变量：
   ```
   GOOGLE_API_KEY=你的密钥
   DEFAULT_MODEL=google:gemini-3-flash
   ```
6. 点击 Deploy
7. 等待 3-5 分钟，自动部署完成
8. 获得公网 URL，全球可访问！

### 方案 B：Docker（推荐，5分钟）

```bash
# 1. 编辑环境变量
cp .env.example .env.local
# ... 编辑 .env.local

# 2. 启动 Docker
docker compose up --build

# 3. 访问
# http://localhost:3000
```

### 方案 C：传统服务器（Ubuntu/CentOS）

```bash
# 1. SSH 连接到你的服务器
ssh root@你的_IP

# 2. 安装依赖
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm

# 3. 克隆项目
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC

# 4. 配置
cp .env.example .env.local
# 编辑 .env.local 填入 API 密钥

# 5. 构建
pnpm install
pnpm build

# 6. 运行（需要进程管理工具，如 PM2）
npm install -g pm2
pm2 start "pnpm start" --name openmaic

# 7. 查看状态
pm2 status
```

---

## 第七部分：贡献代码

如果你想改进项目或修复 bug：

### 步骤 1：Fork 项目
```bash
# 在 GitHub 上点击 Fork 按钮
git clone https://github.com/你的用户名/OpenMAIC.git
cd OpenMAIC
```

### 步骤 2：创建功能分支
```bash
git checkout -b feature/your-feature-name
```

### 步骤 3：提交代码
```bash
git add .
git commit -m "Add: 你添加的功能描述"
git push origin feature/your-feature-name
```

### 步骤 4：提交 Pull Request
在 GitHub 上点击 "New Pull Request" 按钮

---

## 总结

你现在已经：
✅ 理解了 OpenMAIC 的整体架构
✅ 能够本地运行项目
✅ 知道如何修改配置和定制功能
✅ 知道如何部署到云端

**下一步建议**：
1. 尝试创建几个课堂，体验不同的主题
2. 修改一个智能体的名字和人设
3. 尝试部署到 Vercel
4. 阅读源代码，理解更多细节
5. 为项目贡献新功能或修复 bug

**有问题？**
- 📚 阅读 GitHub README
- 💬 加入 Discord 社区 (https://discord.gg/p8Pf2r3SaG)
- 🐛 提交 Issue (https://github.com/THU-MAIC/OpenMAIC/issues)

祝你探索愉快！🚀

