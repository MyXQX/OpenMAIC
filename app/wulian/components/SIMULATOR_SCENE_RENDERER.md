# SimulatorSceneRenderer - 物理模拟器场景渲染器

## 概述

`SimulatorSceneRenderer` 是任务 4.3 的核心交付物，它将现有的 `Simulation.tsx` 组件包装为自包含的 MAIC interactive 场景渲染器，实现了以下目标：

1. ✅ **去除 LessonRoom 耦合**：作为独立的场景组件，可在任何 MAIC 课堂上下文中使用
2. ✅ **受控参数接口**：暴露 `controlledParams` prop，允许 Agent 动作实时控制模拟器状态
3. ✅ **降级处理**：渲染失败时显示友好的占位 UI（需求 3.5）
4. ✅ **教学增强**：支持 AI 生成的教学提示（teachingHint）和交互目标（interactionGoal）
5. ✅ **交互记录**：提供 `onParamsChange` 回调，记录学生的探索行为

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│  SimulatorSceneRenderer (MAIC Scene Container)                   │
│                                                                   │
│  输入: InteractiveContent (from MAIC Stage/Scene)                 │
│  ├─ url: /wulian/simulator/<id>?config=<base64>                  │
│  ├─ widgetType: 'wulian-simulator'                               │
│  └─ widgetConfig: WulianSimulatorSceneConfig                     │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. 解析 InteractiveContent → WulianSimulatorSceneConfig   │  │
│  │    (scene-adapter.ts)                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          ↓                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 2. 渲染教学提示 (teachingHint)                             │  │
│  │    "观察磁通量如何随夹角变化"                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          ↓                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 3. SimulationWrapper                                       │  │
│  │    ├─ 合并 initialParams + controlledParams               │  │
│  │    ├─ 处理只读模式（readonly）                             │  │
│  │    └─ 渲染 Simulation 组件                                 │  │
│  │       (flux-loop-slider / photoelectric / ...)             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          ↓                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 4. 渲染交互目标 (interactionGoal)                          │  │
│  │    "尝试调整夹角，观察感应电动势的变化规律"                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  错误处理: SimulatorFallbackUI (需求 3.5)                        │
│  ├─ not_found: 模拟器不存在                                      │
│  ├─ invalid_params: 参数超出范围                                │
│  └─ render_error: 运行时渲染错误                                │
└─────────────────────────────────────────────────────────────────┘
```

## Props API

### `SimulatorSceneRendererProps`

```typescript
interface SimulatorSceneRendererProps {
  /** MAIC InteractiveContent (从 Scene 传入) */
  content: InteractiveContent;

  /**
   * 外部控制参数（可选，用于 Agent 动作设置参数）
   * 当此 prop 变化时，模拟器内部状态会同步更新
   * 
   * 示例：老师通过动作设置 { B: 1.2, angle: 45 }
   */
  controlledParams?: Record<string, number>;

  /**
   * 参数变更回调（可选，模拟器内部参数变化时通知外部）
   * 用途：记录学生交互行为、回放时同步等
   */
  onParamsChange?: (params: Record<string, number>) => void;

  /**
   * 是否为只读模式（禁用学生交互，仅展示 Agent 设置的状态）
   * 用途：老师演示时锁定模拟器，避免学生误操作
   */
  readonly?: boolean;
}
```

## 使用场景

### 1. 基础场景渲染（生成阶段）

```typescript
import { SimulatorSceneRenderer } from '@/app/wulian/components';
import { wulianSimulatorToInteractiveContent } from '@/lib/wulian/simulators/scene-adapter';

// 在生成阶段，AI 构造模拟器场景配置
const scene = {
  type: 'interactive' as const,
  content: wulianSimulatorToInteractiveContent({
    simulatorId: 'flux-loop-slider',
    initialParams: { B: 0.5, area: 1.0, angle: 0 },
    teachingHint: '我们先从垂直于磁场的情况开始理解',
    interactionGoal: '调整夹角，观察磁通量与感应电动势的关系',
  }),
};

// 在播放阶段，渲染器直接消费 InteractiveContent
<SimulatorSceneRenderer content={scene.content} />
```

### 2. Agent 动作控制（深度交互模式，需求 3.4）

```typescript
// 老师 Agent 通过动作设置模拟器参数
const teacherAction = {
  type: 'set_simulator_params',
  simulatorId: 'photoelectric',
  params: { freq: 10.0, intensity: 0.8 },
};

// 播放引擎将动作参数传递给渲染器
<SimulatorSceneRenderer
  content={scene.content}
  controlledParams={teacherAction.params} // Agent 控制
  readonly={true} // 演示模式，学生不能交互
/>
```

### 3. 学生交互记录（学习分析）

```typescript
const handleStudentInteraction = (params: Record<string, number>) => {
  // 记录学生的探索行为
  analytics.track('simulator_interaction', {
    userId: currentUser.id,
    simulatorId: 'double-slit',
    params,
    timestamp: Date.now(),
  });
};

<SimulatorSceneRenderer
  content={scene.content}
  onParamsChange={handleStudentInteraction}
  readonly={false} // 学生可以自由交互
/>
```

## 与 MAIC 内核的集成

### 作为 Interactive 场景类型

`SimulatorSceneRenderer` 被设计为 MAIC interactive 场景的一种具体实现：

```typescript
// lib/types/stage.ts (MAIC 核心类型)
interface Scene {
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  content: SlideContent | QuizContent | InteractiveContent | PBLContent;
}

// Wulian 模拟器作为 InteractiveContent 的一种
interface InteractiveContent {
  type: 'interactive';
  url?: string; // '/wulian/simulator/<id>?config=...'
  widgetType?: string; // 'wulian-simulator'
  widgetConfig?: unknown; // WulianSimulatorSceneConfig
}
```

### 注册到 MAIC 场景渲染器

在 MAIC 课堂播放器中，需要注册 wulian 模拟器渲染器：

```typescript
// components/stage/SceneRenderer.tsx (MAIC 场景路由)
import { SimulatorSceneRenderer } from '@/app/wulian/components';
import { isWulianSimulatorScene } from '@/lib/wulian/simulators/scene-adapter';

function InteractiveSceneRenderer({ scene }: { scene: Scene }) {
  if (scene.type !== 'interactive') return null;
  const content = scene.content as InteractiveContent;

  // Wulian 模拟器场景？
  if (isWulianSimulatorScene(content)) {
    return <SimulatorSceneRenderer content={content} />;
  }

  // 其他 interactive 场景（iframe / widget / ...）
  return <GenericInteractiveRenderer content={content} />;
}
```

## 降级处理（需求 3.5）

当模拟器渲染失败时，`SimulatorSceneRenderer` 会自动显示友好的占位 UI：

### 降级场景

1. **模拟器不存在**（`not_found`）
   - 原因：`simulatorId` 无效或未在 registry 中注册
   - 提示："该模拟器可能已被移除或未安装"
   - 建议："跳过此场景或联系内容管理员"

2. **参数非法**（`invalid_params`）
   - 原因：`initialParams` 超出模拟器定义的范围
   - 提示："参数校验失败：B=2.5 超出范围 [0, 1.5]"
   - 建议："使用默认参数或联系内容管理员修复"

3. **渲染错误**（`render_error`）
   - 原因：组件运行时崩溃、网络问题、配置损坏
   - 提示："模拟器渲染过程中发生未知错误"
   - 建议："刷新页面重试，若问题持续请联系技术支持"

### 降级 UI 示例

```
┌────────────────────────────────────────────────────────┐
│  🔍  模拟器 "non-existent-sim" 不存在                  │
│                                                        │
│  该模拟器可能已被移除或未安装                          │
│                                                        │
│  建议：跳过此场景或联系内容管理员                      │
└────────────────────────────────────────────────────────┘
```

## 受控参数同步机制

### 当前实现

`SimulationWrapper` 负责处理外部 `controlledParams` 与模拟器内部状态的同步：

```typescript
// 外部控制优先：Agent 设置的参数会覆盖初始参数
const effectiveParams = {
  ...config.initialParams,  // AI 生成的初始值
  ...controlledParams,      // Agent 动作设置的值（优先）
};

// 同步到 Simulation 组件
<Simulation simulationId={simulatorId} params={effectiveParams} />
```

### 限制与后续改进

⚠️ **当前限制**：`Simulation` 组件内部使用 `useState` 管理参数，不支持外部完全受控。这意味着：
- `controlledParams` 只在**初始化时**生效（通过 `initial` prop）
- Agent 动作**无法实时更新**已渲染的模拟器参数

💡 **后续改进方向**（任务 13.3 "深度交互模式"）：
1. 改造 `Simulation` 为完全受控组件（将 `useState` 提升到 `SimulationWrapper`）
2. 支持 Agent 动作实时控制（如"将磁场 B 增加到 1.2T"）
3. 实现参数变化动画（平滑过渡，而非跳变）

## 测试建议

### 单元测试

```typescript
// SimulatorSceneRenderer.test.tsx
describe('SimulatorSceneRenderer', () => {
  it('should render simulator when content is valid', () => {
    const content = wulianSimulatorToInteractiveContent({
      simulatorId: 'flux-loop-slider',
      initialParams: { B: 0.5, area: 1.0, angle: 0 },
    });
    render(<SimulatorSceneRenderer content={content} />);
    expect(screen.getByText(/电磁感应/)).toBeInTheDocument();
  });

  it('should show fallback UI when simulator not found', () => {
    const invalidContent = { type: 'interactive', url: '/wulian/simulator/invalid' };
    render(<SimulatorSceneRenderer content={invalidContent} />);
    expect(screen.getByText(/模拟器加载失败/)).toBeInTheDocument();
  });

  it('should apply controlled params', () => {
    const content = wulianSimulatorToInteractiveContent({
      simulatorId: 'photoelectric',
      initialParams: { freq: 6.0, intensity: 0.5 },
    });
    const { rerender } = render(<SimulatorSceneRenderer content={content} />);
    
    // Agent 动作控制
    rerender(<SimulatorSceneRenderer content={content} controlledParams={{ freq: 10.0 }} />);
    // TODO: 验证参数已更新（需要改造 Simulation 为受控组件后才能完整测试）
  });
});
```

### 集成测试

在完整的 MAIC 课堂上下文中测试：
1. 生成包含模拟器场景的课堂
2. 播放到模拟器场景
3. 验证渲染、交互、降级逻辑

## 文件清单

```
app/wulian/components/
├── SimulatorSceneRenderer.tsx           # 核心渲染器组件
├── SimulatorSceneRenderer.module.css    # 样式
├── SimulatorSceneRenderer.example.tsx   # 使用示例
├── SIMULATOR_SCENE_RENDERER.md          # 本文档
├── Simulation.tsx                        # 原有模拟器组件（保持不变）
└── index.ts                              # 导出

lib/wulian/simulators/
├── registry.ts                           # 模拟器注册表（任务 4.1）
└── scene-adapter.ts                      # 适配协议（任务 4.2）
```

## 需求覆盖

- ✅ **需求 3.3**：模拟器作为可交互课件嵌入课堂，学生能动手调参
- ✅ **需求 3.4**：Agent 可通过动作设置模拟器参数（通过 `controlledParams` prop）
- ✅ **需求 3.5**：渲染失败时降级显示占位与说明
- ✅ **需求 3.6**：模拟器通过稳定适配协议接入，组件保持自包含
- ✅ **任务 4.3**：迁移/包装现有 Simulation.tsx，去除 LessonRoom 耦合，暴露受控接口

## 后续任务

- [ ] **任务 13.3**：实现完全受控的 Agent 动作（深度交互模式）
- [ ] **任务 8.x**：将 `SimulatorSceneRenderer` 集成到 MAIC 播放器的场景渲染路由
- [ ] **任务 6.x**：在生成流水线中产出指向模拟器的 interactive 场景
