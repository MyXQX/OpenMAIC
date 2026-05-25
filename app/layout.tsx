/**
 * app/layout.tsx
 * 
 * 文件作用：
 * 这是 Next.js 应用的根布局文件，定义了整个应用程序的HTML结构和全局上下文提供者。
 * 
 * 运行机理：
 * 1. 导入全局样式（CSS、动画库、KaTeX公式库）和自定义字体（Inter字体）
 * 2. 设置应用程序元数据（标题、描述）用于SEO
 * 3. 使用多个Context Provider包裹应用内容：
 *    - ThemeProvider：提供暗黑/亮色主题切换功能
 *    - I18nProvider：提供国际化/多语言支持（中英文等）
 *    - ServerProvidersInit：初始化服务器端的AI模型提供者配置
 *    - AccessCodeGuard：验证访问码，保护应用免未授权访问
 *    - Toaster：显示全局通知/提示消息
 * 
 * 与其他代码的关联：
 * - ThemeProvider (lib/hooks/use-theme)：管理应用主题状态
 * - I18nProvider (lib/hooks/use-i18n)：管理应用国际化语言设置
 * - ServerProvidersInit (components/server-providers-init)：初始化LLM提供者（OpenAI、Claude等）
 * - AccessCodeGuard (components/access-code-guard)：在middleware.ts的验证基础上做客户端防护
 * - 所有子页面和组件都会继承这个布局的样式和上下文
 */

import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { ServerProvidersInit } from '@/components/server-providers-init';
import { AccessCodeGuard } from '@/components/access-code-guard';

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'OpenMAIC',
  description:
    'The open-source AI interactive classroom. Upload a PDF to instantly generate an immersive, multi-agent learning experience.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <I18nProvider>
            <ServerProvidersInit />
            <AccessCodeGuard>{children}</AccessCodeGuard>
            <Toaster position="top-center" />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
