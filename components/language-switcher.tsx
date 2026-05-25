/**
 * components/language-switcher.tsx
 * 
 * 文件作用：
 * 语言选择器组件。提供下拉菜单来选择应用的显示语言。
 * 
 * 运行机理：
 * 1. 支持的语言：
 *    - 提供了 supportedLocales 中配置的所有语言选择
 *    - 每个语言有描述文本（中文、English 等）
 * 2. 下拉菜单：
 *    - 点击下拉显示语言列表
 *    - 每个项目可以点击进行选择
 * 3. 语言切换：
 *    - 点击语言一项时，调用 useI18n hook 的 setLocale 方法
 *    - useI18n 会自动更新应用的显示语言
 * 4. 下拉位置：
 *    - 使用 absolute 定位下拉菜单，右对齐显示
 * 5. 下拉样式：
 *    - 使用 handleClose 管理是否打开
 *    - 提供浮动的 className 样式配置
 * 
 * 与其他代码的关联：
 * - useI18n (lib/hooks/use-i18n)：管理应用语言配置
 * - supportedLocales (lib/i18n)：支持的语言配置数组
 * - ui/dropdown-menu：UI下拉菜单组件
 * - components/header.tsx：父组件，包含此选择器
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { supportedLocales } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  /** Called when the dropdown opens, so parent can close sibling dropdowns */
  onOpen?: () => void;
}

export function LanguageSwitcher({ onOpen }: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
      >
        {supportedLocales.find((l) => l.code === locale)?.shortLabel ?? locale}
      </button>
      {open && (
        <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[120px]">
          {supportedLocales.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className={cn(
                'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                locale === l.code &&
                  'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
