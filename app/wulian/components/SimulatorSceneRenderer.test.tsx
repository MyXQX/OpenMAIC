/**
 * SimulatorSceneRenderer 单元测试
 *
 * 测试模拟器场景渲染器的核心功能：
 *   - 解析 InteractiveContent
 *   - 渲染模拟器组件
 *   - 降级 UI
 *   - 受控参数
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimulatorSceneRenderer } from './SimulatorSceneRenderer';
import { wulianSimulatorToInteractiveContent } from '@/lib/wulian/simulators/scene-adapter';
import type { InteractiveContent } from '@/lib/types/stage';

describe('SimulatorSceneRenderer', () => {
  describe('基础渲染', () => {
    it('should render flux-loop-slider simulator', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'flux-loop-slider',
        initialParams: { B: 0.5, area: 1.0, angle: 0 },
        teachingHint: '观察磁通量变化',
      });

      render(<SimulatorSceneRenderer content={content} />);

      // 验证教学提示存在
      expect(screen.getByText('观察磁通量变化')).toBeInTheDocument();
      // 验证模拟器标题存在
      expect(screen.getByText(/电磁感应/)).toBeInTheDocument();
    });

    it('should render photoelectric simulator', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'photoelectric',
        initialParams: { freq: 6.0, intensity: 0.5 },
      });

      render(<SimulatorSceneRenderer content={content} />);

      expect(screen.getByText(/光电效应/)).toBeInTheDocument();
    });

    it('should render teaching hint when provided', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'double-slit',
        initialParams: { lambda: 600, d: 0.2, L: 1.0 },
        teachingHint: '观察波长对条纹的影响',
      });

      render(<SimulatorSceneRenderer content={content} />);

      expect(screen.getByText('观察波长对条纹的影响')).toBeInTheDocument();
      expect(screen.getByText('💡')).toBeInTheDocument();
    });

    it('should render interaction goal when provided and not readonly', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'newton-block',
        initialParams: { angle: 30, mu: 0.1 },
        interactionGoal: '调整倾角观察加速度变化',
      });

      render(<SimulatorSceneRenderer content={content} />);

      expect(screen.getByText('调整倾角观察加速度变化')).toBeInTheDocument();
      expect(screen.getByText('🎯')).toBeInTheDocument();
    });

    it('should not render interaction goal in readonly mode', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'newton-block',
        initialParams: { angle: 30, mu: 0.1 },
        interactionGoal: '调整倾角观察加速度变化',
      });

      render(<SimulatorSceneRenderer content={content} readonly={true} />);

      expect(screen.queryByText('调整倾角观察加速度变化')).not.toBeInTheDocument();
      expect(screen.getByText(/演示模式/)).toBeInTheDocument();
    });
  });

  describe('降级处理', () => {
    it('should show fallback UI when simulator not found', () => {
      const invalidContent: InteractiveContent = {
        type: 'interactive',
        url: '/wulian/simulator/non-existent?config=e30=',
        widgetType: 'wulian-simulator' as never,
        widgetConfig: {
          simulatorId: 'non-existent',
          initialParams: {},
        } as never,
      };

      render(<SimulatorSceneRenderer content={invalidContent} />);

      expect(screen.getByText(/不存在/)).toBeInTheDocument();
      expect(screen.getByText(/已被移除或未安装/)).toBeInTheDocument();
      expect(screen.getByText('🔍')).toBeInTheDocument();
    });

    it('should show fallback UI when config is invalid', () => {
      const invalidContent: InteractiveContent = {
        type: 'interactive',
        url: '/wulian/simulator/flux-loop-slider?config=invalid-base64',
      };

      render(<SimulatorSceneRenderer content={invalidContent} />);

      expect(screen.getByText(/加载失败/)).toBeInTheDocument();
      expect(screen.getByText(/配置损坏/)).toBeInTheDocument();
    });

    it('should show fallback UI with invalid params', () => {
      // 构造参数超出范围的配置
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'flux-loop-slider',
        initialParams: { B: 999, area: 1.0, angle: 0 }, // B 超出范围 [0, 1.5]
      });

      render(<SimulatorSceneRenderer content={content} />);

      // 应该显示参数校验失败的提示
      expect(screen.getByText(/参数校验失败/)).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument();
    });
  });

  describe('受控参数', () => {
    it('should merge controlledParams with initialParams', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'photoelectric',
        initialParams: { freq: 6.0, intensity: 0.5 },
      });

      const controlledParams = { freq: 8.0 }; // Agent 控制频率

      render(
        <SimulatorSceneRenderer
          content={content}
          controlledParams={controlledParams}
        />
      );

      // NOTE: 由于 Simulation 组件内部使用 useState，
      // 这里只能验证组件成功渲染，无法直接断言参数值
      // 完整的受控能力需要在任务 13.3 改造 Simulation 后测试
      expect(screen.getByText(/光电效应/)).toBeInTheDocument();
    });

    it('should call onParamsChange callback', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'double-slit',
        initialParams: { lambda: 600, d: 0.2, L: 1.0 },
      });

      const onParamsChange = vi.fn();

      render(
        <SimulatorSceneRenderer
          content={content}
          onParamsChange={onParamsChange}
        />
      );

      // NOTE: 由于 Simulation 组件不暴露内部状态变更事件，
      // onParamsChange 回调当前无法被触发
      // 需要在任务 13.3 改造 Simulation 后实现完整的双向绑定
      expect(screen.getByText(/双缝干涉/)).toBeInTheDocument();
    });
  });

  describe('只读模式', () => {
    it('should show readonly hint when readonly=true', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'flux-loop-slider',
        initialParams: { B: 0.5, area: 1.0, angle: 0 },
      });

      render(<SimulatorSceneRenderer content={content} readonly={true} />);

      expect(screen.getByText(/演示模式/)).toBeInTheDocument();
      expect(screen.getByText(/老师正在操作模拟器/)).toBeInTheDocument();
      expect(screen.getByText('🔒')).toBeInTheDocument();
    });

    it('should apply readonly styles', () => {
      const content = wulianSimulatorToInteractiveContent({
        simulatorId: 'photoelectric',
        initialParams: { freq: 6.0, intensity: 0.5 },
      });

      const { container } = render(
        <SimulatorSceneRenderer content={content} readonly={true} />
      );

      // 验证只读样式类存在（禁用交互）
      const readonlyDiv = container.querySelector('.simulator-readonly');
      expect(readonlyDiv).toBeInTheDocument();
    });
  });
});
