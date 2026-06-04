/**
 * 物联智讲 - 模拟器 → MAIC Interactive 场景适配协议
 *
 * 职责（需求 3.2 / 3.5 / 3.6）：
 *   - 定义 wulian 模拟器如何映射为 MAIC interactive 场景类型
 *   - 提供双向转换：wulian 模拟器定义 → MAIC InteractiveContent payload
 *   - 渲染失败时的降级占位逻辑
 *
 * 适配策略：
 *   - Wulian 模拟器通过 InteractiveContent.url 字段集成（iframe 内嵌方式）
 *   - URL 形式：`/wulian/simulator/<simulatorId>?params=<base64url(json)>`
 *   - 也支持通过 InteractiveContent.widgetType 扩展字段标识（未来 Ultra Mode 可识别）
 */

import type { InteractiveContent } from '@/lib/types/stage';
import type { SimulatorDefinition } from '@/lib/wulian/types';
import { getSimulator, validateSimulatorParams } from './registry';

// ----------------------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------------------

/**
 * Wulian 模拟器场景配置（生成时由 AI 填充，回放时驱动模拟器渲染）
 */
export interface WulianSimulatorSceneConfig {
  /** 模拟器 ID（对应 registry 中的定义） */
  simulatorId: string;
  /** 初始参数（由 AI 根据讲解内容设定） */
  initialParams: Record<string, number>;
  /** 可选：教学要点提示（AI 生成的引导文字，叠加在模拟器上方） */
  teachingHint?: string;
  /** 可选：交互目标（学生应该探索的现象，如「观察频率与光电流关系」） */
  interactionGoal?: string;
}

/**
 * 渲染失败时的占位信息
 */
export interface SimulatorFallbackInfo {
  simulatorId: string;
  title: string;
  reason: 'not_found' | 'invalid_params' | 'render_error';
  message: string;
  suggestedAction?: string;
}

// ----------------------------------------------------------------------------
// Wulian 模拟器 → MAIC InteractiveContent 适配
// ----------------------------------------------------------------------------

/**
 * 将 wulian 模拟器场景配置转换为 MAIC InteractiveContent（需求 3.2 / 3.6）。
 *
 * 映射策略：
 *   - url: `/wulian/simulator/<simulatorId>?config=<base64url(json)>`
 *   - widgetType: 'wulian-simulator'（未来可被 Ultra Mode 识别为特殊类型）
 *   - widgetConfig: 存储完整的 WulianSimulatorSceneConfig
 *
 * @throws {Error} 当模拟器不存在或参数非法时
 */
export function wulianSimulatorToInteractiveContent(
  config: WulianSimulatorSceneConfig,
): InteractiveContent {
  // 校验模拟器存在性
  const sim = getSimulator(config.simulatorId);
  if (!sim) {
    throw new Error(`Unknown simulator: ${config.simulatorId}`);
  }

  // 校验参数范围
  const validation = validateSimulatorParams(config.simulatorId, config.initialParams);
  if (!validation.valid) {
    throw new Error(`Invalid simulator params: ${validation.errors?.join(', ')}`);
  }

  // 编码配置为 base64url（不含填充，URL 安全）
  const configJson = JSON.stringify(config);
  const configBase64 = Buffer.from(configJson, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return {
    type: 'interactive',
    url: `/wulian/simulator/${config.simulatorId}?config=${configBase64}`,
    widgetType: 'wulian-simulator' as never, // 标记为 wulian 模拟器类型（未来扩展）
    widgetConfig: config as never, // 完整配置也存一份便于服务端访问
  };
}

/**
 * 从 MAIC InteractiveContent 还原 wulian 模拟器场景配置（需求 3.2）。
 *
 * 支持两种还原路径：
 *   1. 优先从 widgetConfig 读取（最可靠）
 *   2. 回退到从 url query 参数解析（兼容旧数据）
 *
 * @returns 解析成功返回配置，失败返回 null（渲染层需降级处理）
 */
export function interactiveContentToWulianSimulator(
  content: InteractiveContent,
): WulianSimulatorSceneConfig | null {
  // Path 1: 从 widgetConfig 读取（最直接）
  if (content.widgetType === ('wulian-simulator' as never) && content.widgetConfig) {
    const config = content.widgetConfig as unknown as WulianSimulatorSceneConfig;
    if (config.simulatorId && config.initialParams) {
      return config;
    }
  }

  // Path 2: 从 url 解析 query 参数（兼容）
  if (content.url?.includes('/wulian/simulator/')) {
    try {
      const url = new URL(content.url, 'https://dummy.com'); // 补全协议以便解析
      const configParam = url.searchParams.get('config');
      if (!configParam) return null;

      // 解码 base64url
      const base64 = configParam.replace(/-/g, '+').replace(/_/g, '/');
      const configJson = Buffer.from(base64, 'base64').toString('utf-8');
      const config = JSON.parse(configJson) as WulianSimulatorSceneConfig;

      // 基本结构校验
      if (config.simulatorId && config.initialParams) {
        return config;
      }
    } catch {
      // 解析失败，返回 null 触发降级
      return null;
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// 渲染失败降级逻辑（需求 3.5）
// ----------------------------------------------------------------------------

/**
 * 为渲染失败的模拟器生成降级占位信息（需求 3.5）。
 *
 * 用途：当 InteractiveContent 无法正常渲染时（模拟器不存在/参数非法/组件错误），
 * 渲染层用此函数获取人类可读的错误提示与建议操作，显示占位 UI 而非白屏。
 */
export function createSimulatorFallback(
  content: InteractiveContent,
  error?: Error,
): SimulatorFallbackInfo {
  const config = interactiveContentToWulianSimulator(content);

  // 情况 1：无法解析配置（URL 损坏/格式错误）
  if (!config) {
    return {
      simulatorId: 'unknown',
      title: '模拟器加载失败',
      reason: 'render_error',
      message: '模拟器配置损坏或格式不兼容',
      suggestedAction: '请刷新页面重试，若问题持续请联系技术支持',
    };
  }

  const sim = getSimulator(config.simulatorId);

  // 情况 2：模拟器不存在（ID 错误或未注册）
  if (!sim) {
    return {
      simulatorId: config.simulatorId,
      title: `模拟器 "${config.simulatorId}" 不存在`,
      reason: 'not_found',
      message: '该模拟器可能已被移除或未安装',
      suggestedAction: '跳过此场景或联系内容管理员',
    };
  }

  // 情况 3：参数非法（超出范围）
  const validation = validateSimulatorParams(config.simulatorId, config.initialParams);
  if (!validation.valid) {
    return {
      simulatorId: config.simulatorId,
      title: sim.title,
      reason: 'invalid_params',
      message: `参数校验失败：${validation.errors?.join('; ')}`,
      suggestedAction: '使用默认参数或联系内容管理员修复',
    };
  }

  // 情况 4：运行时渲染错误（组件崩溃/网络问题）
  return {
    simulatorId: config.simulatorId,
    title: sim.title,
    reason: 'render_error',
    message: error?.message || '模拟器渲染过程中发生未知错误',
    suggestedAction: '刷新页面重试，若问题持续请联系技术支持',
  };
}

/**
 * 判断某个 InteractiveContent 是否为 wulian 模拟器类型（需求 3.6）。
 *
 * 用途：渲染层据此决定使用 wulian 模拟器组件还是通用 iframe。
 */
export function isWulianSimulatorScene(content: InteractiveContent): boolean {
  // 方式 1：widgetType 明确标识
  if (content.widgetType === ('wulian-simulator' as never)) {
    return true;
  }
  // 方式 2：url 形态匹配
  if (content.url?.startsWith('/wulian/simulator/')) {
    return true;
  }
  return false;
}

/**
 * 从模拟器定义生成默认场景配置（便于测试 / 快速构造示例场景）。
 */
export function createDefaultSimulatorScene(
  simulatorId: string,
): WulianSimulatorSceneConfig {
  const sim = getSimulator(simulatorId);
  if (!sim) {
    throw new Error(`Unknown simulator: ${simulatorId}`);
  }

  const initialParams: Record<string, number> = {};
  for (const param of sim.params) {
    initialParams[param.key] = param.default;
  }

  return {
    simulatorId,
    initialParams,
    teachingHint: `探索 ${sim.title} 的规律`,
    interactionGoal: `调整参数观察现象变化`,
  };
}
