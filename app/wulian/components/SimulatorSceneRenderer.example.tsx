/**
 * SimulatorSceneRenderer 使用示例
 *
 * 演示如何在 MAIC 课堂场景中集成 Wulian 物理模拟器
 */

import { SimulatorSceneRenderer } from './SimulatorSceneRenderer';
import { wulianSimulatorToInteractiveContent } from '@/lib/wulian/simulators/scene-adapter';
import type { InteractiveContent } from '@/lib/types/stage';

// ----------------------------------------------------------------------------
// 示例 1：基础用法 - 在课堂场景中渲染模拟器
// ----------------------------------------------------------------------------

export function Example1_BasicUsage() {
  // 从 wulian 模拟器配置生成 MAIC InteractiveContent
  const content: InteractiveContent = wulianSimulatorToInteractiveContent({
    simulatorId: 'flux-loop-slider',
    initialParams: {
      B: 0.8,
      area: 1.5,
      angle: 30,
    },
    teachingHint: '观察磁通量如何随夹角变化',
    interactionGoal: '尝试调整夹角，观察感应电动势的变化规律',
  });

  return (
    <div>
      <h2>基础用法：电磁感应模拟器</h2>
      <SimulatorSceneRenderer content={content} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// 示例 2：Agent 控制模式 - 老师通过动作控制模拟器参数
// ----------------------------------------------------------------------------

export function Example2_AgentControl() {
  const [teacherControlledParams, setTeacherControlledParams] = useState({
    freq: 8.0, // 老师设置的光频率
    intensity: 0.7,
  });

  const content: InteractiveContent = wulianSimulatorToInteractiveContent({
    simulatorId: 'photoelectric',
    initialParams: {
      freq: 6.0,
      intensity: 0.5,
    },
    teachingHint: '现在让我们提高光的频率，看看会发生什么',
  });

  // 模拟老师通过 Agent 动作改变参数
  const handleTeacherAction = () => {
    setTeacherControlledParams({
      freq: 10.0, // 老师动作：提高频率到 10×10¹⁴ Hz
      intensity: 0.9,
    });
  };

  return (
    <div>
      <h2>Agent 控制模式：光电效应演示</h2>
      <SimulatorSceneRenderer
        content={content}
        controlledParams={teacherControlledParams}
        readonly={true} // 演示模式，学生不能交互
      />
      <button onClick={handleTeacherAction}>老师动作：提高光频率</button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 示例 3：学生交互模式 - 记录学生的探索行为
// ----------------------------------------------------------------------------

export function Example3_StudentInteraction() {
  const [interactionLog, setInteractionLog] = useState<string[]>([]);

  const content: InteractiveContent = wulianSimulatorToInteractiveContent({
    simulatorId: 'double-slit',
    initialParams: {
      lambda: 600,
      d: 0.2,
      L: 1.0,
    },
    interactionGoal: '调整波长和缝距，观察条纹间距的变化',
  });

  const handleParamsChange = (params: Record<string, number>) => {
    // 记录学生的交互行为（用于学习分析）
    const log = `学生调整参数: ${JSON.stringify(params)}`;
    setInteractionLog((prev) => [...prev, log]);
  };

  return (
    <div>
      <h2>学生交互模式：双缝干涉探索</h2>
      <SimulatorSceneRenderer
        content={content}
        onParamsChange={handleParamsChange}
        readonly={false} // 学生可以自由交互
      />
      <div style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
        <h4>交互日志：</h4>
        <ul>
          {interactionLog.map((log, i) => (
            <li key={i}>{log}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 示例 4：场景序列 - 在课堂中连续展示多个模拟器
// ----------------------------------------------------------------------------

export function Example4_SceneSequence() {
  const scenes = [
    {
      id: 'scene-1',
      content: wulianSimulatorToInteractiveContent({
        simulatorId: 'flux-loop-slider',
        initialParams: { B: 0.5, area: 1.0, angle: 0 },
        teachingHint: '首先，让我们理解磁通量的基本概念',
      }),
    },
    {
      id: 'scene-2',
      content: wulianSimulatorToInteractiveContent({
        simulatorId: 'photoelectric',
        initialParams: { freq: 6.0, intensity: 0.5 },
        teachingHint: '接下来，我们看看光电效应的实验现象',
      }),
    },
    {
      id: 'scene-3',
      content: wulianSimulatorToInteractiveContent({
        simulatorId: 'newton-block',
        initialParams: { angle: 30, mu: 0.1 },
        teachingHint: '最后，让我们分析一下力的平衡',
      }),
    },
  ];

  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const currentScene = scenes[currentSceneIndex];

  return (
    <div>
      <h2>场景序列：多模拟器课堂</h2>
      <div style={{ marginBottom: '16px' }}>
        场景 {currentSceneIndex + 1} / {scenes.length}
      </div>
      <SimulatorSceneRenderer content={currentScene.content} />
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setCurrentSceneIndex((i) => Math.max(0, i - 1))}
          disabled={currentSceneIndex === 0}
        >
          上一个
        </button>
        <button
          onClick={() => setCurrentSceneIndex((i) => Math.min(scenes.length - 1, i + 1))}
          disabled={currentSceneIndex === scenes.length - 1}
        >
          下一个
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 示例 5：错误处理 - 渲染失败时的降级 UI
// ----------------------------------------------------------------------------

export function Example5_ErrorHandling() {
  // 故意构造一个无效的 content（模拟渲染失败）
  const invalidContent: InteractiveContent = {
    type: 'interactive',
    url: '/wulian/simulator/non-existent-simulator?config=invalid',
  };

  return (
    <div>
      <h2>错误处理：降级 UI 演示</h2>
      <p>当模拟器不存在或配置无效时，会显示友好的错误提示：</p>
      <SimulatorSceneRenderer content={invalidContent} />
    </div>
  );
}

// NOTE: This file is for documentation/example purposes only
// Import useState from React if you want to run these examples
import { useState } from 'react';
