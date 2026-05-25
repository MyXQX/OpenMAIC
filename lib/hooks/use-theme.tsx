/**
 * lib/hooks/use-theme.tsx
 * 
 * 文件作用：
 * 提供主题管理功能（亮色/暗色/系统跟随模式），通过React Context实现全局状态管理，
 * 支持主题持久化和系统偏好检测。
 * 
 * 运行机理：
 * 1. 主题模式：
 *    - 'light'：亮色模式
 *    - 'dark'：暗色模式
 *    - 'system'：跟随系统设置（默认值）
 * 2. ThemeProvider 组件：
 *    - 在根布局中使用，为整个应用提供主题上下文
 *    - 管理主题状态，应用主题到DOM和localStorage
 * 3. 主题应用机制：
 *    - resolvedTheme 计算当前实际主题（如果是system则转换为实际的light/dark）
 *    - 在document元素上添加/移除'dark'类名
 *    - CSS使用tailwindcss的dark模式选择器响应
 * 4. 持久化与同步：
 *    - localStorage key: 'theme'
 *    - 从localStorage恢复用户之前的主题选择
 *    - 侦听系统主题变化（media query）
 * 5. useTheme() hook：
 *    - 在组件中使用获取当前主题和setTheme函数
 *    - 用于主题切换按钮等交互元素
 * 
 * 与其他代码的关联：
 * - app/layout.tsx：使用 ThemeProvider 包裹整个应用
 * - app/page.tsx：使用 useTheme() hook 实现主题切换按钮
 * - components/ui/*：使用tailwindcss的dark选择器响应主题变化
 */

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored);
    }
    setSystemTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  // Listen to system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Save theme to localStorage
  const handleSetTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
