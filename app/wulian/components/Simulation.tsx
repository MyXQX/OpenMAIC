'use client';

/**
 * 物理模拟器组件库
 *
 * 内置 simulation id：
 *   - flux-loop-slider  电磁感应：B / 面积 / 夹角 → 通量 → 感应电动势
 *   - photoelectric    光电效应：频率 / 强度 → 光电子动能 / 截止电压
 *   - double-slit      双缝干涉：缝距 / 波长 / 屏距 → 条纹间距
 *   - newton-block     斜面滑块：质量 / 摩擦 / 倾角 → 加速度
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Latex } from './Latex';

interface SimulationProps {
  simulationId: string;
  /** 来自 LLM 的初始参数（可选），允许老师按需高亮某个值 */
  params?: Record<string, number | string>;
}

export function Simulation({ simulationId, params }: SimulationProps) {
  switch (simulationId) {
    case 'flux-loop-slider':
      return <FluxLoopSlider initial={params} />;
    case 'photoelectric':
      return <PhotoelectricSim initial={params} />;
    case 'double-slit':
      return <DoubleSlitSim initial={params} />;
    case 'newton-block':
      return <NewtonBlockSim initial={params} />;
    default:
      return (
        <div className="w-sim">
          <h4>互动模拟器</h4>
          <p style={{ color: 'var(--w-ink-soft)', fontSize: 13 }}>
            未识别的模拟 id: <code>{simulationId}</code>
          </p>
        </div>
      );
  }
}

// ----------------------------------------------------------------------------
// 1. 电磁感应：通量与感应电动势
// ----------------------------------------------------------------------------

function FluxLoopSlider({ initial }: { initial?: Record<string, number | string> }) {
  const [B, setB] = useState(num(initial?.B, 0.5));
  const [area, setArea] = useState(num(initial?.area, 1.0));
  const [angleDeg, setAngleDeg] = useState(num(initial?.angle, 0));
  const [animating, setAnimating] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => prev + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating]);

  const omega = 1.5; // rad/s 演示用
  const effectiveAngleRad = animating ? (angleDeg * Math.PI) / 180 + omega * t : (angleDeg * Math.PI) / 180;
  const flux = B * area * Math.cos(effectiveAngleRad);
  const dPhi = -B * area * Math.sin(effectiveAngleRad) * (animating ? omega : 0);
  const emf = -dPhi;

  const drawingAngleDeg = (effectiveAngleRad * 180) / Math.PI;

  return (
    <div className="w-sim">
      <h4>
        <span>⚙️</span>
        <span>电磁感应 · 通量与感应电动势</span>
      </h4>
      <div className="w-sim-grid">
        <div>
          <FluxSvg B={B} area={area} angleDeg={drawingAngleDeg} flux={flux} />
        </div>
        <div className="w-sim-controls">
          <label>
            磁场 B = {B.toFixed(2)} T
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={B}
              onChange={(e) => setB(parseFloat(e.target.value))}
            />
          </label>
          <label>
            回路面积 A = {area.toFixed(2)} m²
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={area}
              onChange={(e) => setArea(parseFloat(e.target.value))}
            />
          </label>
          <label>
            夹角 θ = {drawingAngleDeg.toFixed(0)}°
            <input
              type="range"
              min={0}
              max={180}
              step={1}
              value={angleDeg}
              onChange={(e) => setAngleDeg(parseFloat(e.target.value))}
              disabled={animating}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setAnimating((v) => !v);
              if (animating) setT(0);
            }}
            style={{
              background: animating ? 'var(--w-bad)' : 'var(--w-accent)',
              border: 0,
              color: '#1a1a1a',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {animating ? '停止旋转' : '让线圈匀速旋转'}
          </button>
          <div className="w-sim-readout">
            <div>
              Φ = <Latex source={`B A \\cos\\theta = ${flux.toFixed(3)}\\,\\text{Wb}`} />
            </div>
            <div style={{ marginTop: 4 }}>
              ε = <Latex source={`-\\dfrac{d\\Phi}{dt} = ${emf.toFixed(3)}\\,\\text{V}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FluxSvg({
  B,
  area,
  angleDeg,
  flux,
}: {
  B: number;
  area: number;
  angleDeg: number;
  flux: number;
}) {
  // 视觉宽度按 area 映射（√A）
  const w = 60 + Math.sqrt(area) * 80;
  const h = 80;
  const cx = 150;
  const cy = 110;

  // 磁场强度 → 箭头密度
  const arrows = Math.max(2, Math.min(10, Math.round(2 + B * 6)));
  const arrowSpacing = 220 / arrows;

  // 通量多寡 → 线圈填充
  const fluxAlpha = Math.min(0.45, Math.abs(flux) * 0.35);
  const fluxColor = flux >= 0 ? 'rgba(216,160,74,' : 'rgba(108,170,239,';

  return (
    <svg viewBox="0 0 320 220" width="100%" height="220" style={{ display: 'block' }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.55)" />
        </marker>
      </defs>
      {/* 磁场背景箭头（向右） */}
      {Array.from({ length: arrows }).map((_, i) => {
        const y = 30 + i * arrowSpacing;
        if (y > 210) return null;
        return (
          <line
            key={i}
            x1={20}
            y1={y}
            x2={300}
            y2={y}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1.2}
            markerEnd="url(#arr)"
          />
        );
      })}
      {/* 线圈 */}
      <g transform={`translate(${cx} ${cy}) rotate(${angleDeg - 90})`}>
        <ellipse
          cx={0}
          cy={0}
          rx={w / 2}
          ry={h / 2}
          fill={`${fluxColor}${fluxAlpha})`}
          stroke="#d8a04a"
          strokeWidth={2.5}
        />
        <line x1={-w / 2 - 14} y1={0} x2={-w / 2} y2={0} stroke="#d8a04a" strokeWidth={2.5} />
        <line x1={w / 2} y1={0} x2={w / 2 + 14} y2={0} stroke="#d8a04a" strokeWidth={2.5} />
      </g>
      <text x={cx} y={cy + h + 30} textAnchor="middle" fill="rgba(233,230,218,0.6)" fontSize={11}>
        线圈面积 {area.toFixed(2)}m² · θ={angleDeg.toFixed(0)}°
      </text>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// 2. 光电效应
// ----------------------------------------------------------------------------

function PhotoelectricSim({ initial }: { initial?: Record<string, number | string> }) {
  const W = num(initial?.W, 2.0); // eV，逸出功
  const [freq, setFreq] = useState(num(initial?.freq, 6.0)); // 单位 1e14 Hz
  const [intensity, setIntensity] = useState(num(initial?.intensity, 0.5));

  const h = 4.136e-15; // eV·s
  const E_photon = h * (freq * 1e14); // eV
  const Ek = Math.max(0, E_photon - W);
  const Uc = Ek; // 截止电压数值上等于 Ek (eV)
  const isAboveThreshold = E_photon > W;

  return (
    <div className="w-sim">
      <h4>
        <span>⚡</span>
        <span>光电效应 · 频率 / 强度</span>
      </h4>
      <div className="w-sim-grid">
        <svg viewBox="0 0 320 200" width="100%" height="180">
          {/* 金属板 */}
          <rect x={20} y={70} width={20} height={70} fill="#cccccc" />
          <text x={30} y={160} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={11}>
            金属
          </text>
          {/* 入射光子 */}
          {Array.from({ length: Math.max(2, Math.round(intensity * 8)) }).map((_, i) => {
            const dy = (i * 6) - intensity * 8;
            return (
              <line
                key={i}
                x1={250}
                y1={90 + dy}
                x2={50}
                y2={100 + dy}
                stroke={isAboveThreshold ? '#f0c47a' : '#6a82d8'}
                strokeWidth={1.5}
              />
            );
          })}
          {/* 光电子 */}
          {isAboveThreshold &&
            Array.from({ length: Math.max(1, Math.round(intensity * 6)) }).map((_, i) => (
              <circle
                key={i}
                cx={60 + Math.min(220, Ek * 80) + (i * 10) % 60}
                cy={95 + (i % 5) * 8}
                r={3.5}
                fill="#6cd187"
              />
            ))}
          <text
            x={160}
            y={30}
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize={12}
          >
            光子能量 hν = {E_photon.toFixed(2)} eV
          </text>
          <text
            x={160}
            y={195}
            textAnchor="middle"
            fill={isAboveThreshold ? '#6cd187' : '#ef6c8c'}
            fontSize={12}
          >
            {isAboveThreshold ? `Ek = ${Ek.toFixed(2)} eV` : '低于阈值，无光电子'}
          </text>
        </svg>
        <div className="w-sim-controls">
          <label>
            光频率 ν = {freq.toFixed(2)} ×10¹⁴ Hz
            <input
              type="range"
              min={2}
              max={12}
              step={0.1}
              value={freq}
              onChange={(e) => setFreq(parseFloat(e.target.value))}
            />
          </label>
          <label>
            光强 = {(intensity * 100).toFixed(0)}%
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
            />
          </label>
          <div className="w-sim-readout">
            W = {W.toFixed(2)} eV，Uc = {Uc.toFixed(2)} V
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. 双缝干涉
// ----------------------------------------------------------------------------

function DoubleSlitSim({ initial }: { initial?: Record<string, number | string> }) {
  const [lambda, setLambda] = useState(num(initial?.lambda, 600));
  const [d, setD] = useState(num(initial?.d, 0.2));
  const [L, setL] = useState(num(initial?.L, 1.0));

  // dy = lambda * L / d 单位 m → mm
  const lambdaM = lambda * 1e-9;
  const dM = d * 1e-3;
  const dyMm = ((lambdaM * L) / dM) * 1000;

  // 渲染条纹
  const stripes = useMemo(() => {
    const arr: number[] = [];
    const half = 5;
    for (let n = -half; n <= half; n++) {
      arr.push(n * dyMm);
    }
    return arr;
  }, [dyMm]);

  return (
    <div className="w-sim">
      <h4>
        <span>🌊</span>
        <span>双缝干涉 · 条纹间距</span>
      </h4>
      <div className="w-sim-grid">
        <svg viewBox="0 0 320 160" width="100%" height="160">
          <rect x={0} y={70} width={320} height={20} fill="#0d1424" />
          {/* 屏幕 */}
          {stripes.map((offsetMm, i) => {
            const offsetPx = offsetMm * 12; // 视觉放大
            const x = 160 + offsetPx;
            if (x < 0 || x > 320) return null;
            const intensity = Math.max(0, 1 - Math.abs(i - stripes.length / 2) * 0.05);
            return (
              <rect
                key={i}
                x={x - 4}
                y={70}
                width={8}
                height={20}
                fill={`hsl(${600 - lambda + 80}, 80%, ${50 * intensity + 20}%)`}
              />
            );
          })}
          <text x={160} y={120} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={12}>
            条纹间距 Δy = {dyMm.toFixed(2)} mm
          </text>
        </svg>
        <div className="w-sim-controls">
          <label>
            波长 λ = {lambda.toFixed(0)} nm
            <input
              type="range"
              min={380}
              max={780}
              step={10}
              value={lambda}
              onChange={(e) => setLambda(parseFloat(e.target.value))}
            />
          </label>
          <label>
            缝距 d = {d.toFixed(2)} mm
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={d}
              onChange={(e) => setD(parseFloat(e.target.value))}
            />
          </label>
          <label>
            屏距 L = {L.toFixed(2)} m
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={L}
              onChange={(e) => setL(parseFloat(e.target.value))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 4. 牛顿斜面滑块
// ----------------------------------------------------------------------------

function NewtonBlockSim({ initial }: { initial?: Record<string, number | string> }) {
  const [angle, setAngle] = useState(num(initial?.angle, 30));
  const [mu, setMu] = useState(num(initial?.mu, 0.1));
  const g = 9.8;
  const angleRad = (angle * Math.PI) / 180;
  const a = g * (Math.sin(angleRad) - mu * Math.cos(angleRad));
  const aDisplay = a > 0 ? a : 0;

  return (
    <div className="w-sim">
      <h4>
        <span>📐</span>
        <span>斜面滑块 · 牛顿第二定律</span>
      </h4>
      <div className="w-sim-grid">
        <svg viewBox="0 0 320 180" width="100%" height="180">
          {(() => {
            const x0 = 30;
            const y0 = 150;
            const x1 = 290;
            const y1 = y0 - (x1 - x0) * Math.tan(angleRad);
            return (
              <>
                <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="rgba(255,255,255,0.3)" />
                <polygon points={`${x0},${y0} ${x1},${y0} ${x1},${y1}`} fill="rgba(216,160,74,0.2)" stroke="#d8a04a" />
                {/* 滑块 */}
                <g transform={`translate(${(x0 + x1) / 2 - 20} ${(y0 + y1) / 2 - 20}) rotate(${-angle})`}>
                  <rect x={0} y={0} width={36} height={20} fill="#cccccc" />
                </g>
                <text x={160} y={170} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={12}>
                  加速度 a = {aDisplay.toFixed(2)} m/s² {a <= 0 ? '（静止：摩擦足以平衡）' : ''}
                </text>
              </>
            );
          })()}
        </svg>
        <div className="w-sim-controls">
          <label>
            倾角 = {angle.toFixed(0)}°
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={angle}
              onChange={(e) => setAngle(parseFloat(e.target.value))}
            />
          </label>
          <label>
            摩擦系数 μ = {mu.toFixed(2)}
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={mu}
              onChange={(e) => setMu(parseFloat(e.target.value))}
            />
          </label>
          <div className="w-sim-readout">
            a = g(sinθ − μ cosθ) = {a.toFixed(2)} m/s²
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}
