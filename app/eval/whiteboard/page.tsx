/**
 * app/eval/whiteboard/page.tsx
 * 
 * 文件作用：
 * 评估用白板页面。这是一个测试/评估页面，用于测试白板渲染和元素绘制功能。
 * 它提供了一个受控的测试环境，允许通过 window.__setElements() 动态设置要渲染的元素。
 * 
 * 运行机理：
 * 1. 页面初始化：
 *    - 创建合成的 stage 和 scene 供测试使用
 *    - EVAL_STAGE_ID 和 EVAL_SCENE_ID 用于区分评估环境
 *    - 设置 1000x563 的固定画布尺寸
 * 2. 元素管理：
 *    - 通过 useStageStore 初始化舞台存储
 *    - 向 window.__setElements 暴露 setter 方法
 *    - 允许外部代码（如 Playwright 测试）动态设置要渲染的元素
 * 3. 渲染准备：
 *    - 在 queueMicrotask 中设置 ready 状态
 *    - 避免级联渲染警告
 * 4. 元素渲染：
 *    - 遍历 elements 数组
 *    - 为每个元素创建 ScreenElement 组件
 * 5. 测试接口：
 *    - window.__setElements：设置要测试的元素数组
 *    - window.__evalReady：信号显示评估页面已就绪
 * 
 * 与其他代码的关联：
 * - useStageStore (lib/store/stage)：管理舞台状态
 * - ScreenElement (components/slide-renderer/Editor/ScreenElement)：渲染单个元素
 * - SceneProvider (lib/contexts/scene-context)：提供场景上下文
 * - PPTElement (lib/types/slides)：元素数据结构
 * - E2E测试框架（Playwright）：通过 window.__setElements 调用此页面
 */

'use client';

import { useEffect, useState } from 'react';
import { ScreenElement } from '@/components/slide-renderer/Editor/ScreenElement';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { useStageStore } from '@/lib/store/stage';
import type { PPTElement } from '@/lib/types/slides';

const EVAL_STAGE_ID = '__eval_stage__';
const EVAL_SCENE_ID = '__eval_scene__';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 563;

function WhiteboardCanvas() {
  const [elements, setElements] = useState<PPTElement[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Bootstrap store with a synthetic stage + scene
    const store = useStageStore.getState();
    store.setStage({
      id: EVAL_STAGE_ID,
      name: 'eval',
      createdAt: 0,
      updatedAt: 0,
    });
    store.setScenes([
      {
        id: EVAL_SCENE_ID,
        stageId: EVAL_STAGE_ID,
        type: 'slide',
        title: 'eval',
        order: 0,
        content: {
          type: 'slide',
          canvas: {
            id: EVAL_SCENE_ID,
            viewportSize: CANVAS_WIDTH,
            viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
            theme: {
              backgroundColor: '#ffffff',
              themeColors: ['#5b9bd5'],
              fontColor: '#333333',
              fontName: 'Microsoft YaHei',
            },
            elements: [],
          },
        },
      },
    ]);
    store.setCurrentSceneId(EVAL_SCENE_ID);

    // Expose setter for Playwright
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__setElements = (incoming: PPTElement[]) => {
      setElements(incoming);
      // Also update the store so SceneProvider/ScreenElement reads the theme
      useStageStore.getState().updateScene(EVAL_SCENE_ID, {
        content: {
          type: 'slide',
          canvas: {
            id: EVAL_SCENE_ID,
            viewportSize: CANVAS_WIDTH,
            viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
            theme: {
              backgroundColor: '#ffffff',
              themeColors: ['#5b9bd5'],
              fontColor: '#333333',
              fontName: 'Microsoft YaHei',
            },
            elements: incoming,
          },
        },
      });
    };

    // Signal readiness
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__evalReady = true;
    // Defer setReady to avoid cascading render warning
    queueMicrotask(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SceneProvider>
      <div
        style={{
          position: 'relative',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          backgroundColor: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {elements.map((element, index) => (
          <ScreenElement key={element.id} elementInfo={element} elementIndex={index} />
        ))}
      </div>
    </SceneProvider>
  );
}

export default function EvalWhiteboardPage() {
  return <WhiteboardCanvas />;
}
