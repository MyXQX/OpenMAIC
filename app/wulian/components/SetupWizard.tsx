'use client';

import { useState, useEffect, useRef } from 'react';
import type { Chapter, StudentProfile, WulianPersonalizationInput } from '@/lib/wulian/types';
import { UploadPanel, type UploadedDoc } from './UploadPanel';

interface SetupWizardProps {
  chapter: Chapter;
  isGuest: boolean;
  onComplete: (classroomId: string) => void;
}

export function SetupWizard({ chapter, isGuest, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // 1. 画像属性
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [goals, setGoals] = useState<('exam' | 'interest' | 'research')[]>(['interest']);
  const [pace, setPace] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [grade, setGrade] = useState('大一理工科');

  // 2. 资料属性
  const [materialMode, setMaterialMode] = useState<'course' | 'mine' | 'compare'>('course');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);

  // 3. 模拟器选择
  const [selectedSimIds, setSelectedSimIds] = useState<string[]>([]);

  // 4. 生成状态
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'queued' | 'running' | 'completed' | 'failed' | 'idle'>('idle');
  const [jobStepName, setJobStepName] = useState('初始化生成中...');
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 推荐的模拟器
  const recommendedSim = chapter.knowledgePoints.find((kp) => kp.simulationId)?.simulationId;

  // 加载已有用户画像
  useEffect(() => {
    if (isGuest) return;
    setLoadingProfile(true);
    fetch('/api/wulian/profile')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.profile) {
          const p = data.profile as StudentProfile;
          setLevel(p.level);
          setGoals(p.goals);
          if (p.pacePreference) setPace(p.pacePreference);
          if (p.gradeOrMajor) setGrade(p.gradeOrMajor);
        }
      })
      .catch((e) => console.error('Failed to load profile:', e))
      .finally(() => setLoadingProfile(false));
  }, [isGuest]);

  // 根据章节关联的推荐模拟器默认选中它
  useEffect(() => {
    if (recommendedSim) {
      setSelectedSimIds([recommendedSim]);
    }
  }, [recommendedSim]);

  // 轮询进度
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/wulian/classroom/${jobId}`);
        const data = await res.json();
        if (res.ok && data.success && data.job) {
          const job = data.job;
          setJobStatus(job.status);
          setJobStepName(job.step || '执行中...');
          setJobProgress(job.progress || 0);

          if (job.status === 'completed') {
            clearInterval(pollTimerRef.current!);
            pollTimerRef.current = null;
            if (job.classroomId) {
              onComplete(job.classroomId);
            } else {
              setJobError('生成已完成，但未获取到实例 ID，请重试');
              setJobStatus('failed');
            }
          } else if (job.status === 'failed') {
            clearInterval(pollTimerRef.current!);
            pollTimerRef.current = null;
            setJobError(job.error || '定制课堂生成失败');
          }
        }
      } catch (e) {
        console.error('Polling failed:', e);
      }
    };

    pollTimerRef.current = setInterval(poll, 1500);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [jobId, onComplete]);

  // 提交生成任务
  const handleStartGenerate = async () => {
    setJobStatus('queued');
    setJobProgress(5);
    setJobStepName('排队队列中...');
    setJobError(null);

    const inputPayload: WulianPersonalizationInput = {
      chapterId: chapter.id,
      studentProfile: {
        userId: isGuest ? 'guest' : '',
        gradeOrMajor: grade,
        level,
        goals,
        pacePreference: pace,
        updatedAt: Date.now(),
      },
      materialMode,
      uploadedDocIds: docs.map((d) => d.docId),
      selectedSimulatorIds: selectedSimIds,
      extraInstructions: `请老师多使用公式推导；注意语气为科学家口吻，严谨亲切。`,
    };

    try {
      const res = await fetch('/api/wulian/classroom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputPayload),
      });
      const data = await res.json();
      if (res.ok && data.success && data.jobId) {
        setJobId(data.jobId);
        setJobStatus('running');
      } else {
        setJobError(data.error || '创建课堂失败');
        setJobStatus('failed');
      }
    } catch (e) {
      setJobError('网络连接失败，请重试');
      setJobStatus('failed');
    }
  };

  const handleGoalToggle = (goal: 'exam' | 'interest' | 'research') => {
    if (goals.includes(goal)) {
      if (goals.length > 1) setGoals(goals.filter((g) => g !== goal));
    } else {
      setGoals([...goals, goal]);
    }
  };

  const handleSimToggle = (id: string) => {
    if (selectedSimIds.includes(id)) {
      setSelectedSimIds(selectedSimIds.filter((x) => x !== id));
    } else {
      setSelectedSimIds([...selectedSimIds, id]);
    }
  };

  // 生成进行中的全屏 Overlay 或者是卡片展示
  if (jobStatus !== 'idle') {
    return (
      <div className="w-wizard-progress-card animate-fade-in">
        <h2>正在定制您的专属物理实验课堂</h2>
        <p className="lead-subtitle">
          科学家 {chapter.primaryScientist} 正在分析您的学习偏好并生成 PPT 课件结构...
        </p>

        {/* 环形/条形进度条 */}
        <div className="progress-bar-wrapper">
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${jobProgress}%` }} />
          </div>
          <div className="progress-info">
            <span>{jobStepName}</span>
            <span className="percent">{jobProgress}%</span>
          </div>
        </div>

        {/* 详情步骤日志 */}
        <div className="wizard-progress-steps">
          <div className={`step-item ${jobProgress >= 10 ? 'done' : 'active'}`}>
            1. 初始化生成条件
          </div>
          <div className={`step-item ${jobProgress >= 30 ? 'done' : jobProgress >= 10 ? 'active' : ''}`}>
            2. 大纲目录生成与评估 (RAG 注入)
          </div>
          <div className={`step-item ${jobProgress >= 65 ? 'done' : jobProgress >= 30 ? 'active' : ''}`}>
            3. PPT 与模拟器可交互场景内容填充
          </div>
          <div className={`step-item ${jobProgress >= 90 ? 'done' : jobProgress >= 65 ? 'active' : ''}`}>
            4. 语音/TTS 媒体课件资源渲染
          </div>
          <div className={`step-item ${jobProgress === 100 ? 'done' : jobProgress >= 90 ? 'active' : ''}`}>
            5. 完成定制并初始化播放器
          </div>
        </div>

        {jobStatus === 'failed' && (
          <div className="error-box">
            <p>❌ 定制生成失败: {jobError}</p>
            <button type="button" onClick={() => setJobStatus('idle')} className="retry-btn">
              重新开始定制
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-setup-wizard-card animate-fade-in">
      <div className="wizard-header">
        <div className="step-dots">
          <span className={`dot ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>1</span>
          <span className={`dot ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>2</span>
          <span className={`dot ${step === 3 ? 'active' : step > 3 ? 'done' : ''}`}>3</span>
          <span className={`dot ${step === 4 ? 'active' : ''}`}>4</span>
        </div>
        <h2>AI 物理课堂定制向导</h2>
        <p className="chapter-summary">针对《{chapter.title}》章节的专属课堂配置</p>
      </div>

      <div className="wizard-body">
        {/* Step 1: 用户画像输入 */}
        {step === 1 && (
          <div className="step-pane animate-slide-in">
            <h3>第一步：您的物理学基础与偏好</h3>
            {loadingProfile ? (
              <p>加载画像中...</p>
            ) : (
              <div className="wizard-form-grid">
                <label className="form-item">
                  <span className="label-text">您的年级 / 专业背景</span>
                  <input
                    type="text"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    placeholder="例如：大一理工科、物理爱好者..."
                  />
                </label>

                <div className="form-item">
                  <span className="label-text">物理底子水平</span>
                  <div className="radio-group">
                    <button
                      type="button"
                      className={level === 'beginner' ? 'active' : ''}
                      onClick={() => setLevel('beginner')}
                    >
                      入门 (基础知识薄弱，需要循序渐进)
                    </button>
                    <button
                      type="button"
                      className={level === 'intermediate' ? 'active' : ''}
                      onClick={() => setLevel('intermediate')}
                    >
                      进阶 (已具备微积分与力学电磁底子)
                    </button>
                    <button
                      type="button"
                      className={level === 'advanced' ? 'active' : ''}
                      onClick={() => setLevel('advanced')}
                    >
                      高级 (熟练掌握物理方程，探求严谨推导)
                    </button>
                  </div>
                </div>

                <div className="form-item">
                  <span className="label-text">学习物理的主要目标 (多选)</span>
                  <div className="checkbox-group">
                    <button
                      type="button"
                      className={goals.includes('interest') ? 'active' : ''}
                      onClick={() => handleGoalToggle('interest')}
                    >
                      🌟 兴趣导向 (直观图像与科普)
                    </button>
                    <button
                      type="button"
                      className={goals.includes('exam') ? 'active' : ''}
                      onClick={() => handleGoalToggle('exam')}
                    >
                      📝 考试检验 (侧重公式与概念正误)
                    </button>
                    <button
                      type="button"
                      className={goals.includes('research') ? 'active' : ''}
                      onClick={() => handleGoalToggle('research')}
                    >
                      🔬 科研准备 (严密推导与物理史实)
                    </button>
                  </div>
                </div>

                <div className="form-item">
                  <span className="label-text">讲解偏好节奏</span>
                  <div className="radio-group row">
                    <button
                      type="button"
                      className={pace === 'slow' ? 'active' : ''}
                      onClick={() => setPace('slow')}
                    >
                      慢速详尽
                    </button>
                    <button
                      type="button"
                      className={pace === 'normal' ? 'active' : ''}
                      onClick={() => setPace('normal')}
                    >
                      中速标准
                    </button>
                    <button
                      type="button"
                      className={pace === 'fast' ? 'active' : ''}
                      onClick={() => setPace('fast')}
                    >
                      快速精炼
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: 资料来源定制 */}
        {step === 2 && (
          <div className="step-pane animate-slide-in">
            <h3>第二步：个性化专属教学参考资料</h3>

            {isGuest && (
              <div className="w-guest-alert-banner">
                <span>⚠️ 您目前处于<b>访客模式</b>。受安全策略限制，访客模式下禁止上传外部文档，且无法选择「我的资料」或「对照」定制模式。如需使用此功能，请先登录账号。</span>
              </div>
            )}

            <div className="form-item" style={{ marginBottom: 20 }}>
              <span className="label-text">定制资料模式</span>
              <div className="radio-group">
                <button
                  type="button"
                  className={materialMode === 'course' ? 'active' : ''}
                  onClick={() => setMaterialMode('course')}
                >
                  📘 纯内置教材 (使用物理课本标准语料进行生成和讲解)
                </button>
                <button
                  type="button"
                  className={`mode-btn-disabled-guest ${materialMode === 'mine' ? 'active' : ''}`}
                  disabled={isGuest}
                  onClick={() => !isGuest && setMaterialMode('mine')}
                >
                  👤 纯我的资料 (仅参考您上传的个人讲义/笔记)
                  {isGuest && <span className="lock-tag">需登录</span>}
                </button>
                <button
                  type="button"
                  className={`mode-btn-disabled-guest ${materialMode === 'compare' ? 'active' : ''}`}
                  disabled={isGuest}
                  onClick={() => !isGuest && setMaterialMode('compare')}
                >
                  ⚖️ 对照学习模式 (对比内置标准课本和您的讲义，突出异同)
                  {isGuest && <span className="lock-tag">需登录</span>}
                </button>
              </div>
            </div>

            <div className="form-item">
              <span className="label-text">上传补充讲义 (PDF / MD / TXT)</span>
              <UploadPanel docs={docs} onChange={setDocs} isGuest={isGuest} />
            </div>
          </div>
        )}

        {/* Step 3: 选择章节模拟器 */}
        {step === 3 && (
          <div className="step-pane animate-slide-in">
            <h3>第三步：为课件嵌入物理虚拟模拟器</h3>
            <p style={{ fontSize: 13, color: 'var(--w-ink-soft)', marginBottom: 16 }}>
              AI 教师会在讲解指定概念时自动切出这些模拟器，并在主区域呈现，支持让您或科学家调整参数。
            </p>

            <div className="simulators-selection-list">
              {[
                {
                  id: 'flux-loop-slider',
                  title: '电磁感应 · 线圈滑块与磁通量',
                  desc: '演示线圈在磁场中平移、旋转时的通量变化，展示感应电流的方向和电动势。',
                  rec: chapter.id === 'em-induction',
                },
                {
                  id: 'photoelectric',
                  title: '光电效应 · 光频率与逸出功',
                  desc: '演示不同光频率、光强照射下，阴极板是否逸出光电子，测量遏止电压。',
                  rec: chapter.id === 'modern-physics',
                },
                {
                  id: 'double-slit',
                  title: '双缝干涉 · 杨氏双缝波动光学',
                  desc: '模拟改变波长、缝距和屏距时，干涉条纹间距的变化，感受光的波动性。',
                  rec: chapter.id === 'optics',
                },
                {
                  id: 'newton-block',
                  title: '斜面滑块 · 摩擦力与牛顿定律',
                  desc: '演示在不同斜面倾角和摩擦系数下，滑块静止、匀速或加速下滑受力情况。',
                  rec: chapter.id === 'mechanics',
                },
              ].map((s) => (
                <div
                  key={s.id}
                  className={`sim-select-row${selectedSimIds.includes(s.id) ? ' selected' : ''}`}
                  onClick={() => handleSimToggle(s.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedSimIds.includes(s.id)}
                    onChange={() => {}} // 由行 onClick 统一处理
                    style={{ marginRight: 12, accentColor: 'var(--w-accent)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {s.title}
                      {s.rec && <span className="rec-badge">本章推荐</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--w-ink-soft)', marginTop: 4 }}>
                      {s.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: 确认信息 */}
        {step === 4 && (
          <div className="step-pane animate-slide-in confirm-pane">
            <h3>第四步：确认定制信息并启动生成</h3>
            <div className="confirm-summary-table">
              <div className="summary-row">
                <span className="label">定制课目标</span>
                <span className="val">{chapter.title}</span>
              </div>
              <div className="summary-row">
                <span className="label">学生年级</span>
                <span className="val">{grade || '大一理工科'}</span>
              </div>
              <div className="summary-row">
                <span className="label">基础底子</span>
                <span className="val">
                  {level === 'beginner' ? '入门' : level === 'intermediate' ? '进阶' : '高级'}
                </span>
              </div>
              <div className="summary-row">
                <span className="label">参考资料</span>
                <span className="val">
                  {materialMode === 'course'
                    ? '📘 纯内置课本教材'
                    : materialMode === 'mine'
                      ? `👤 上传资料 (共 ${docs.length} 篇)`
                      : `⚖️ 对照模式 (课本 + ${docs.length} 篇上传资料)`}
                </span>
              </div>
              <div className="summary-row">
                <span className="label">嵌入物理实验台</span>
                <span className="val">
                  {selectedSimIds.length > 0
                    ? `已嵌入 ${selectedSimIds.length} 个模拟器 (${selectedSimIds.join(', ')})`
                    : '未选用模拟器'}
                </span>
              </div>
              <div className="summary-row">
                <span className="label">课堂授课语言</span>
                <span className="val">中文 (科学家严谨口吻)</span>
              </div>
            </div>

            <div className="note-alert">
              <span>💡 AI 会根据以上画像在后台使用大模型进行两阶段大纲编写、幻灯片内容创作和科学家配音生成，整个过程大概需要 15-30 秒。请在生成过程中保持本页面开启。</span>
            </div>
          </div>
        )}
      </div>

      <div className="wizard-footer">
        {step > 1 && (
          <button type="button" className="prev-btn" onClick={() => setStep(step - 1)}>
            上一步
          </button>
        )}
        {step < 4 ? (
          <button type="button" className="next-btn" onClick={() => setStep(step + 1)}>
            下一步
          </button>
        ) : (
          <button type="button" className="generate-btn" onClick={handleStartGenerate}>
            🚀 开始定制生成
          </button>
        )}
      </div>

      <style jsx global>{`
        .w-setup-wizard-card, .w-wizard-progress-card {
          max-width: 680px;
          margin: 60px auto;
          background: var(--w-panel);
          border: 1px solid var(--w-border);
          border-radius: var(--w-radius);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
          padding: 28px 36px;
        }

        .wizard-header {
          border-bottom: 1px dashed var(--w-border);
          padding-bottom: 18px;
          margin-bottom: 22px;
          text-align: center;
        }
        .step-dots {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .step-dots .dot {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink-soft);
          font-size: 11px;
          font-weight: bold;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s ease;
        }
        .step-dots .dot.active {
          background: var(--w-accent);
          color: #1a1a1a;
          border-color: var(--w-accent);
          box-shadow: 0 0 10px rgba(216, 160, 74, 0.4);
        }
        .step-dots .dot.done {
          background: rgba(108, 209, 135, 0.2);
          color: var(--w-good);
          border-color: var(--w-good);
        }

        .wizard-header h2 {
          font-size: 22px;
          margin: 0 0 4px;
          font-weight: 700;
        }
        .chapter-summary {
          font-size: 13px;
          color: var(--w-ink-soft);
          margin: 0;
        }

        .wizard-body {
          min-height: 320px;
        }
        .step-pane h3 {
          font-size: 16px;
          margin: 0 0 16px;
          color: var(--w-accent-soft);
        }

        .wizard-form-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .label-text {
          font-size: 13px;
          font-weight: 500;
          color: var(--w-ink);
        }
        .form-item input[type='text'] {
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          outline: none;
        }
        .form-item input[type='text']:focus {
          border-color: var(--w-accent);
        }

        .radio-group, .checkbox-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .radio-group.row {
          flex-direction: row;
        }
        .radio-group button, .checkbox-group button {
          text-align: left;
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .radio-group.row button {
          flex: 1;
          text-align: center;
        }
        .radio-group button:hover, .checkbox-group button:hover {
          border-color: var(--w-accent-soft);
          background: rgba(255, 255, 255, 0.02);
        }
        .radio-group button.active, .checkbox-group button.active {
          border-color: var(--w-accent);
          background: rgba(216, 160, 74, 0.08);
          color: var(--w-accent-soft);
          font-weight: 500;
        }
        .mode-btn-disabled-guest {
          opacity: 0.55;
          cursor: not-allowed;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .mode-btn-disabled-guest .lock-tag {
          font-size: 10px;
          background: rgba(239, 108, 140, 0.15);
          color: var(--w-bad);
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid rgba(239, 108, 140, 0.3);
        }

        .w-guest-alert-banner {
          background: rgba(244, 154, 90, 0.12);
          border: 1px solid rgba(244, 154, 90, 0.3);
          color: var(--w-warn);
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.6;
          margin-bottom: 16px;
        }

        .simulators-selection-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sim-select-row {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sim-select-row:hover {
          border-color: var(--w-accent-soft);
        }
        .sim-select-row.selected {
          border-color: var(--w-accent);
          background: rgba(216, 160, 74, 0.08);
        }
        .rec-badge {
          font-size: 10px;
          background: rgba(108, 209, 135, 0.15);
          color: var(--w-good);
          padding: 1px 6px;
          border-radius: 4px;
          margin-left: 8px;
          border: 1px solid rgba(108, 209, 135, 0.3);
        }

        .confirm-summary-table {
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 18px;
        }
        .summary-row {
          display: flex;
          border-bottom: 1px solid var(--w-border);
          padding: 10px 14px;
          font-size: 13px;
        }
        .summary-row:last-child {
          border-bottom: 0;
        }
        .summary-row .label {
          width: 140px;
          color: var(--w-ink-soft);
        }
        .summary-row .val {
          flex: 1;
          color: var(--w-ink);
          font-weight: 500;
        }

        .note-alert {
          background: rgba(216, 160, 74, 0.08);
          border: 1px solid rgba(216, 160, 74, 0.3);
          color: var(--w-accent-soft);
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.5;
        }

        .wizard-footer {
          margin-top: 24px;
          border-top: 1px solid var(--w-border);
          padding-top: 18px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        .prev-btn, .next-btn, .generate-btn {
          border: 0;
          border-radius: 8px;
          padding: 10px 22px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .prev-btn {
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
        }
        .prev-btn:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .next-btn {
          background: var(--w-panel-2);
          border: 1px solid var(--w-accent-soft);
          color: var(--w-accent-soft);
        }
        .next-btn:hover {
          background: rgba(216, 160, 74, 0.06);
        }
        .generate-btn {
          background: var(--w-accent);
          color: #1a1a1a;
          box-shadow: 0 4px 14px rgba(216, 160, 74, 0.3);
        }
        .generate-btn:hover {
          background: var(--w-accent-soft);
        }
        .prev-btn:active, .next-btn:active, .generate-btn:active {
          transform: scale(0.97);
        }

        /* 进度页面样式 */
        .progress-bar-wrapper {
          margin: 32px 0 24px;
        }
        .progress-bar-track {
          height: 10px;
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--w-accent), var(--w-good));
          border-radius: 999px;
          transition: width 0.4s ease;
        }
        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: var(--w-ink-soft);
        }
        .progress-info .percent {
          font-weight: 700;
          color: var(--w-ink);
        }
        .wizard-progress-steps {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          border-radius: 10px;
          padding: 18px;
        }
        .step-item {
          font-size: 13px;
          color: var(--w-ink-soft);
          display: flex;
          align-items: center;
          gap: 8px;
          opacity: 0.5;
        }
        .step-item.active {
          color: var(--w-accent-soft);
          font-weight: 600;
          opacity: 1;
        }
        .step-item.done {
          color: var(--w-good);
          opacity: 0.85;
        }
        .step-item.done::before {
          content: '✓';
          font-weight: bold;
        }
        .error-box {
          margin-top: 20px;
          padding: 12px;
          background: rgba(239, 108, 140, 0.1);
          border: 1px solid rgba(239, 108, 140, 0.3);
          border-radius: 8px;
          font-size: 13px;
          color: var(--w-bad);
          text-align: center;
        }
        .retry-btn {
          margin-top: 8px;
          background: var(--w-bad);
          color: white;
          border: 0;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
