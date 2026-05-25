/**
 * components/access-code-guard.tsx
 * 
 * 文件作用：
 * 客户端访问码验证组件。检查用户是否有有效的访问码凭证，如果需要则显示验证模态框。
 * 与 middleware.ts 配合实现双层访问控制（服务器 + 客户端）。
 * 
 * 运行机理：
 * 1. 初始化阶段：
 *    - 装载时立即调用 /api/access-code/status 检查访问码状态
 *    - 获取信息：访问码是否启用、用户是否已认证、加载状态
 * 2. 验证流程：
 *    - enabled=true + authenticated=false：需要显示访问码模态框
 *    - enabled=false：访问码未启用，直接显示内容
 *    - authenticated=true：用户已验证，显示内容
 * 3. 错误处理：
 *    - API请求失败时，出于安全考虑默认启用访问控制（authenticated=false）
 * 4. 成功后：
 *    - AccessCodeModal 的 onSuccess 回调更新状态为已认证
 * 
 * 与其他代码的关联：
 * - AccessCodeModal (components/access-code-modal)：实际的访问码输入模态框
 * - /api/access-code/status：检查访问码状态
 * - /api/access-code/verify：验证并获取访问令牌（在AccessCodeModal中使用）
 * - middleware.ts：服务器端的访问控制
 * - app/layout.tsx：将此组件包裹在应用最外层
 */

'use client';

import { useEffect, useState, ReactNode } from 'react';
import { AccessCodeModal } from '@/components/access-code-modal';

export function AccessCodeGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    authenticated: boolean;
    loading: boolean;
  }>({ enabled: false, authenticated: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/access-code/status')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setStatus({
            enabled: data.enabled,
            authenticated: data.authenticated,
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Default to requiring auth on error — safer than silently disabling
          setStatus({ enabled: true, authenticated: false, loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const needsAuth = !status.loading && status.enabled && !status.authenticated;

  return (
    <>
      {needsAuth && (
        <AccessCodeModal
          open={true}
          onSuccess={() => setStatus((s) => ({ ...s, authenticated: true }))}
        />
      )}
      {children}
    </>
  );
}
