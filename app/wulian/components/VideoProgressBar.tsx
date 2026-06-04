'use client';

import { useMemo } from 'react';
import type { Scene } from '@/lib/types/stage';
import type { EngineMode } from '@/lib/playback';

interface VideoProgressBarProps {
  scenes: Scene[];
  currentSceneId: string | null;
  currentActionIndex: number;
  engineMode: EngineMode;
  playbackCompleted: boolean;
  playbackSpeed: number;
  onPlayPause: () => void;
  onPrevScene: () => void;
  onNextScene: () => void;
  onSeekScene: (sceneId: string) => void;
  onSpeedChange: (speed: number) => void;
}

/**
 * 估算场景的音频与动作总时长（单位：毫秒）
 */
export function estimateSceneDuration(scene: Scene): number {
  if (!scene.actions || scene.actions.length === 0) return 4000; // 默认 4s
  let dur = 0;
  for (const action of scene.actions) {
    if (action.type === 'speech') {
      const text = action.text || '';
      // 汉字字数与外文单词数混合处理
      const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
      const isCJK = cjkCount > text.length * 0.3;
      const rawMs = isCJK
        ? Math.max(2500, text.length * 160) // 稍作拉长使展示更平滑
        : Math.max(2500, text.split(/\s+/).filter(Boolean).length * 250);
      dur += rawMs;
    } else if (action.type === 'discussion') {
      dur += 4000;
    } else {
      dur += 800; // 其它动作比如白板推导 0.8 秒
    }
  }
  return dur;
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function VideoProgressBar({
  scenes,
  currentSceneId,
  currentActionIndex,
  engineMode,
  playbackCompleted,
  playbackSpeed,
  onPlayPause,
  onPrevScene,
  onNextScene,
  onSeekScene,
  onSpeedChange,
}: VideoProgressBarProps) {
  // 计算各场景的时长和起始时间点
  const { totalDuration, sceneTimeline, currentSceneIndex } = useMemo(() => {
    let acc = 0;
    const timeline = scenes.map((scene) => {
      const duration = estimateSceneDuration(scene);
      const start = acc;
      acc += duration;
      return { id: scene.id, title: scene.title, duration, start };
    });

    const curIndex = scenes.findIndex((s) => s.id === currentSceneId);
    return {
      totalDuration: acc,
      sceneTimeline: timeline,
      currentSceneIndex: curIndex >= 0 ? curIndex : 0,
    };
  }, [scenes, currentSceneId]);

  // 估算当前播放时间
  const currentTime = useMemo(() => {
    if (playbackCompleted) return totalDuration;
    const currentTimelineItem = sceneTimeline[currentSceneIndex];
    if (!currentTimelineItem) return 0;

    const currentScene = scenes[currentSceneIndex];
    const totalActions = currentScene?.actions?.length || 1;
    const progressRatio = Math.min(1, currentActionIndex / totalActions);
    return currentTimelineItem.start + progressRatio * currentTimelineItem.duration;
  }, [sceneTimeline, currentSceneIndex, currentActionIndex, scenes, playbackCompleted, totalDuration]);

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="w-progress-bar-container">
      {/* 进度条轨道：支持按章节分段呈现 */}
      <div className="w-progress-chapters">
        {sceneTimeline.map((item, idx) => {
          const isCompleted = idx < currentSceneIndex;
          const isActive = idx === currentSceneIndex;
          const totalActions = scenes[idx]?.actions?.length || 1;
          const ratio = isActive ? Math.min(1, currentActionIndex / totalActions) : isCompleted ? 1 : 0;
          const percent = ratio * 100;

          return (
            <div
              key={item.id}
              className={`w-progress-chapter-segment${isActive ? ' active' : ''}`}
              style={{
                flex: item.duration, // 宽度按估算时长比例分配
              }}
              title={`${item.title} (${formatTime(item.duration)})`}
              onClick={() => onSeekScene(item.id)}
            >
              <div className="w-progress-chapter-bg" />
              <div
                className="w-progress-chapter-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* 底部控制行 */}
      <div className="w-progress-controls">
        <div className="controls-left">
          {/* 上一页 */}
          <button
            type="button"
            className="control-btn"
            onClick={onPrevScene}
            disabled={currentSceneIndex === 0}
            title="上一个场景 (ArrowLeft)"
          >
            ⏮
          </button>

          {/* 播放/暂停 */}
          <button
            type="button"
            className="control-btn play-pause-btn"
            onClick={onPlayPause}
            title={engineMode === 'playing' ? '暂停 (Space)' : '播放 (Space)'}
          >
            {engineMode === 'playing' ? '⏸' : '▶'}
          </button>

          {/* 下一页 */}
          <button
            type="button"
            className="control-btn"
            onClick={onNextScene}
            disabled={currentSceneIndex === scenes.length - 1 && !playbackCompleted}
            title="下一个场景 (ArrowRight)"
          >
            ⏭
          </button>

          {/* 时间显示 */}
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        <div className="controls-right">
          {/* 倍速调节 */}
          <div className="speed-selector">
            <span style={{ fontSize: 11, opacity: 0.6, marginRight: 6 }}>倍速</span>
            <select
              value={playbackSpeed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="w-select"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .w-progress-bar-container {
          background: rgba(15, 26, 48, 0.9);
          border: 1px solid var(--w-border);
          border-radius: 12px;
          padding: 8px 14px 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          margin-top: 10px;
        }
        .w-progress-chapters {
          display: flex;
          gap: 3px;
          height: 5px;
          cursor: pointer;
        }
        .w-progress-chapter-segment {
          position: relative;
          height: 100%;
          border-radius: 2px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.1);
          transition: transform 0.1s ease;
        }
        .w-progress-chapter-segment:hover {
          transform: scaleY(1.5);
          background: rgba(255, 255, 255, 0.2);
        }
        .w-progress-chapter-bg {
          position: absolute;
          inset: 0;
        }
        .w-progress-chapter-fill {
          height: 100%;
          background: var(--w-accent);
          transition: width 0.15s linear;
        }
        .w-progress-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
        }
        .controls-left, .controls-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .control-btn {
          background: none;
          border: 0;
          color: var(--w-ink);
          font-size: 16px;
          cursor: pointer;
          opacity: 0.85;
          padding: 4px 6px;
          border-radius: 4px;
          transition: background 0.1s, opacity 0.1s;
        }
        .control-btn:hover:not(:disabled) {
          opacity: 1;
          background: rgba(255, 255, 255, 0.08);
          color: var(--w-accent-soft);
        }
        .control-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .play-pause-btn {
          font-size: 18px;
        }
        .time-display {
          font-family: 'Geist Mono', monospace;
          font-size: 12px;
          color: var(--w-ink-soft);
          margin-left: 4px;
        }
        .w-select {
          background: rgba(24, 35, 61, 0.8);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
          border-radius: 6px;
          padding: 2px 6px;
          font-size: 11px;
          outline: none;
          cursor: pointer;
        }
        .w-select:focus {
          border-color: var(--w-accent);
        }
      `}</style>
    </div>
  );
}
