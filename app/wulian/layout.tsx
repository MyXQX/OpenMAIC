/**
 * 物联智讲 - 独立布局
 *
 * 不挂 OpenMAIC 的 ThemeProvider/I18nProvider/AccessCodeGuard，
 * 让物联智讲页面无依赖独立运行。如果父 layout 已经加载这些 provider 也无妨。
 */

import type { Metadata } from 'next';
import './wulian.css';

export const metadata: Metadata = {
  title: '物联智讲 · AI 物理课堂',
  description:
    '基于 OpenMAIC 的大学物理多智能体互动课堂。科学家导师 + AI 助教 + AI 同学，与你一起讲、问、推、测。',
};

export default function WulianLayout({ children }: { children: React.ReactNode }) {
  return <div className="wulian-app">{children}</div>;
}
