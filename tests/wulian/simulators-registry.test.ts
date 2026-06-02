/**
 * 模拟器注册表单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  listSimulators,
  getSimulator,
  getSimulatorsBySubject,
  validateSimulatorParams,
} from '@/lib/wulian/simulators/registry';

describe('listSimulators', () => {
  it('应返回 4 个模拟器', () => {
    const simulators = listSimulators();
    expect(simulators).toHaveLength(4);
  });

  it('所有模拟器应包含必需字段', () => {
    const simulators = listSimulators();
    for (const sim of simulators) {
      expect(sim.id).toBeTruthy();
      expect(sim.title).toBeTruthy();
      expect(sim.subject).toBeTruthy();
      expect(Array.isArray(sim.params)).toBe(true);
      expect(sim.params.length).toBeGreaterThan(0);
    }
  });

  it('所有参数应包含完整定义', () => {
    const simulators = listSimulators();
    for (const sim of simulators) {
      for (const param of sim.params) {
        expect(param.key).toBeTruthy();
        expect(param.label).toBeTruthy();
        expect(typeof param.min).toBe('number');
        expect(typeof param.max).toBe('number');
        expect(typeof param.default).toBe('number');
        // 验证范围不变量：min <= default <= max
        expect(param.min).toBeLessThanOrEqual(param.default);
        expect(param.default).toBeLessThanOrEqual(param.max);
      }
    }
  });

  it('模拟器 ID 应唯一', () => {
    const simulators = listSimulators();
    const ids = simulators.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('getSimulator', () => {
  it('应找到已注册的 4 个模拟器', () => {
    const ids = ['flux-loop-slider', 'photoelectric', 'double-slit', 'newton-block'];
    for (const id of ids) {
      const sim = getSimulator(id);
      expect(sim).toBeDefined();
      expect(sim?.id).toBe(id);
    }
  });

  it('未知 ID 应返回 undefined', () => {
    const sim = getSimulator('non-existent');
    expect(sim).toBeUndefined();
  });
});

describe('getSimulatorsBySubject', () => {
  it('应按学科正确筛选', () => {
    const mechanics = getSimulatorsBySubject('力学');
    expect(mechanics).toHaveLength(1);
    expect(mechanics[0].id).toBe('newton-block');

    const em = getSimulatorsBySubject('电磁学');
    expect(em).toHaveLength(1);
    expect(em[0].id).toBe('flux-loop-slider');

    const optics = getSimulatorsBySubject('光学');
    expect(optics).toHaveLength(1);
    expect(optics[0].id).toBe('double-slit');

    const modern = getSimulatorsBySubject('近代物理');
    expect(modern).toHaveLength(1);
    expect(modern[0].id).toBe('photoelectric');
  });
});

describe('validateSimulatorParams', () => {
  it('未知模拟器应报错', () => {
    const result = validateSimulatorParams('unknown', {});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown simulator: unknown');
  });

  it('合法参数应通过', () => {
    const result = validateSimulatorParams('flux-loop-slider', {
      B: 0.5,
      area: 1.0,
      angle: 45,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('参数可选（使用默认值）', () => {
    const result = validateSimulatorParams('flux-loop-slider', {});
    expect(result.valid).toBe(true);
  });

  it('超出范围应报错', () => {
    const result = validateSimulatorParams('flux-loop-slider', {
      B: 99, // max = 1.5
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]).toContain('out of range');
  });

  it('非数字参数应报错', () => {
    const result = validateSimulatorParams('flux-loop-slider', {
      B: 'not-a-number' as any,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]).toContain('must be a finite number');
  });

  it('所有模拟器默认参数应通过校验', () => {
    const simulators = listSimulators();
    for (const sim of simulators) {
      const defaultParams = Object.fromEntries(
        sim.params.map((p) => [p.key, p.default])
      );
      const result = validateSimulatorParams(sim.id, defaultParams);
      expect(result.valid).toBe(true);
    }
  });
});
