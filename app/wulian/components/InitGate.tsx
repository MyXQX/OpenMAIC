'use client';

import { useState, useEffect } from 'react';
import type { Chapter, ScientistPersona, WulianClassroomInstance } from '@/lib/wulian/types';
import { SetupWizard } from './SetupWizard';
import ClassroomPlayer from './ClassroomPlayer';
import { useAuth } from '../hooks/useAuth';
import { db } from '@/lib/utils/database';
import { saveStageData, loadStageData } from '@/lib/utils/stage-storage';

interface InitGateProps {
  chapter: Chapter;
  teacher: ScientistPersona;
  secondary: ScientistPersona | null;
}

export function InitGate({ chapter, teacher, secondary }: InitGateProps) {
  const { user, isGuest, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [activeInstance, setActiveInstance] = useState<WulianClassroomInstance | null>(null);

  const checkInstance = async () => {
    setChecking(true);
    try {
      if (user) {
        // 1. 已登录账号：调 API 查询定制实例列表
        const res = await fetch(`/api/wulian/classroom?chapterId=${chapter.id}`);
        const data = await res.json();
        if (res.ok && data.success && data.classrooms && data.classrooms.length > 0) {
          // 选中最新更新的一个
          const newest = data.classrooms[0] as WulianClassroomInstance;

          // 同步到本地 IndexedDB 中，以便 SlideRenderer 可正常读取
          await saveStageData(newest.id, {
            stage: newest.stage,
            scenes: newest.scenes,
            currentSceneId: newest.scenes[0]?.id || null,
            chats: [],
          });

          setActiveInstance(newest);
        } else {
          setActiveInstance(null);
        }
      } else {
        // 2. 访客模式：从 localStorage 获取本地实例 ID，再从 IndexedDB 读取
        const localId = localStorage.getItem(`wulian_guest_classroom_${chapter.id}`);
        if (localId) {
          const localData = await loadStageData(localId);
          // 检查 IndexedDB 里面是否真的存在这个课
          if (localData) {
            // 从 localStorage 读取附加的 personalization 属性
            const personalizationRaw = localStorage.getItem(`wulian_guest_personalization_${localId}`);
            const personalization = personalizationRaw ? JSON.parse(personalizationRaw) : null;

            setActiveInstance({
              id: localId,
              owner: 'guest',
              chapterId: chapter.id,
              stage: localData.stage,
              scenes: localData.scenes,
              personalization: personalization || {
                chapterId: chapter.id,
                studentProfile: { userId: 'guest', level: 'beginner', goals: ['interest'], updatedAt: Date.now() },
                materialMode: 'course',
                uploadedDocIds: [],
                selectedSimulatorIds: [],
              },
              simulators: personalization?.selectedSimulatorIds || [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          } else {
            setActiveInstance(null);
          }
        } else {
          setActiveInstance(null);
        }
      }
    } catch (e) {
      console.error('Failed to resolve classroom instance:', e);
      setActiveInstance(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      checkInstance();
    }
  }, [user, isGuest, authLoading, chapter.id]);

  // 定制生成完成后的回调
  const handleWizardComplete = async (classroomId: string) => {
    try {
      // 调接口拉取生成的完整结构
      const res = await fetch(`/api/wulian/classroom/instance/${classroomId}`);
      const data = await res.json();
      if (res.ok && data.success && data.instance) {
        const inst = data.instance as WulianClassroomInstance;

        // 1. 保存课件与场景到 IndexedDB 中以供 OpenMAIC 底层播放渲染
        await saveStageData(inst.id, {
          stage: inst.stage,
          scenes: inst.scenes,
          currentSceneId: inst.scenes[0]?.id || null,
          chats: [],
        });

        // 2. 如果是访客，在本地持久化记下 ID 和配置输入
        if (isGuest) {
          localStorage.setItem(`wulian_guest_classroom_${chapter.id}`, inst.id);
          localStorage.setItem(`wulian_guest_personalization_${inst.id}`, JSON.stringify(inst.personalization));
        }

        // 3. 进入播放状态
        setActiveInstance(inst);
      } else {
        alert('无法加载定制好的课堂内容，请重试');
      }
    } catch (e) {
      console.error('Failed to load completed classroom:', e);
      alert('加载课堂失败');
    }
  };

  if (authLoading || checking) {
    return (
      <div className="w-init-loading">
        <div className="spinner" />
        <p>正在拉取您的课程定制信息...</p>
        <style jsx global>{`
          .w-init-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            color: var(--w-ink-soft);
            gap: 12px;
          }
          .w-init-loading .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-top-color: var(--w-accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
        `}</style>
      </div>
    );
  }

  if (activeInstance) {
    return (
      <ClassroomPlayer
        chapter={chapter}
        teacher={teacher}
        secondary={secondary}
        instance={activeInstance}
        isGuest={isGuest}
      />
    );
  }

  return (
    <SetupWizard
      chapter={chapter}
      isGuest={isGuest}
      onComplete={handleWizardComplete}
    />
  );
}
