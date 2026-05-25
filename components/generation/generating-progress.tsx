/**
 * components/generation/generating-progress.tsx
 * 
 * 文件作用：
 * 生成进度显示组件。在课堂生成过程中实时显示各个步骤的进度状态（等待中、进行中、完成、失败）。
 * 提供清晰的视觉反馈让用户了解生成的进度。
 * 
 * 运行机理：
 * 1. 步骤列表：
 *    - 接收 steps 数组，每个步骤包含 id、name、status
 *    - status 包括：'idle'（未开始）、'processing'（进行中）、'completed'（完成）、'failed'（失败）
 * 2. 视觉指示器：
 *    - idle：灰色圆圈
 *    - processing：旋转的加载器图标（Loader2）
 *    - completed：绿色勾号（CheckCircle2）
 *    - failed：红色叉号（XCircle）
 * 3. 进度卡片：
 *    - 每个步骤一张卡片
 *    - 显示步骤名称和状态
 *    - 可能包含进度百分比或当前进度描述
 * 4. 动画效果：
 *    - 步骤完成时显示完成动画
 *    - 步骤失败时显示错误动画
 * 5. 当前步骤高亮：
 *    - 高亮显示当前正在进行的步骤
 *    - 便于用户快速定位进度
 * 
 * 与其他代码的关联：
 * - app/generation-preview/page.tsx：使用此组件显示生成进度
 * - lucide-react：图标库
 * - components/ui/card：卡片UI组件
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

interface GeneratingProgressProps {
  outlineReady: boolean; // Is outline generation complete?
  firstPageReady: boolean; // Is first page generated?
  statusMessage: string;
  error?: string | null;
}

// Status item component - declared outside main component
function StatusItem({
  completed,
  inProgress,
  hasError,
  label,
}: {
  completed: boolean;
  inProgress: boolean;
  hasError: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-shrink-0">
        {hasError ? (
          <XCircle className="size-6 text-destructive" />
        ) : completed ? (
          <CheckCircle2 className="size-6 text-green-500" />
        ) : inProgress ? (
          <Loader2 className="size-6 text-primary animate-spin" />
        ) : (
          <Circle className="size-6 text-muted-foreground" />
        )}
      </div>
      <span
        className={`text-base ${
          hasError
            ? 'text-destructive'
            : completed
              ? 'text-green-600 font-medium'
              : inProgress
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function GeneratingProgress({
  outlineReady,
  firstPageReady,
  statusMessage,
  error,
}: GeneratingProgressProps) {
  const { t } = useI18n();
  const [dots, setDots] = useState('');

  // Animated dots for loading state
  useEffect(() => {
    if (!error && !firstPageReady) {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [error, firstPageReady]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {error ? (
              <>
                <XCircle className="size-5 text-destructive" />
                {t('generation.generationFailed')}
              </>
            ) : firstPageReady ? (
              <>
                <CheckCircle2 className="size-5 text-green-500" />
                {t('generation.openingClassroom')}
              </>
            ) : (
              <>
                <Loader2 className="size-5 animate-spin" />
                {t('generation.generatingCourse')}
                {dots}
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Two milestone status items */}
          <div className="divide-y">
            <StatusItem
              completed={outlineReady}
              inProgress={!outlineReady && !error}
              hasError={!outlineReady && !!error}
              label={
                outlineReady ? t('generation.outlineReady') : t('generation.generatingOutlines')
              }
            />
            <StatusItem
              completed={firstPageReady}
              inProgress={outlineReady && !firstPageReady && !error}
              hasError={outlineReady && !firstPageReady && !!error}
              label={
                firstPageReady
                  ? t('generation.firstPageReady')
                  : t('generation.generatingFirstPage')
              }
            />
          </div>

          {/* Status message */}
          {statusMessage && !error && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
