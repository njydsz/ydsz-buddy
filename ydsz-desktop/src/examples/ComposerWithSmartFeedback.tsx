/**
 * @file ComposerInputFeedback 使用示例
 * @description 展示如何在 Composer 中集成智能输入反馈功能
 * @module examples/ComposerWithSmartFeedback
 */

import { useState, useCallback } from "react";
import {
  useSmartInputFeedback,
  smartTruncateText,
} from "~/hooks/useSmartInputFeedback";
import { ComposerInputFeedback } from "~/components/ComposerInputFeedback";
import { ComposerPromptEditor } from "~/components/ComposerPromptEditor";

/**
 * 示例：带智能反馈的 Composer 组件
 */
export function ComposerWithSmartFeedbackExample({ threadId }: { threadId: string }) {
  const [prompt, setPrompt] = useState("");
  const [cursor, setCursor] = useState(0);

  // 使用智能输入反馈 Hook
  const {
    charCount,
    charCountStatus,
    isApproachingLimit,
    isExceedingLimit,
    showMentionLoading,
    showTruncationWarning,
    dismissTruncationWarning,
    lastSavedAt,
    isSaving,
    restoreDraft,
    clearDraft,
    prefersReducedMotion,
  } = useSmartInputFeedback({
    threadId,
    value: prompt,
    cursorPosition: cursor,
    enableAutosave: true,
    mentionLoading: false,
  });

  // 组件挂载时尝试恢复草稿
  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (draft) {
      setPrompt(draft);
    }
  }, [restoreDraft]);

  // 处理文本变化
  const handleChange = useCallback(
    (nextValue: string, nextCursor: number) => {
      setPrompt(nextValue);
      setCursor(nextCursor);
    },
    []
  );

  // 处理智能截断
  const handleTruncate = useCallback(() => {
    const truncated = smartTruncateText(prompt);
    setPrompt(truncated);
  }, [prompt]);

  return (
    <div className="flex flex-col">
      {/* 编辑器 */}
      <ComposerPromptEditor
        value={prompt}
        cursor={cursor}
        terminalContexts={[]}
        disabled={false}
        placeholder="输入消息... 使用 @ 提及文件或技能"
        onChange={handleChange}
        onRemoveTerminalContext={() => {}}
        onPaste={() => {}}
      />

      {/* 智能反馈区域 */}
      <ComposerInputFeedback
        charCount={charCount}
        charCountStatus={charCountStatus}
        showMentionLoading={showMentionLoading}
        showTruncationWarning={showTruncationWarning}
        onTruncate={handleTruncate}
        onDismissTruncationWarning={dismissTruncationWarning}
        lastSavedAt={lastSavedAt}
        isSaving={isSaving}
        prefersReducedMotion={prefersReducedMotion}
      />

      {/* 额外的控制按钮（可选） */}
      <div className="flex gap-2 px-3 py-2 border-t">
        <button
          type="button"
          onClick={handleRestoreDraft}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          恢复草稿
        </button>
        <button
          type="button"
          onClick={() => clearDraft()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          清除草稿
        </button>
        {isApproachingLimit && (
          <span className="text-xs text-warning ml-auto">
            接近字符限制
          </span>
        )}
        {isExceedingLimit && (
          <span className="text-xs text-destructive ml-auto font-semibold">
            超出字符限制
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 使用示例说明：
 *
 * 1. 字符计数功能：
 *    - 当字符数 < 25,600 (80%) 时，显示为普通文本
 *    - 当字符数 >= 25,600 (80%) 时，显示为警告色（黄色）
 *    - 当字符数 >= 30,400 (95%) 时，显示为危险色（红色）
 *    - 当字符数 >= 32,000 (100%) 时，显示为超出限制（红色加粗）
 *
 * 2. @提及加载指示器：
 *    - 当用户输入 @ 且 mentionLoading 为 true 时开始计时
 *    - 如果加载时间超过 300ms，显示 "搜索提及..." 加载指示器
 *    - 加载完成后自动隐藏
 *
 * 3. 长文截断警告：
 *    - 当字符数超过 10,000 时显示警告横幅
 *    - 提供"截断"按钮，调用 smartTruncateText 智能截断
 *    - 提供"忽略"按钮，关闭当前警告
 *    - 当字符数降回阈值以下时，警告自动重新启用
 *
 * 4. 草稿自动保存：
 *    - 用户输入停止 5 秒后自动保存到 localStorage
 *    - 键名为 `composer:draft:${threadId}`
 *    - 页面卸载前立即保存，防止数据丢失
 *    - 显示"刚刚保存"、"X 秒前保存"等状态
 *    - 可通过 restoreDraft() 恢复草稿
 *
 * 5. 减少动画支持：
 *    - 自动检测系统 prefers-reduced-motion 设置
 *    - 所有动画过渡时间缩短到 50ms 以内
 *    - 保持功能完整性，仅减少视觉动画
 *
 * 集成到实际项目：
 *
 * 在 ChatView.tsx 或类似的 Composer 容器组件中：
 *
 * ```tsx
 * import { ComposerWithSmartFeedbackExample } from "~/examples/ComposerWithSmartFeedback";
 *
 * function ChatView({ threadId }: { threadId: string }) {
 *   return (
 *     <div className="flex flex-col h-full">
 *       {/* 聊天历史 *\/}
 *       <div className="flex-1 overflow-y-auto">
 *         {/* ... *\/}
 *       </div>
 *
 *       {/* Composer 输入区域 *\/}
 *       <div className="border-t">
 *         <ComposerWithSmartFeedbackExample threadId={threadId} />
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
