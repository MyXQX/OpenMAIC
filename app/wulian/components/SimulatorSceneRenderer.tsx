'use client';

/**
 * Wulian 模拟器场景渲染器
 *
 * 职责（任务 4.3）：
 *   - 作为 MAIC interactive 场景的自包含渲染组件
 *   - 包装现有 Simulation 组件，去除对旧 LessonRoom 的耦合
 *   - 暴露受控 params 接口供 Agent 动作设置（需求 3.3 / 3.4）
 *   - 提供渲染失败降级占位 UI（需求 3.5）
 */

import { useState, useEffect, useCallback } from 'react';
import type { InteractiveContent } from '@/lib/types/stage';
import {
  interactiveContentToWulianSimulator,
  createSimulatorFallback,
  type WulianSimulatorSceneConfig,
  type SimulatorFallbackInfo,
} from '@/lib/wulian/simulators/scene-adapter';
import { getSimulator } from '@/lib/wulian/simulators/registry';
import { Simulation } from './Simulation';
import styles from './SimulatorSceneRenderer.module.css';

// ----------------------------------------------------------------------------
// Props & Types
// ----------------------------------------------------------------------------

export interface SimulatorSceneRendererProps {
  /** MAIC InteractiveContent (从 scene 传入) */
  content: InteractiveContent;

  /**
   * 外部控制参数（可选，用于 Agent 动作设置参数）
   * 当此 prop 变化时，模拟器内部状态会同步更新
   */
  controlledParams?: Record<string, number>;

  /**
   * 参数变更回调（可选，模拟器内部参数变化时通知外部）
   * 用途：记录学生交互行为、回放时同步等
   */
  onParamsChange?: (params: Record<string, number>) => void;

  /**
   * 是否为只读模式（禁用学生交互，仅展示 Agent 设置的状态）
   */
  readonly?: boolean;
}

// ----------------------------------------------------------------------------
// 主组件
// ----------------------------------------------------------------------------

/**
 * 模拟器场景渲染器（MAIC interactive 场景容器）
 */
export function SimulatorSceneRenderer({
  content,
  controlledParams,
  onParamsChange,
  readonly = false,
}: SimulatorSceneRendererProps) {
  // 解析 InteractiveContent → WulianSimulatorSceneConfig
  const [config, setConfig] = useState<WulianSimulatorSceneConfig | null>(null);
  const [fallback, setFallback] = useState<SimulatorFallbackInfo | null>(null);

  useEffect(() => {
    try {
      const parsed = interactiveContentToWulianSimulator(content);
      if (parsed) {
        setConfig(parsed);
        setFallback(null);
      } else {
        // 解析失败 → 降级
        setConfig(null);
        setFallback(createSimulatorFallback(content));
      }
    } catch (error) {
      // 渲染错误 → 降级
      setConfig(null);
      setFallback(createSimulatorFallback(content, error as Error));
    }
  }, [content]);

  // 合并 initialParams + controlledParams（外部控制优先）
  const effectiveParams = {
    ...config?.initialParams,
    ...controlledParams,
  };

  // 降级 UI（需求 3.5）
  if (fallback || !config) {
    return <SimulatorFallbackUI fallback={fallback!} />;
  }

  return (
    <div className={styles['wulian-simulator-scene']}>
      {/* 教学要点提示（AI 生成的引导文字） */}
      {config.teachingHint && (
        <div className={styles['simulator-teaching-hint']}>
          <span className={styles['hint-icon']}>💡</span>
          <span>{config.teachingHint}</span>
        </div>
      )}

      {/* 核心模拟器组件 */}
      <SimulationWrapper
        simulatorId={config.simulatorId}
        params={effectiveParams}
        onParamsChange={onParamsChange}
        readonly={readonly}
      />

      {/* 交互目标（学生应探索的现象） */}
      {config.interactionGoal && !readonly && (
        <div className={styles['simulator-interaction-goal']}>
          <span className={styles['goal-icon']}>🎯</span>
          <span>{config.interactionGoal}</span>
        </div>
      )}

      {/* 只读模式提示 */}
      {readonly && (
        <div className={styles['simulator-readonly-hint']}>
          <span>🔒 演示模式：老师正在操作模拟器</span>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 模拟器包装器（处理受控参数同步）
// ----------------------------------------------------------------------------

interface SimulationWrapperProps {
  simulatorId: string;
  params: Record<string, number | string>;
  onParamsChange?: (params: Record<string, number>) => void;
  readonly?: boolean;
}

/**
 * Simulation 组件包装器，处理受控参数与内部状态同步
 */
function SimulationWrapper({
  simulatorId,
  params,
  onParamsChange,
  readonly,
}: SimulationWrapperProps) {
  // 内部状态（学生交互会修改这些状态）
  const [internalParams, setInternalParams] = useState(params);

  // 当外部 controlledParams 变化时，同步到内部状态（Agent 控制）
  useEffect(() => {
    setInternalParams((prev) => ({ ...prev, ...params }));
  }, [params]);

  // 包装的 params（如果只读，禁用交互；否则使用内部状态）
  const effectiveParams = readonly ? params : internalParams;

  // 通知外部参数变更（通过拦截 Simulation 内部的 onChange）
  const handleParamChange = useCallback(
    (key: string, value: number) => {
      if (readonly) return; // 只读模式不响应交互

      setInternalParams((prev) => {
        const updated = { ...prev, [key]: value };
        // 通知外部（转换为纯数字类型）
        const numericParams: Record<string, number> = {};
        for (const [k, v] of Object.entries(updated)) {
          if (typeof v === 'number') {
            numericParams[k] = v;
          } else if (typeof v === 'string') {
            const n = parseFloat(v);
            if (Number.isFinite(n)) {
              numericParams[k] = n;
            }
          }
        }
        onParamsChange?.(numericParams);
        return updated;
      });
    },
    [readonly, onParamsChange],
  );

  // NOTE: 当前 Simulation 组件不支持外部控制 onChange，
  // 这里暂时直接传递 params。如需完整的受控能力，需改造 Simulation 组件
  // 使其支持 onChange 回调（或将其内部状态提升到此处）。
  //
  // 临时方案：Simulation 内部已有状态管理，此处仅做初始化；
  // 若要实现 Agent 动作实时控制，后续需改造为完全受控组件。

  return (
    <div className={readonly ? styles['simulator-readonly'] : ''}>
      <Simulation simulationId={simulatorId} params={effectiveParams} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// 降级 UI（需求 3.5）
// ----------------------------------------------------------------------------

function SimulatorFallbackUI({ fallback }: { fallback: SimulatorFallbackInfo }) {
  const iconMap = {
    not_found: '🔍',
    invalid_params: '⚠️',
    render_error: '❌',
  };

  const colorMap = {
    not_found: 'var(--w-warn)',
    invalid_params: 'var(--w-warn)',
    render_error: 'var(--w-bad)',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '24px',
        background: 'rgba(239, 108, 140, 0.05)',
        border: '1px solid rgba(239, 108, 140, 0.2)',
        borderRadius: '12px',
        margin: '16px 0',
      }}
    >
      <div
        style={{
          fontSize: '48px',
          lineHeight: 1,
          flexShrink: 0,
          color: colorMap[fallback.reason],
        }}
      >
        {iconMap[fallback.reason]}
      </div>
      <div style={{ flex: 1 }}>
        <h4
          style={{
            margin: '0 0 8px',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--w-ink)',
          }}
        >
          {fallback.title}
        </h4>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: '14px',
            color: 'var(--w-ink-soft)',
            lineHeight: 1.6,
          }}
        >
          {fallback.message}
        </p>
        {fallback.suggestedAction && (
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--w-ink-soft)',
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: 'var(--w-accent-soft)' }}>建议：</strong>
            {fallback.suggestedAction}
          </p>
        )}
      </div>
    </div>
  );
}
