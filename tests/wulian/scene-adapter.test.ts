import { describe, it, expect } from 'vitest';
import type { InteractiveContent } from '@/lib/types/stage';
import {
  wulianSimulatorToInteractiveContent,
  interactiveContentToWulianSimulator,
  createSimulatorFallback,
  isWulianSimulatorScene,
  createDefaultSimulatorScene,
  type WulianSimulatorSceneConfig,
} from '@/lib/wulian/simulators/scene-adapter';

// ----------------------------------------------------------------------------
// 模拟器 → MAIC InteractiveContent 适配（需求 3.2 / 3.6）
// ----------------------------------------------------------------------------

describe('Wulian 模拟器 → MAIC InteractiveContent 适配', () => {
  it('合法配置转换为 InteractiveContent（url + widgetType + widgetConfig）', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'flux-loop-slider',
      initialParams: { B: 0.8, area: 1.2, angle: 45 },
      teachingHint: '观察磁通量变化',
      interactionGoal: '调整参数验证法拉第定律',
    };

    const content = wulianSimulatorToInteractiveContent(config);

    expect(content.type).toBe('interactive');
    expect(content.url).toMatch(/^\/wulian\/simulator\/flux-loop-slider\?config=/);
    expect(content.widgetType).toBe('wulian-simulator');
    expect(content.widgetConfig).toEqual(config);
  });

  it('url 携带 base64url 编码的配置参数（不含填充，URL 安全）', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'photoelectric',
      initialParams: { freq: 8.0, intensity: 0.7 },
    };

    const content = wulianSimulatorToInteractiveContent(config);
    const url = new URL(content.url, 'https://dummy.com');
    const encodedConfig = url.searchParams.get('config');

    expect(encodedConfig).toBeTruthy();
    expect(encodedConfig).not.toContain('+'); // base64url 不含 +
    expect(encodedConfig).not.toContain('/'); // base64url 不含 /
    expect(encodedConfig).not.toContain('='); // 无填充

    // 能解码回原配置
    const decoded = JSON.parse(Buffer.from(encodedConfig!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'));
    expect(decoded).toEqual(config);
  });

  it('未知模拟器 ID 抛错', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'does-not-exist',
      initialParams: {},
    };

    expect(() => wulianSimulatorToInteractiveContent(config)).toThrow('Unknown simulator');
  });

  it('参数超出范围时抛错', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'double-slit',
      initialParams: { lambda: 999, d: 0.2, L: 1.0 }, // lambda 超出 [380, 780]
    };

    expect(() => wulianSimulatorToInteractiveContent(config)).toThrow('Invalid simulator params');
  });

  it('可选参数缺失时使用默认值（不抛错）', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'newton-block',
      initialParams: { angle: 30 }, // 缺 mu，应用默认 0.1
    };

    // 不抛错，能正常转换
    const content = wulianSimulatorToInteractiveContent(config);
    expect(content.url).toMatch(/newton-block/);
  });
});

// ----------------------------------------------------------------------------
// MAIC InteractiveContent → Wulian 模拟器还原（需求 3.2）
// ----------------------------------------------------------------------------

describe('MAIC InteractiveContent → Wulian 模拟器配置还原', () => {
  it('从 widgetConfig 还原（优先路径）', () => {
    const originalConfig: WulianSimulatorSceneConfig = {
      simulatorId: 'flux-loop-slider',
      initialParams: { B: 1.0, area: 1.5, angle: 0 },
      teachingHint: 'test hint',
    };

    const content: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/flux-loop-slider?config=dummy',
      widgetType: 'wulian-simulator' as never,
      widgetConfig: originalConfig as never,
    };

    const restored = interactiveContentToWulianSimulator(content);
    expect(restored).toEqual(originalConfig);
  });

  it('从 url query 参数还原（兼容路径）', () => {
    const originalConfig: WulianSimulatorSceneConfig = {
      simulatorId: 'photoelectric',
      initialParams: { freq: 6.0, intensity: 0.5 },
    };

    const content = wulianSimulatorToInteractiveContent(originalConfig);
    // 清除 widgetConfig，模拟旧数据
    delete content.widgetConfig;

    const restored = interactiveContentToWulianSimulator(content);
    expect(restored).toEqual(originalConfig);
  });

  it('非 wulian 模拟器场景返回 null', () => {
    const genericInteractive: InteractiveContent = {
      type: 'interactive',
      url: 'https://phet.colorado.edu/sims/html/wave-interference/latest/wave-interference_en.html',
    };

    expect(interactiveContentToWulianSimulator(genericInteractive)).toBeNull();
  });

  it('url 损坏（非法 base64url）返回 null', () => {
    const brokenContent: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/photoelectric?config=!!!invalid!!!',
    };

    expect(interactiveContentToWulianSimulator(brokenContent)).toBeNull();
  });

  it('url 缺 config 参数返回 null', () => {
    const noConfigContent: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/photoelectric',
    };

    expect(interactiveContentToWulianSimulator(noConfigContent)).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// 渲染失败降级逻辑（需求 3.5）
// ----------------------------------------------------------------------------

describe('渲染失败降级占位（需求 3.5）', () => {
  it('无法解析配置 → render_error 占位', () => {
    const brokenContent: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/photoelectric?config=broken',
    };

    const fallback = createSimulatorFallback(brokenContent);
    expect(fallback.reason).toBe('render_error');
    expect(fallback.message).toContain('配置损坏');
    expect(fallback.suggestedAction).toBeTruthy();
  });

  it('模拟器不存在 → not_found 占位', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'removed-simulator',
      initialParams: {},
    };
    const content: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/removed-simulator',
      widgetType: 'wulian-simulator' as never,
      widgetConfig: config as never,
    };

    const fallback = createSimulatorFallback(content);
    expect(fallback.reason).toBe('not_found');
    expect(fallback.simulatorId).toBe('removed-simulator');
    expect(fallback.message).toContain('移除或未安装');
  });

  it('参数非法 → invalid_params 占位', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'double-slit',
      initialParams: { lambda: 999, d: 0.2, L: 1.0 }, // lambda 超范围
    };
    const content: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/double-slit',
      widgetType: 'wulian-simulator' as never,
      widgetConfig: config as never,
    };

    const fallback = createSimulatorFallback(content);
    expect(fallback.reason).toBe('invalid_params');
    expect(fallback.message).toContain('参数校验失败');
  });

  it('运行时错误 → render_error 占位（带 error.message）', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'flux-loop-slider',
      initialParams: { B: 0.5, area: 1.0, angle: 0 },
    };
    const content = wulianSimulatorToInteractiveContent(config);

    const runtimeError = new Error('React component crashed');
    const fallback = createSimulatorFallback(content, runtimeError);

    expect(fallback.reason).toBe('render_error');
    expect(fallback.message).toBe('React component crashed');
    expect(fallback.simulatorId).toBe('flux-loop-slider');
  });
});

// ----------------------------------------------------------------------------
// 辅助工具
// ----------------------------------------------------------------------------

describe('辅助工具', () => {
  it('isWulianSimulatorScene 识别 wulian 模拟器场景', () => {
    const wulianContent: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/photoelectric?config=xxx',
      widgetType: 'wulian-simulator' as never,
    };
    expect(isWulianSimulatorScene(wulianContent)).toBe(true);

    const wulianByUrl: InteractiveContent = {
      type: 'interactive',
      url: '/wulian/simulator/newton-block?config=yyy',
    };
    expect(isWulianSimulatorScene(wulianByUrl)).toBe(true);

    const genericContent: InteractiveContent = {
      type: 'interactive',
      url: 'https://example.com/generic-sim',
    };
    expect(isWulianSimulatorScene(genericContent)).toBe(false);
  });

  it('createDefaultSimulatorScene 生成默认配置（使用默认参数）', () => {
    const defaultConfig = createDefaultSimulatorScene('flux-loop-slider');

    expect(defaultConfig.simulatorId).toBe('flux-loop-slider');
    expect(defaultConfig.initialParams).toEqual({ B: 0.5, area: 1.0, angle: 0 });
    expect(defaultConfig.teachingHint).toBeTruthy();
    expect(defaultConfig.interactionGoal).toBeTruthy();
  });

  it('createDefaultSimulatorScene 未知模拟器抛错', () => {
    expect(() => createDefaultSimulatorScene('unknown')).toThrow('Unknown simulator');
  });
});

// ----------------------------------------------------------------------------
// 往返一致性（端到端）
// ----------------------------------------------------------------------------

describe('往返一致性（适配协议完整性）', () => {
  it('任意合法配置 → InteractiveContent → 还原配置保持等价', () => {
    const configs: WulianSimulatorSceneConfig[] = [
      {
        simulatorId: 'flux-loop-slider',
        initialParams: { B: 0.8, area: 1.2, angle: 45 },
        teachingHint: 'hint1',
      },
      {
        simulatorId: 'photoelectric',
        initialParams: { freq: 8.0, intensity: 0.7 },
        interactionGoal: 'goal2',
      },
      {
        simulatorId: 'double-slit',
        initialParams: { lambda: 600, d: 0.2, L: 1.0 },
      },
      {
        simulatorId: 'newton-block',
        initialParams: { angle: 30, mu: 0.1 },
        teachingHint: 'hint4',
        interactionGoal: 'goal4',
      },
    ];

    for (const original of configs) {
      const content = wulianSimulatorToInteractiveContent(original);
      const restored = interactiveContentToWulianSimulator(content);
      expect(restored).toEqual(original);
    }
  });
});
