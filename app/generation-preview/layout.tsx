/**
 * app/generation-preview/layout.tsx
 * 
 * 文件作用：
 * 课堂生成预览页面的布局模板。这是一个通用布局，简单为子页面提供全局结构。
 * 
 * 运行机理：
 * 1. 动态渲染配置：
 *    - 设置 export const dynamic = 'force-dynamic'
 *    - 保证每次请求时动态渲染此页面
 *    - 是因为页面使用了 useI18n 客户端 hook
 * 2. 子页面渲染：
 *    - 此布局简单地返回 children
 *    - Next.js 会自动将对应的页面组件 (GenerationPreviewPage) 作为 children 传入
 * 
 * 与其他代码的关联：
 * - GenerationPreviewPage (app/generation-preview/page.tsx)：子页面组件
 * - useI18n (lib/hooks/use-i18n)：课堂预览页面使用的i18n hook
 */

// Force dynamic rendering since this page uses client-side hooks (useI18n)
export const dynamic = 'force-dynamic';

export default function GenerationPreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
