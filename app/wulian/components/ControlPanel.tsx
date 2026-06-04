'use client';

import { MaterialsTab } from './MaterialsTab';
import { PromptsTab } from './PromptsTab';
import { ChatLogTab } from './ChatLogTab';
import type { UploadedDoc } from './UploadPanel';
import type { ChatMessage } from '@/lib/wulian/types';

interface ControlPanelProps {
  tab: 'materials' | 'prompts' | 'chat';
  onChangeTab: (next: 'materials' | 'prompts' | 'chat') => void;
  docs: UploadedDoc[];
  onChangeDocs: (next: UploadedDoc[]) => void;
  materialMode: 'course' | 'mine' | 'compare';
  onMaterialModeChange: (mode: 'course' | 'mine' | 'compare') => void;
  isGuest: boolean;
  chapterTitle?: string;
  onSendPrompt: (text: string) => void;
  onCancelMessage: () => void;
  messages: ChatMessage[];
  activeSpeakerId: string | null;
  loading: boolean;
  error: string | null;
  chapterId: string;
}

export function ControlPanel({
  tab,
  onChangeTab,
  docs,
  onChangeDocs,
  materialMode,
  onMaterialModeChange,
  isGuest,
  chapterTitle,
  onSendPrompt,
  onCancelMessage,
  messages,
  activeSpeakerId,
  loading,
  error,
  chapterId,
}: ControlPanelProps) {
  return (
    <aside className="w-pane w-chat-panel">
      {/* 顶部标签切换页 */}
      <div className="w-chat-tabs">
        <button
          type="button"
          onClick={() => onChangeTab('materials')}
          className={tab === 'materials' ? 'active' : ''}
        >
          📄 学习资料 {docs.length > 0 && `(${docs.length})`}
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('prompts')}
          className={tab === 'prompts' ? 'active' : ''}
        >
          💡 快捷提问
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('chat')}
          className={tab === 'chat' ? 'active' : ''}
        >
          💬 课堂互动
        </button>
      </div>

      {/* 主面板内容区域 */}
      <div className="w-pane-body" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {tab === 'materials' && (
          <MaterialsTab
            docs={docs}
            onChangeDocs={onChangeDocs}
            materialMode={materialMode}
            onMaterialModeChange={onMaterialModeChange}
            isGuest={isGuest}
            chapterTitle={chapterTitle}
          />
        )}
        {tab === 'prompts' && (
          <PromptsTab
            onSendPrompt={onSendPrompt}
            disabled={loading}
          />
        )}
        {tab === 'chat' && (
          <ChatLogTab
            messages={messages}
            activeSpeakerId={activeSpeakerId}
            loading={loading}
            error={error}
            onSendMessage={onSendPrompt}
            onCancelMessage={onCancelMessage}
            chapterId={chapterId}
          />
        )}
      </div>

      <style jsx global>{`
        .w-chat-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .w-chat-panel .w-pane-body {
          padding: 14px 12px;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }
      `}</style>
    </aside>
  );
}
