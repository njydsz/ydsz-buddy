/**
 * @file ComposerWithInlineAI — 集成内嵌 AI 编辑能力的 Composer 包装器
 *
 * 在 ComposerPromptEditor 基础上增加"人机双写"能力：
 * - 选中文本后自动弹出 AI 工具栏
 * - 支持润色/改写/扩展/缩短/翻译 5 种操作
 * - AI 生成结果以 diff 对比形式展示，用户确认后替换
 *
 * ## 架构
 *
 * ```
 * ComposerWithInlineAI
 *   ├── useTextSelection (追踪文本选区)
 *   ├── ComposerPromptEditor (原有编辑器)
 *   └── InlineAIToolbar (浮动 AI 工具栏)
 * ```
 */

import { useCallback, useRef } from "react";
import type { ComposerPromptEditorHandle } from "./ComposerPromptEditor";
import { ComposerPromptEditor } from "./ComposerPromptEditor";
import { InlineAIToolbar, type InlineAIAction } from "./InlineAIToolbar";
import { useTextSelection } from "~/hooks/useTextSelection";
import type { TerminalContextDraft } from "~/lib/terminalContext";
import type { ProviderMentionReference } from "~/contracts";

// ==================== Props ====================

interface ComposerWithInlineAIProps {
  value: string;
  cursor: number;
  terminalContexts: ReadonlyArray<TerminalContextDraft>;
  mentionReferences?: ReadonlyArray<ProviderMentionReference>;
  disabled: boolean;
  placeholder: string;
  className?: string;
  onRemoveTerminalContext: (contextId: string) => void;
  onChange: (
    nextValue: string,
    nextCursor: number,
    expandedCursor: number,
    cursorAdjacentToMention: boolean,
    terminalContextIds: string[],
  ) => void;
  onCommandKeyDown?: (
    key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab" | "Slash",
    event: KeyboardEvent,
  ) => boolean;
  onPaste?: React.ClipboardEventHandler<HTMLElement>;
  /** AI 操作回调，调用后端 API */
  onAIAction?: (action: InlineAIAction, prompt: string) => Promise<string>;
}

// ==================== Component ====================

export function ComposerWithInlineAI({
  value,
  cursor,
  terminalContexts,
  mentionReferences,
  disabled,
  placeholder,
  className,
  onRemoveTerminalContext,
  onChange,
  onCommandKeyDown,
  onPaste = () => {},
  onAIAction,
}: ComposerWithInlineAIProps) {
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 追踪文本选区
  const { selectedText, selectionRect, hasSelection, clearSelection } = useTextSelection({
    minLength: 2,
    targetRef: containerRef,
  });

  // 处理 AI 操作
  const handleAIAction = useCallback(
    async (action: InlineAIAction, prompt: string): Promise<string> => {
      if (onAIAction) {
        return onAIAction(action, prompt);
      }
      // 默认实现：直接返回原文本
      return selectedText;
    },
    [onAIAction, selectedText],
  );

  // 应用 AI 结果
  const handleApplyResult = useCallback(
    (result: string) => {
      // 将结果通过 onChange 传递，父组件负责替换选中文段
      // 这里采用简化方案：在当前 cursor 位置插入结果
      const newValue = value.slice(0, cursor) + result + value.slice(cursor + selectedText.length);
      const newCursor = cursor + result.length;

      onChange(
        newValue,
        newCursor,
        newCursor,
        false,
        terminalContexts.map((ctx) => ctx.id),
      );

      clearSelection();
    },
    [value, cursor, selectedText, onChange, terminalContexts, clearSelection],
  );

  // 关闭工具栏
  const handleCloseToolbar = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <div ref={containerRef} className="relative">
      <ComposerPromptEditor
        ref={editorRef}
        value={value}
        cursor={cursor}
        terminalContexts={terminalContexts}
        mentionReferences={mentionReferences}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onRemoveTerminalContext={onRemoveTerminalContext}
        onChange={onChange}
        onCommandKeyDown={onCommandKeyDown}
        onPaste={onPaste}
      />

      {/* 浮动 AI 工具栏 */}
      {hasSelection && (
        <InlineAIToolbar
          selectedText={selectedText}
          selectionRect={selectionRect}
          onAction={handleAIAction}
          onApply={handleApplyResult}
          onClose={handleCloseToolbar}
        />
      )}
    </div>
  );
}

export default ComposerWithInlineAI;
