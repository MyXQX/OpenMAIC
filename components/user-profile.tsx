/**
 * components/user-profile.tsx
 * 
 * 文件作用：
 * 成泰管理组件。允许用户上罡上出送接收中预石改变下遗传参数：
 * 样儿、昵称、个性一。整个数据被永久区化于 localStorage。
 * 
 * 运行机理：
 * 1. 样儿管理：
 *    - 提供 7 个预设样儿选择
 *    - 用户可以点击样儿选择光一个样儿或上传自定义图片
 *    - 上传的图片被转换为 base64 存储。
 * 2. 昵称编辑：
 *    - 程分一键录入昵称文本
 *    - 使用 Pencil 图标指示可编辑
 *    - 使用 Check 图标确认修改
 * 3. 个性编辑：
 *    - 提供文本史编辑区域以便编辑个性戗述
 *    - 支持整丢整列轉换列表的个性信息
 * 4. 状态管理：
 *    - 早冬候保存不雄管理 state 深化于 localStorage（'user-profile-storage'）
 *    - 使用 useUserProfileStore hook 严填整个状态
 * 5. 动画效果：
 *    - 使用 motion/react 打造平滑的变化效果
 *    - 管祀6 世闎样儿期间的效果
 * 
 * 与其他代码的关联：
 * - useUserProfileStore (lib/store/user-profile)：管理成泰状态
 * - AVATAR_OPTIONS：预设样儿配置数组，来自 lib/store/user-profile
 * - localStorage ('user-profile-storage')：永久化存储位置
 * - ui/button, ui/dropdown-menu：不孥体 UI 组件
 * - Pencil, Check, ImagePlus, ChevronDown：lucide-react 字样
 * - motion/react：动画效果库
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { Pencil, Check, ImagePlus, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';

/** Check whether avatar is a custom upload (data-URL) */
function isCustomAvatar(avatar: string) {
  return avatar.startsWith('data:');
}

/** Max uploaded image size before we reject */
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

const FILE_INPUT_ID = 'user-avatar-upload';

export function UserProfileCard() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHydrated(true); // eslint-disable-line react-hooks/set-state-in-effect -- Store hydration on mount
  }, []);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const displayName = nickname || t('profile.defaultNickname');

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!hydrated) {
    return (
      <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
      {/* File input — sr-only keeps it in the flow but invisible; label triggers it */}
      <input
        id={FILE_INPUT_ID}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleAvatarUpload}
      />

      {/* Row 1: Avatar + Name */}
      <div className="flex items-center gap-3.5">
        {/* Avatar — click to toggle picker */}
        <button
          onClick={() => setAvatarPickerOpen(!avatarPickerOpen)}
          className="shrink-0 group/avatar relative cursor-pointer"
        >
          <div className="size-11 rounded-full bg-gray-50 dark:bg-gray-800 overflow-hidden ring-2 ring-violet-300/50 dark:ring-violet-600/40 group-hover/avatar:ring-violet-400 dark:group-hover/avatar:ring-violet-500 transition-all">
            <img src={avatar} alt="" className="size-full object-cover" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-white dark:bg-slate-800 border border-muted/60 flex items-center justify-center">
            <ChevronDown
              className={cn(
                'size-2.5 text-muted-foreground transition-transform duration-200',
                avatarPickerOpen && 'rotate-180',
              )}
            />
          </div>
        </button>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                onBlur={commitName}
                maxLength={20}
                placeholder={t('profile.defaultNickname')}
                className="flex-1 min-w-0 h-7 bg-transparent border-b-2 border-violet-400 dark:border-violet-500 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <button
                onClick={commitName}
                className="shrink-0 size-6 rounded-md flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
              >
                <Check className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={startEditName}
              className="group/name flex items-center gap-1.5 cursor-pointer"
            >
              <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
              <Pencil className="size-3 text-muted-foreground/40 opacity-0 group-hover/name:opacity-100 transition-opacity" />
            </button>
          )}
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{t('profile.avatarHint')}</p>
        </div>
      </div>

      {/* Avatar picker — collapsible */}
      <AnimatePresence>
        {avatarPickerOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* p-1 gives breathing room so ring-offset / hover-scale aren't clipped */}
            <div className="pt-3 pb-1 px-1 flex items-center gap-1.5 flex-wrap">
              {AVATAR_OPTIONS.map((url) => (
                <button
                  key={url}
                  onClick={() => setAvatar(url)}
                  className={cn(
                    'size-8 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                    'hover:scale-110 active:scale-95',
                    avatar === url
                      ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                      : 'hover:ring-1 hover:ring-muted-foreground/30',
                  )}
                >
                  <img src={url} alt="" className="size-full" />
                </button>
              ))}

              {/* Upload — uses <label htmlFor> to natively trigger the file input */}
              <label
                htmlFor={FILE_INPUT_ID}
                className={cn(
                  'size-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                  'hover:scale-110 active:scale-95',
                  isCustomAvatar(avatar)
                    ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                    : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                )}
                title={t('profile.uploadAvatar')}
              >
                <ImagePlus className="size-3.5" />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bio input */}
      <Textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder={t('profile.bioPlaceholder')}
        maxLength={200}
        rows={3}
        className="mt-3 resize-none bg-background/50 min-h-[80px]"
      />
    </Card>
  );
}
