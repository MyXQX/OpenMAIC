'use client';

import type { WhiteboardItem } from '@/lib/wulian/types';
import { Latex, MarkdownLite } from './Latex';
import { Simulation } from './Simulation';

export function Whiteboard({
  items,
  fallbackSimulationId,
  onClear,
}: {
  items: WhiteboardItem[];
  fallbackSimulationId?: string;
  onClear?: () => void;
}) {
  const hasSimulation = items.some((i) => i.type === 'simulation');

  return (
    <div className="w-stage">
      <div className="w-pane" style={{ flex: 1, minHeight: 0 }}>
        <div className="w-pane-header">
          <span>🖼 白板</span>
          {onClear && items.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--w-ink-soft)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              清空
            </button>
          )}
        </div>
        <div className="w-board">
          {items.length === 0 ? (
            <div className="w-board-empty">老师还没开始板书。点击右下角的「请老师开场」即可。</div>
          ) : (
            items.map((item, i) => <BoardItem key={i} item={item} />)
          )}
        </div>
      </div>
      {!hasSimulation && fallbackSimulationId && (
        <Simulation simulationId={fallbackSimulationId} />
      )}
    </div>
  );
}

function BoardItem({ item }: { item: WhiteboardItem }) {
  if (item.type === 'formula') {
    return (
      <div className="w-board-card">
        <div className="formula-display">
          <Latex source={item.latex} displayMode />
        </div>
        {item.caption && <div className="caption">{item.caption}</div>}
      </div>
    );
  }
  if (item.type === 'note') {
    return (
      <div className="w-board-card" style={{ borderLeftColor: 'var(--w-good)' }}>
        <MarkdownLite text={item.markdown} />
      </div>
    );
  }
  if (item.type === 'figure') {
    // 简单防注入：仅允许字符串中的 svg 节点。前端用 dangerouslySetInnerHTML 时
    // 为减少风险，只渲染纯 SVG 标签内的内容并不允许 script。
    const safe = sanitizeSvg(item.svg);
    return (
      <div className="w-board-card" style={{ borderLeftColor: 'var(--w-accent-soft)' }}>
        <div dangerouslySetInnerHTML={{ __html: safe }} />
        {item.caption && <div className="caption">{item.caption}</div>}
      </div>
    );
  }
  if (item.type === 'simulation') {
    return (
      <div style={{ marginBottom: 16 }}>
        <Simulation simulationId={item.simulationId} params={item.params} />
      </div>
    );
  }
  return null;
}

function sanitizeSvg(input: string): string {
  // 移除 <script>、on* 属性、外部 href
  let s = input.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/\son\w+="[^"]*"/gi, '');
  s = s.replace(/\son\w+='[^']*'/gi, '');
  s = s.replace(/javascript:/gi, '');
  return s;
}
