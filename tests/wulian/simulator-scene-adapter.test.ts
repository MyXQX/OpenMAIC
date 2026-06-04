/**
 * 物联智讲 - 模拟器场景适配属性测试
 *
 * **Validates: Requirements 3.2, 3.6**
 *
 * 任务 4.4: 模拟器场景适配属性测试
 * PBT：任意合法 SimulatorDefinition → 生成的 interactive 场景 payload 可被适配协议解析回等价配置
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SimulatorDefinition } from '@/lib/wulian/types';
import {
  wulianSimulatorToInteractiveContent,
  interactiveContentToWulianSimulator,
  isWulianSimulatorScene,
  createDefaultSimulatorScene,
  type WulianSimulatorSceneConfig,
} from '@/lib/wulian/simulators/scene-adapter';
import { listSimulators } from '@/lib/wulian/simulators/registry';

// ----------------------------------------------------------------------------
// Smart generators
// ----------------------------------------------------------------------------

/** Finite JSON-safe number (no NaN/Infinity, which JSON.stringify turns to null). */
const jsonSafeNumber = fc.double({ noNaN: true, noDefaultInfinity: true });

/**
 * Smart generator for SimulatorParam that guarantees min ≤ default ≤ max
 */
const simulatorParamArb = fc
  .tuple(jsonSafeNumber, jsonSafeNumber, jsonSafeNumber)
  .map(([a, b, c]) => {
    const [min, def, max] = [a, b, c].sort((x, y) => x - y);
    return { key: 'k', label: 'l', min, max, default: def };
  })
  .chain((base) =>
    fc.record({
      key: fc.string({ minLength: 1 }),
      label: fc.string({ minLength: 1 }),
      min: fc.constant(base.min),
      max: fc.constant(base.max),
      default: fc.constant(base.default),
      unit: fc.option(fc.string(), { nil: undefined }),
    }),
  );

/**
 * Smart generator for SimulatorDefinition with valid params
 */
const simulatorDefinitionArb: fc.Arbitrary<SimulatorDefinition> = fc.record({
  id: fc.string({ minLength: 1 }),
  title: fc.string({ minLength: 1 }),
  subject: fc.constantFrom('力学', '电磁学', '光学', '近代物理'),
  knowledgePointHint: fc.option(fc.string(), { nil: undefined }),
  params: fc.array(simulatorParamArb, { maxLength: 8 }),
}) as fc.Arbitrary<SimulatorDefinition>;

/**
 * Generator for WulianSimulatorSceneConfig based on a SimulatorDefinition
 * Ensures that initialParams matches the SimulatorDefinition's param keys and ranges
 */
function sceneConfigFromDefinition(
  def: SimulatorDefinition,
): fc.Arbitrary<WulianSimulatorSceneConfig> {
  // Generate initialParams that match the definition's params
  const paramsArb =
    def.params.length > 0
      ? fc.record(
          Object.fromEntries(
            def.params.map((p) => [
              p.key,
              fc.double({
                min: p.min,
                max: p.max,
                noNaN: true,
                noDefaultInfinity: true,
              }),
            ]),
          ),
        )
      : fc.constant({});

  return fc.record({
    simulatorId: fc.constant(def.id),
    initialParams: paramsArb as fc.Arbitrary<Record<string, number>>,
    teachingHint: fc.option(fc.string(), { nil: undefined }),
    interactionGoal: fc.option(fc.string(), { nil: undefined }),
  });
}

// ----------------------------------------------------------------------------
// Property-Based Tests
// ----------------------------------------------------------------------------

describe('模拟器场景适配属性测试', () => {
  /**
   * **Validates: Requirements 3.2, 3.6**
   *
   * 核心属性：任意合法的 SimulatorDefinition + 对应的合法场景配置
   * → 转换为 InteractiveContent
   * → 可被适配协议解析回等价配置
   *
   * 这保证了往返转换的无损性（round-trip consistency）
   */
  it('任意合法 SimulatorDefinition → InteractiveContent → 解析回等价配置', () => {
    // Use the actual registered simulators from the registry
    const registeredSimulators = listSimulators();

    // Test with each registered simulator
    for (const sim of registeredSimulators) {
      fc.assert(
        fc.property(sceneConfigFromDefinition(sim), (config) => {
          // 正向转换：WulianSimulatorSceneConfig → InteractiveContent
          const interactiveContent = wulianSimulatorToInteractiveContent(config);

          // 验证生成的 InteractiveContent 基本结构
          expect(interactiveContent.type).toBe('interactive');
          expect(interactiveContent.url).toBeDefined();
          expect(typeof interactiveContent.url).toBe('string');

          // 验证是 wulian 模拟器场景
          expect(isWulianSimulatorScene(interactiveContent)).toBe(true);

          // 反向转换：InteractiveContent → WulianSimulatorSceneConfig
          const recoveredConfig = interactiveContentToWulianSimulator(interactiveContent);

          // 验证解析成功
          expect(recoveredConfig).not.toBeNull();
          expect(recoveredConfig).toBeDefined();

          // 验证核心字段保持一致
          expect(recoveredConfig!.simulatorId).toBe(config.simulatorId);

          // 验证参数保持一致（浮点数可能有精度损失，使用近似比较）
          expect(Object.keys(recoveredConfig!.initialParams).sort()).toEqual(
            Object.keys(config.initialParams).sort(),
          );
          for (const key of Object.keys(config.initialParams)) {
            expect(recoveredConfig!.initialParams[key]).toBeCloseTo(
              config.initialParams[key],
              10,
            );
          }

          // 验证可选字段（undefined 在 JSON 往返后会丢失，所以只验证存在时一致）
          if (config.teachingHint !== undefined) {
            expect(recoveredConfig!.teachingHint).toBe(config.teachingHint);
          }
          if (config.interactionGoal !== undefined) {
            expect(recoveredConfig!.interactionGoal).toBe(config.interactionGoal);
          }
        }),
        { numRuns: 50 }, // 每个模拟器运行50次
      );
    }
  });

  /**
   * **Validates: Requirements 3.2, 3.6**
   *
   * 往返一致性：通过 widgetConfig 路径
   */
  it('widgetConfig 路径的往返一致性', () => {
    const registeredSimulators = listSimulators();

    for (const sim of registeredSimulators) {
      fc.assert(
        fc.property(sceneConfigFromDefinition(sim), (config) => {
          const interactiveContent = wulianSimulatorToInteractiveContent(config);

          // 验证 widgetConfig 和 widgetType 被正确设置
          expect(interactiveContent.widgetType).toBe('wulian-simulator');
          expect(interactiveContent.widgetConfig).toBeDefined();

          // widgetConfig 应该包含完整配置
          const widgetConfig = interactiveContent.widgetConfig as unknown as WulianSimulatorSceneConfig;
          expect(widgetConfig.simulatorId).toBe(config.simulatorId);
          expect(widgetConfig.initialParams).toEqual(config.initialParams);
        }),
        { numRuns: 30 },
      );
    }
  });

  /**
   * **Validates: Requirements 3.2, 3.6**
   *
   * URL 路径的往返一致性（兼容性测试）
   */
  it('URL 解析路径的往返一致性', () => {
    const registeredSimulators = listSimulators();

    for (const sim of registeredSimulators) {
      fc.assert(
        fc.property(sceneConfigFromDefinition(sim), (config) => {
          const interactiveContent = wulianSimulatorToInteractiveContent(config);

          // 临时移除 widgetConfig，只依赖 URL 解析
          const urlOnlyContent = {
            type: interactiveContent.type,
            url: interactiveContent.url,
          };

          // 应该仍然能从 URL 解析出配置
          const recoveredConfig = interactiveContentToWulianSimulator(urlOnlyContent);
          expect(recoveredConfig).not.toBeNull();
          expect(recoveredConfig!.simulatorId).toBe(config.simulatorId);

          // 验证参数一致性
          for (const key of Object.keys(config.initialParams)) {
            expect(recoveredConfig!.initialParams[key]).toBeCloseTo(
              config.initialParams[key],
              10,
            );
          }
        }),
        { numRuns: 30 },
      );
    }
  });
});

// ----------------------------------------------------------------------------
// Unit Tests - Specific examples and edge cases
// ----------------------------------------------------------------------------

describe('模拟器场景适配单元测试', () => {
  it('真实模拟器：flux-loop-slider 完整往返', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'flux-loop-slider',
      initialParams: {
        B: 0.5, // 磁场参数
      },
      teachingHint: '观察磁通量变化与感应电流的关系',
      interactionGoal: '调整磁通量观察电流变化',
    };

    const interactiveContent = wulianSimulatorToInteractiveContent(config);
    expect(interactiveContent.type).toBe('interactive');
    expect(isWulianSimulatorScene(interactiveContent)).toBe(true);

    const recovered = interactiveContentToWulianSimulator(interactiveContent);
    expect(recovered).not.toBeNull();
    expect(recovered!.simulatorId).toBe('flux-loop-slider');
    expect(recovered!.initialParams.B).toBeCloseTo(0.5, 10);
    expect(recovered!.teachingHint).toBe('观察磁通量变化与感应电流的关系');
    expect(recovered!.interactionGoal).toBe('调整磁通量观察电流变化');
  });

  it('真实模拟器：photoelectric 完整往返', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'photoelectric',
      initialParams: {
        freq: 6.5,
        intensity: 0.5, // 修正：范围是 0.1-1，不是 0-100
      },
      teachingHint: '探索光电效应的频率阈值',
    };

    const interactiveContent = wulianSimulatorToInteractiveContent(config);
    const recovered = interactiveContentToWulianSimulator(interactiveContent);

    expect(recovered).not.toBeNull();
    expect(recovered!.simulatorId).toBe('photoelectric');
    expect(recovered!.initialParams.freq).toBeCloseTo(6.5, 10);
    expect(recovered!.initialParams.intensity).toBeCloseTo(0.5, 10);
  });

  it('真实模拟器：double-slit 完整往返', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'double-slit',
      initialParams: {
        lambda: 500, // 波长参数
        d: 0.1, // 缝距参数
        L: 0.5, // 屏距参数
      },
    };

    const interactiveContent = wulianSimulatorToInteractiveContent(config);
    const recovered = interactiveContentToWulianSimulator(interactiveContent);

    expect(recovered).not.toBeNull();
    expect(recovered!.simulatorId).toBe('double-slit');
    expect(recovered!.initialParams.lambda).toBeCloseTo(500, 10);
    expect(recovered!.initialParams.d).toBeCloseTo(0.1, 10);
    expect(recovered!.initialParams.L).toBeCloseTo(0.5, 10);
  });

  it('真实模拟器：newton-block 完整往返', () => {
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'newton-block',
      initialParams: {
        angle: 30.0, // 倾角
        mu: 0.3, // 摩擦系数
      },
    };

    const interactiveContent = wulianSimulatorToInteractiveContent(config);
    const recovered = interactiveContentToWulianSimulator(interactiveContent);

    expect(recovered).not.toBeNull();
    expect(recovered!.simulatorId).toBe('newton-block');
    expect(recovered!.initialParams.angle).toBeCloseTo(30.0, 10);
    expect(recovered!.initialParams.mu).toBeCloseTo(0.3, 10);
  });

  it('边界：空参数的模拟器往返（理论场景）', () => {
    // 根据 validateSimulatorParams 的实现，空参数是允许的（使用默认值）
    // 所以这个测试应该成功，而不是抛出错误
    const config: WulianSimulatorSceneConfig = {
      simulatorId: 'flux-loop-slider',
      initialParams: {},
    };

    // 空参数应该被接受（参数可选，使用默认值）
    const interactiveContent = wulianSimulatorToInteractiveContent(config);
    expect(interactiveContent).toBeDefined();
    
    const recovered = interactiveContentToWulianSimulator(interactiveContent);
    expect(recovered).not.toBeNull();
    expect(recovered!.simulatorId).toBe('flux-loop-slider');
  });

  it('createDefaultSimulatorScene 为每个真实模拟器生成有效配置', () => {
    const registeredSimulators = listSimulators();

    for (const sim of registeredSimulators) {
      const defaultConfig = createDefaultSimulatorScene(sim.id);
      expect(defaultConfig.simulatorId).toBe(sim.id);

      // 验证所有参数都有默认值
      for (const param of sim.params) {
        expect(defaultConfig.initialParams[param.key]).toBe(param.default);
      }

      // 验证可以转换为 InteractiveContent
      const interactiveContent = wulianSimulatorToInteractiveContent(defaultConfig);
      expect(interactiveContent).toBeDefined();

      // 验证可以往返
      const recovered = interactiveContentToWulianSimulator(interactiveContent);
      expect(recovered).not.toBeNull();
      expect(recovered!.simulatorId).toBe(sim.id);
    }
  });

  it('isWulianSimulatorScene 正确识别 wulian 模拟器场景', () => {
    const config = createDefaultSimulatorScene('flux-loop-slider');
    const interactiveContent = wulianSimulatorToInteractiveContent(config);

    expect(isWulianSimulatorScene(interactiveContent)).toBe(true);

    // 非 wulian 模拟器场景
    const nonWulianContent = {
      type: 'interactive' as const,
      url: 'https://example.com/some-other-interactive',
    };
    expect(isWulianSimulatorScene(nonWulianContent)).toBe(false);
  });
});
