/**
 * lib/store/user-profile.ts
 * 
 * 文件作用：
 * Zustand状态管理库，管理用户个人资料（头像、昵称、个人介绍），持久化到localStorage。
 * 
 * 运行机理：
 * 1. 状态字段：
 *    - avatar：用户头像，支持预定义头像路径或自定义数据URL
 *    - nickname：用户昵称
 *    - bio：用户个人介绍
 * 2. 预定义头像选项：AVATAR_OPTIONS 包含7个内置头像选项
 * 3. 持久化：
 *    - 通过 zustand/middleware 的 persist 中间件自动同步到localStorage
 *    - localStorage key: 'user-profile-storage'
 *    - 在应用启动时从localStorage恢复状态
 * 4. 状态修改：
 *    - setAvatar(avatar)：更新头像
 *    - setNickname(nickname)：更新昵称
 *    - setBio(bio)：更新个人介绍
 * 
 * 与其他代码的关联：
 * - app/page.tsx 使用 useUserProfileStore 读取用户头像选择
 * - 组件通过 useUserProfileStore() hook 访问和更新用户资料
 * - 用户资料在课堂中用于展示用户身份
 */

/**
 * User Profile Store
 * Persists avatar, nickname & bio to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Predefined avatar options */
export const AVATAR_OPTIONS = [
  '/avatars/user.png',
  '/avatars/teacher-2.png',
  '/avatars/assist-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker-2.png',
] as const;

export interface UserProfileState {
  /** Local avatar path or data-URL (for custom uploads) */
  avatar: string;
  nickname: string;
  bio: string;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      avatar: AVATAR_OPTIONS[0],
      nickname: '',
      bio: '',
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
    }),
    {
      name: 'user-profile-storage',
    },
  ),
);
