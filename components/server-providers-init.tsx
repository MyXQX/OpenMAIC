/**
 * components/server-providers-init.tsx
 * 
 * 文件作用：
 * 应用启动时初始化服务器端配置的LLM提供者。从服务器获取提供者配置并合并到Zustand状态中。
 * 纯副作用组件，不渲染任何UI。
 * 
 * 运行机理：
 * 1. 装载阶段：
 *    - 组件挂载时调用 useSettingsStore 中的 fetchServerProviders() 方法
 *    - fetchServerProviders() 负责从后端API获取预配置的提供者
 * 2. 服务器提供者合并：
 *    - 服务器可以通过环境变量预配置提供者（如OPENAI_API_KEY等）
 *    - fetchServerProviders() 会将这些提供者与用户存储的配置合并
 *    - 用户配置优先级更高，可以覆盖服务器配置
 * 3. 只执行一次：
 *    - useEffect依赖于 fetchServerProviders 函数本身
 *    - 确保初始化逻辑仅在组件首次挂载时执行
 * 
 * 与其他代码的关联：
 * - useSettingsStore (lib/store/settings)：获取 fetchServerProviders 方法
 * - /api/server-providers（可能存在）：后端API获取服务器配置
 * - app/layout.tsx：在应用根布局中使用此组件
 * - 环境变量：OPENAI_API_KEY、ANTHROPIC_API_KEY等（在.env文件中配置）
 */

'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/settings';

/**
 * Fetches server-configured providers on mount and merges into settings store.
 * Renders nothing — purely a side-effect component.
 */
export function ServerProvidersInit() {
  const fetchServerProviders = useSettingsStore((state) => state.fetchServerProviders);

  useEffect(() => {
    fetchServerProviders();
  }, [fetchServerProviders]);

  return null;
}
