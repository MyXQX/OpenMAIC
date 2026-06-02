/**
 * 物理模拟器注册表
 *
 * 集中管理现有 4 个模拟器（flux-loop-slider、photoelectric、double-slit、newton-block）
 * 的元数据与参数定义，供生成流水线、课堂实例与前端渲染使用。
 */

import type { SimulatorDefinition } from '@/lib/wulian/types';

/**
 * 所有注册的模拟器列表（4 个）
 */
const SIMULATORS: SimulatorDefinition[] = [
  {
    id: 'flux-loop-slider',
    title: '电磁感应 · 通量与感应电动势',
    subject: '电磁学',
    knowledgePointHint: '法拉第电磁感应定律',
    params: [
      { key: 'B', label: '磁场', min: 0, max: 1.5, default: 0.5, unit: 'T' },
      { key: 'area', label: '回路面积', min: 0.1, max: 2, default: 1.0, unit: 'm²' },
      { key: 'angle', label: '夹角', min: 0, max: 180, default: 0, unit: '°' },
    ],
  },
  {
    id: 'photoelectric',
    title: '光电效应 · 频率 / 强度',
    subject: '近代物理',
    knowledgePointHint: '爱因斯坦光电效应方程',
    params: [
      { key: 'freq', label: '光频率', min: 2, max: 12, default: 6.0, unit: '×10¹⁴ Hz' },
      { key: 'intensity', label: '光强', min: 0.1, max: 1, default: 0.5, unit: '' },
      // W (逸出功) 是固定值 2.0 eV，不可调
    ],
  },
  {
    id: 'double-slit',
    title: '双缝干涉 · 条纹间距',
    subject: '光学',
    knowledgePointHint: '杨氏双缝干涉',
    params: [
      { key: 'lambda', label: '波长', min: 380, max: 780, default: 600, unit: 'nm' },
      { key: 'd', label: '缝距', min: 0.05, max: 1, default: 0.2, unit: 'mm' },
      { key: 'L', label: '屏距', min: 0.2, max: 3, default: 1.0, unit: 'm' },
    ],
  },
  {
    id: 'newton-block',
    title: '斜面滑块 · 牛顿第二定律',
    subject: '力学',
    knowledgePointHint: '牛顿第二定律与摩擦力',
    params: [
      { key: 'angle', label: '倾角', min: 5, max: 60, default: 30, unit: '°' },
      { key: 'mu', label: '摩擦系数', min: 0, max: 0.6, default: 0.1, unit: '' },
      // g 固定 9.8，质量 m 在计算中约去，不作为参数
    ],
  },
];

/**
 * 获取所有模拟器列表
 */
export function listSimulators(): SimulatorDefinition[] {
  return SIMULATORS;
}

/**
 * 根据 id 查找模拟器
 * @returns 找到返回定义，未找到返回 undefined
 */
export function getSimulator(id: string): SimulatorDefinition | undefined {
  return SIMULATORS.find((s) => s.id === id);
}

/**
 * 按学科筛选模拟器
 */
export function getSimulatorsBySubject(subject: SimulatorDefinition['subject']): SimulatorDefinition[] {
  return SIMULATORS.filter((s) => s.subject === subject);
}

/**
 * 校验模拟器参数是否在范围内
 */
export function validateSimulatorParams(
  simulatorId: string,
  params: Record<string, number>
): { valid: boolean; errors?: string[] } {
  const sim = getSimulator(simulatorId);
  if (!sim) {
    return { valid: false, errors: [`Unknown simulator: ${simulatorId}`] };
  }

  const errors: string[] = [];
  for (const paramDef of sim.params) {
    const value = params[paramDef.key];
    if (value === undefined) {
      // 参数可选（使用默认值），不强制要求
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`Parameter ${paramDef.key} must be a finite number`);
      continue;
    }
    if (value < paramDef.min || value > paramDef.max) {
      errors.push(
        `Parameter ${paramDef.key}=${value} out of range [${paramDef.min}, ${paramDef.max}]`
      );
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
