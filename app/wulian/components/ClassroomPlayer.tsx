'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Chapter, ScientistPersona, ChatMessage, AgentTurn } from '@/lib/wulian/types';
import type { WulianClassroomInstance } from '@/lib/wulian/types';
import { useWulianChat } from './useWulianChat';
import { ScientistAvatar, RoleAvatar } from './Avatar';
import { Whiteboard } from './Whiteboard';
import { VideoProgressBar } from './VideoProgressBar';
import { SubtitleOverlay } from './SubtitleOverlay';
import { ControlPanel } from './ControlPanel';
import { useAuth } from '../hooks/useAuth';

// Rework V2 requirements
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { Whiteboard as MaicWhiteboard } from '@/components/whiteboard';
import { SimulatorSceneRenderer } from './SimulatorSceneRenderer';
import { db } from '@/lib/utils/database';

// 复用 MAIC 内核
import { useStageStore } from '@/lib/store';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { PlaybackEngine } from '@/lib/playback/engine';
import type { EngineMode } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { SpeechAction } from '@/lib/types/action';

interface ClassroomPlayerProps {
  chapter: Chapter;
  teacher: ScientistPersona;
  secondary: ScientistPersona | null;
  instance: WulianClassroomInstance;
  isGuest: boolean;
}

export default function ClassroomPlayer({
  chapter,
  teacher,
  secondary,
  instance,
  isGuest,
}: ClassroomPlayerProps) {
  const [tab, setTab] = useState<'materials' | 'prompts' | 'chat'>('chat');
  const [docs, setDocs] = useState<any[]>(
    instance.personalization.uploadedDocIds.map((id) => ({
      docId: id,
      filename: `已加载资料-${id.slice(0, 5)}`,
      summary: '本堂课定制参考资料',
      chunkCount: 10,
      hasEmbedding: true,
      uploadedAt: Date.now(),
    }))
  );
  const [materialMode, setMaterialMode] = useState<'course' | 'mine' | 'compare'>(
    instance.personalization.materialMode
  );

  const docIds = useMemo(() => docs.map((d) => d.docId), [docs]);

  // 1. 初始化对话 Hook
  const chat = useWulianChat({
    chapterId: chapter.id,
    uploadedDocIds: docIds,
    mode: materialMode,
  });

  // 2. Playback state
  const [engineMode, setEngineMode] = useState<EngineMode>('idle');
  const [lectureSpeech, setLectureSpeech] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [activeSpeakerName, setActiveSpeakerName] = useState<string | null>(null);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [controlledParams, setControlledParams] = useState<Record<string, number>>({});

  // Canvas store & Settings store states
  const whiteboardOpen = useCanvasStore((s) => s.whiteboardOpen);
  const setWhiteboardOpen = useCanvasStore((s) => s.setWhiteboardOpen);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const setTTSEnabled = useSettingsStore((s) => s.setTTSEnabled);
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const setTTSMuted = useSettingsStore((s) => s.setTTSMuted);

  // 课堂转写流，包含老师正常上课的发言
  const [lectureMessages, setLectureMessages] = useState<ChatMessage[]>([]);

  // 3. 引用引擎
  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioPlayerRef = useRef<any>(null);

  const { scenes, currentSceneId, setCurrentSceneId } = useStageStore();
  const currentScene = useStageStore((s) => s.getCurrentScene());

  // 合并上课转写和 Q&A 提问
  const mergedMessages = useMemo(() => {
    return [...lectureMessages, ...chat.messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [lectureMessages, chat.messages]);

  // 自定义添加上课发言转写
  const appendLectureMessage = useCallback(
    (text: string, speakerRole: 'teacher' | 'assistant' | 'classmate', name: string) => {
      const spId =
        speakerRole === 'teacher'
          ? `teacher_${teacher.id}`
          : speakerRole === 'assistant'
            ? 'assistant_xiaomai'
            : 'classmate_xiaoheng';

      setLectureMessages((prev) => {
        // 去重
        const isDup = prev.some((m) => m.content && 'speech' in m.content && m.content.speech === text && Date.now() - m.timestamp < 1500);
        if (isDup) return prev;

        return [
          ...prev,
          {
            id: `lecture-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            role: 'agent',
            content: {
              speakerRole,
              speakerId: spId,
              speakerName: name,
              speech: text,
            } as AgentTurn,
            timestamp: Date.now(),
          },
        ];
      });
    },
    [teacher.id]
  );

  // 4. 将实例数据注入 OpenMAIC stage store
  useEffect(() => {
    if (instance) {
      // Pre-process scenes to ensure all speech actions have a stable audioId
      const processedScenes = instance.scenes.map((scene) => {
        if (!scene.actions) return scene;
        const processedActions = scene.actions.map((act) => {
          if (act.type === 'speech') {
            const speechAct = act as SpeechAction;
            if (!speechAct.audioId) {
              speechAct.audioId = `wulian_tts_${scene.id}_${act.id}`;
            }
          }
          return act;
        });
        return { ...scene, actions: processedActions };
      });

      useStageStore.getState().setStage(instance.stage);
      useStageStore.getState().setScenes(processedScenes);
      useStageStore.getState().setCurrentSceneId(processedScenes[0]?.id || null);

      // 读取 PlaybackSnapshot 恢复进度
      const saved = localStorage.getItem(`wulian_snapshot_${instance.id}`);
      if (saved) {
        try {
          const snap = JSON.parse(saved);
          if (snap && typeof snap.sceneIndex === 'number') {
            const targetScene = processedScenes[snap.sceneIndex];
            if (targetScene) {
              useStageStore.getState().setCurrentSceneId(targetScene.id);
            }
          }
        } catch (e) {
          console.error('Failed to restore snapshot:', e);
        }
      }
    }
    return () => {
      useStageStore.getState().clearStore();
    };
  }, [instance]);

  // Reset Canvas store state on component unmount
  useEffect(() => {
    return () => {
      useCanvasStore.getState().resetCanvasState();
    };
  }, []);

  // 5. 实例化音频与回放引擎
  useEffect(() => {
    const audio = createAudioPlayer();

    // Wrap play to handle on-the-fly TTS synthesis
    const originalPlay = audio.play.bind(audio);
    audio.play = async (audioId: string, audioUrl?: string) => {
      if (audioUrl) {
        return originalPlay(audioId, audioUrl);
      }

      const settings = useSettingsStore.getState();
      if (!settings.ttsEnabled) {
        return false;
      }

      if (settings.ttsProviderId === 'browser-native-tts') {
        return false;
      }

      const cached = await db.audioFiles.get(audioId);
      if (cached) {
        return originalPlay(audioId);
      }

      let text = '';
      let voice = settings.ttsVoice || 'zh-CN-XiaoxiaoNeural';
      let speed = 1.0;

      const allScenes = useStageStore.getState().scenes;
      let foundAction = false;
      for (const scene of allScenes) {
        const act = scene.actions?.find(
          (a): a is SpeechAction => a.type === 'speech' && a.audioId === audioId
        );
        if (act) {
          text = act.text;
          if (act.voice) voice = act.voice;
          if (act.speed) speed = act.speed;
          foundAction = true;
          break;
        }
      }

      if (!foundAction || !text) {
        return originalPlay(audioId);
      }

      try {
        const response = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            audioId,
            ttsProviderId: settings.ttsProviderId,
            ttsVoice: voice,
            ttsSpeed: speed,
            ttsApiKey: settings.ttsProvidersConfig[settings.ttsProviderId]?.apiKey,
            ttsBaseUrl: settings.ttsProvidersConfig[settings.ttsProviderId]?.baseUrl,
            ttsProviderOptions: settings.ttsProvidersConfig[settings.ttsProviderId]?.providerOptions,
          }),
        });

        if (!response.ok) {
          throw new Error(`TTS API returned status ${response.status}`);
        }

        const data = await response.json();
        if (!data.success || !data.base64) {
          throw new Error(data.error || 'TTS API failed to generate audio');
        }

        const binaryStr = window.atob(data.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: `audio/${data.format || 'mp3'}` });

        await db.audioFiles.put({
          id: audioId,
          blob,
          format: data.format || 'mp3',
          text,
          voice,
          createdAt: Date.now(),
        });

        return originalPlay(audioId);
      } catch (err) {
        console.error('Failed on-the-fly TTS synthesis:', err);
        return false;
      }
    };

    audioPlayerRef.current = audio;
    return () => {
      audioPlayerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!currentScene || !audioPlayerRef.current) return;

    if (engineRef.current) {
      engineRef.current.stop();
    }

    setPlaybackCompleted(false);
    setCurrentActionIndex(0);
    setControlledParams({});

    const actionEngine = new ActionEngine(
      useStageStore,
      audioPlayerRef.current,
      (type, payload) => {
        if (type === 'SET_WIDGET_STATE' && payload?.state) {
          const numericParams: Record<string, number> = {};
          for (const [k, v] of Object.entries(payload.state)) {
            const n = parseFloat(String(v));
            if (Number.isFinite(n)) numericParams[k] = n;
          }
          setControlledParams(numericParams);
        }
      }
    );

    const engine = new PlaybackEngine([currentScene], actionEngine, audioPlayerRef.current, {
      onModeChange: (mode) => {
        setEngineMode(mode);
      },
      onSpeechStart: (text) => {
        setLectureSpeech(text);
      },
      onSpeechEnd: () => {
        // 完成后保留当前字幕
      },
      onSpeakerChange: (role) => {
        if (role === 'teacher') {
          setActiveSpeakerId(`teacher_${teacher.id}`);
          setActiveSpeakerName(`${teacher.name} 教授`);
        } else if (role === 'assistant') {
          setActiveSpeakerId('assistant_xiaomai');
          setActiveSpeakerName('小麦 助教');
        } else {
          setActiveSpeakerId('classmate_xiaoheng');
          setActiveSpeakerName('小恒 同学');
        }
      },
      getPlaybackSpeed: () => playbackSpeed,
      onProgress: (snap) => {
        setCurrentActionIndex(snap.actionIndex);
        // 持久化 snapshot
        const globalIdx = scenes.findIndex((s) => s.id === currentSceneId);
        localStorage.setItem(
          `wulian_snapshot_${instance.id}`,
          JSON.stringify({
            sceneIndex: globalIdx >= 0 ? globalIdx : 0,
            actionIndex: snap.actionIndex,
            sceneId: currentSceneId,
          })
        );
      },
      onComplete: () => {
        setPlaybackCompleted(true);
        // 自动播放下一页
        const curIdx = scenes.findIndex((s) => s.id === currentSceneId);
        if (curIdx >= 0 && curIdx < scenes.length - 1) {
          setTimeout(() => {
            setCurrentSceneId(scenes[curIdx + 1].id);
          }, 2000);
        }
      },
    });

    engineRef.current = engine;

    // 根据保存的 actionIndex 尝试恢复
    const saved = localStorage.getItem(`wulian_snapshot_${instance.id}`);
    if (saved) {
      try {
        const snap = JSON.parse(saved);
        const globalIdx = scenes.findIndex((s) => s.id === currentSceneId);
        if (snap && snap.sceneIndex === globalIdx && typeof snap.actionIndex === 'number') {
          engine.restoreFromSnapshot({
            sceneIndex: 0,
            actionIndex: snap.actionIndex,
            consumedDiscussions: [],
            sceneId: currentSceneId!,
          });
        }
      } catch (e) {}
    }

    return () => {
      engine.stop();
    };
  }, [currentScene, playbackSpeed, scenes, currentSceneId, instance.id, teacher.id, teacher.name]);

  // 当老师开始说话时，将发言内容加到课堂互动 Tab 的时间轴中
  useEffect(() => {
    if (lectureSpeech && activeSpeakerId) {
      let role: 'teacher' | 'assistant' | 'classmate' = 'teacher';
      if (activeSpeakerId === 'assistant_xiaomai') role = 'assistant';
      if (activeSpeakerId === 'classmate_xiaoheng') role = 'classmate';

      appendLectureMessage(lectureSpeech, role, activeSpeakerName || '主讲');
    }
  }, [lectureSpeech, activeSpeakerId, activeSpeakerName, appendLectureMessage]);

  // 播放暂停动作
  const handlePlayPause = useCallback(() => {
    if (!engineRef.current) return;
    const mode = engineRef.current.getMode();
    if (mode === 'playing') {
      engineRef.current.pause();
    } else if (mode === 'paused') {
      engineRef.current.resume();
    } else {
      setPlaybackCompleted(false);
      engineRef.current.start();
    }
  }, []);

  const handlePrevScene = useCallback(() => {
    const curIdx = scenes.findIndex((s) => s.id === currentSceneId);
    if (curIdx > 0) {
      setCurrentSceneId(scenes[curIdx - 1].id);
    }
  }, [scenes, currentSceneId, setCurrentSceneId]);

  const handleNextScene = useCallback(() => {
    const curIdx = scenes.findIndex((s) => s.id === currentSceneId);
    if (curIdx < scenes.length - 1) {
      setCurrentSceneId(scenes[curIdx + 1].id);
    }
  }, [scenes, currentSceneId, setCurrentSceneId]);

  const handleSeekScene = useCallback(
    (sceneId: string) => {
      setCurrentSceneId(sceneId);
    },
    [setCurrentSceneId]
  );

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  // 6. Q&A 发送提示词
  const handleSendPrompt = async (text: string) => {
    // 暂停正常 PPT 播放
    if (engineRef.current && engineRef.current.getMode() === 'playing') {
      engineRef.current.pause();
    }
    setTab('chat');
    await chat.send(text);
  };

  // 决定 SubtitleOverlay 的显示数据：优先显示讨论，其次为课件语音
  const activeSubtitle = useMemo(() => {
    if (chat.loading || chat.activeSpeakerId) {
      // 正在进行 Q&A 回答，流式解析最后一条消息
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg && lastMsg.role === 'agent') {
        const turn = lastMsg.content as AgentTurn;
        return {
          speakerName: turn.speakerName,
          speechText: turn.speech || '（正在构思回答中...）',
          activeSpeakerId: turn.speakerId,
        };
      }
    }
    if (engineMode === 'playing' && lectureSpeech) {
      return {
        speakerName: activeSpeakerName,
        speechText: lectureSpeech,
        activeSpeakerId: activeSpeakerId,
      };
    }
    return null;
  }, [chat.loading, chat.activeSpeakerId, chat.messages, engineMode, lectureSpeech, activeSpeakerName, activeSpeakerId]);

  const fallbackSim = chapter.knowledgePoints.find((kp) => kp.simulationId)?.simulationId;

  return (
    <div className="w-lesson">
      {/* === 左侧：章节纲要与科学家队伍 === */}
      <aside className="w-pane w-sidebar">
        <div className="w-pane-header">
          <Link href="/wulian" className="w-back">
            ← 离开课堂
          </Link>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{chapter.subject}</span>
        </div>
        <div className="w-pane-body">
          <h3>{chapter.title}</h3>
          <small>{chapter.summary}</small>

          <div style={{ marginTop: 18, fontSize: 12, color: 'var(--w-ink-soft)', fontWeight: 500 }}>
            本堂科学家导师
          </div>
          <div className="w-roster">
            <div className="w-roster-row">
              <ScientistAvatar persona={teacher} />
              <div>
                <div className="name">
                  {teacher.name}
                  {activeSubtitle?.activeSpeakerId?.startsWith('teacher_') && (
                    <span className="w-speaking-dot" />
                  )}
                </div>
                <div className="role">{teacher.field} · 主讲</div>
              </div>
            </div>
            {secondary && (
              <div className="w-roster-row">
                <ScientistAvatar persona={secondary} size="sm" />
                <div>
                  <div className="name">
                    {secondary.name}
                    {activeSubtitle?.activeSpeakerId?.startsWith('teacher_') &&
                      activeSubtitle?.activeSpeakerId.endsWith(secondary.id) && (
                        <span className="w-speaking-dot" />
                      )}
                  </div>
                  <div className="role">{secondary.field} · 协讲</div>
                </div>
              </div>
            )}
            <div className="w-roster-row">
              <RoleAvatar role="assistant" size="sm" />
              <div>
                <div className="name">
                  小麦助教
                  {activeSubtitle?.activeSpeakerId === 'assistant_xiaomai' && (
                    <span className="w-speaking-dot" />
                  )}
                </div>
                <div className="role">答疑助手</div>
              </div>
            </div>
            <div className="w-roster-row">
              <RoleAvatar role="classmate" size="sm" />
              <div>
                <div className="name">
                  小恒同学
                  {activeSubtitle?.activeSpeakerId === 'classmate_xiaoheng' && (
                    <span className="w-speaking-dot" />
                  )}
                </div>
                <div className="role">学术提问同伴</div>
              </div>
            </div>
          </div>

          <div className="w-objectives">
            <strong style={{ color: 'var(--w-ink)' }}>定制课目标</strong>
            <ol>
              {chapter.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          </div>
        </div>
      </aside>

      {/* === 中间：PPT 播放主区 + Subtitle Overlay + Whiteboard === */}
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 14 }}>
        {/* PPT Slide AspectRatio Container */}
        <div
          className="w-player-screen-wrapper"
          style={{
            position: 'relative',
            aspectRatio: '16/9',
            background: '#070c16',
            border: '1px solid var(--w-border)',
            borderRadius: 'var(--w-radius)',
            overflow: 'hidden',
          }}
        >
          {currentScene ? (
            <div className="absolute inset-0">
              {currentScene.type === 'interactive' ? (
                <SimulatorSceneRenderer
                  content={currentScene.content as any}
                  controlledParams={controlledParams}
                />
              ) : (
                <SceneProvider>
                  <SceneRenderer scene={currentScene} mode="playback" />
                </SceneProvider>
              )}
            </div>
          ) : (
            <div className="w-loading-placeholder">
              <div className="spinner" />
              <span>正在加载章节内容...</span>
            </div>
          )}

          {/* 白板覆盖层 */}
          <div className="absolute inset-0 z-[110] pointer-events-none">
            <SceneProvider>
              <MaicWhiteboard isOpen={whiteboardOpen} onClose={() => setWhiteboardOpen(false)} />
            </SceneProvider>
          </div>

          {/* TTS 与 白板 控制按钮 */}
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 120,
              zIndex: 115,
              display: 'flex',
              gap: 8,
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={() => {
                const nextVal = !ttsEnabled;
                setTTSEnabled(nextVal);
                setTTSMuted(!nextVal);
                audioPlayerRef.current?.setMuted(!nextVal);
              }}
              style={{
                fontSize: 12,
                color: 'var(--w-ink)',
                background: ttsEnabled ? 'rgba(216, 160, 74, 0.25)' : 'rgba(13,20,36,0.6)',
                border: ttsEnabled ? '1px solid var(--w-accent)' : '1px solid var(--w-border)',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 500,
                backdropFilter: 'blur(8px)',
                transition: 'all 0.2s',
              }}
            >
              {ttsEnabled ? '🔊 语音: 开启' : '🔇 语音: 关闭'}
            </button>

            <button
              onClick={() => setWhiteboardOpen(!whiteboardOpen)}
              style={{
                fontSize: 12,
                color: 'var(--w-ink)',
                background: whiteboardOpen ? 'rgba(139, 92, 246, 0.25)' : 'rgba(13,20,36,0.6)',
                border: whiteboardOpen ? '1px solid #8b5cf6' : '1px solid var(--w-border)',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 500,
                backdropFilter: 'blur(8px)',
                transition: 'all 0.2s',
              }}
            >
              📝 板书
            </button>
          </div>

          {/* 字幕浮层 */}
          {activeSubtitle && (
            <SubtitleOverlay
              speakerName={activeSubtitle.speakerName}
              speechText={activeSubtitle.speechText}
              activeSpeakerId={activeSubtitle.activeSpeakerId}
            />
          )}

          {/* 幻灯片序号 */}
          {currentScene && (
            <div
              style={{
                position: 'absolute',
                top: 14,
                right: 18,
                fontSize: 12,
                color: 'var(--w-ink-soft)',
                background: 'rgba(13,20,36,0.6)',
                padding: '2px 8px',
                borderRadius: '6px',
                pointerEvents: 'none',
                fontFamily: 'monospace',
                zIndex: 10,
              }}
            >
              PPT {scenes.findIndex((s) => s.id === currentSceneId) + 1} / {scenes.length}
            </div>
          )}
        </div>

        {/* 视频式翻页与进度进度条 */}
        <VideoProgressBar
          scenes={scenes}
          currentSceneId={currentSceneId}
          currentActionIndex={currentActionIndex}
          engineMode={engineMode}
          playbackCompleted={playbackCompleted}
          playbackSpeed={playbackSpeed}
          onPlayPause={handlePlayPause}
          onPrevScene={handlePrevScene}
          onNextScene={handleNextScene}
          onSeekScene={handleSeekScene}
          onSpeedChange={handleSpeedChange}
        />

        {/* 板书白板 (分屏显示 Q&A 中产生的板书和物理模拟器) */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <Whiteboard
            items={chat.whiteboardItems}
            fallbackSimulationId={fallbackSim}
            onClear={chat.clearWhiteboard}
          />
        </div>
      </main>

      {/* === 右侧：控制面板（三标签页） === */}
      <ControlPanel
        tab={tab}
        onChangeTab={setTab}
        docs={docs}
        onChangeDocs={setDocs}
        materialMode={materialMode}
        onMaterialModeChange={setMaterialMode}
        isGuest={isGuest}
        chapterTitle={chapter.title}
        onSendPrompt={handleSendPrompt}
        onCancelMessage={chat.cancel}
        messages={mergedMessages}
        activeSpeakerId={chat.activeSpeakerId}
        loading={chat.loading}
        error={chat.error}
        chapterId={chapter.id}
      />

      <style jsx global>{`
        .w-player-screen-wrapper {
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        .w-loading-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--w-ink-soft);
          gap: 12px;
        }
        .w-loading-placeholder .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: var(--w-accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .w-speaking-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          background: var(--w-accent);
          border-radius: 50%;
          margin-left: 6px;
          animation: w-speaking-pulse 1s infinite alternate;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes w-speaking-pulse {
          from {
            transform: scale(0.8);
            opacity: 0.5;
          }
          to {
            transform: scale(1.2);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
