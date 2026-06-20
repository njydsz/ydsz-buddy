/**
 * @file TranscriptSelectionAction.tsx
 * @description 浮动的"添加到聊天"操作按钮，在用户选中助手对话文本时显示。
 */

import { MessageCircleIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

/**
 * TranscriptSelectionAction 组件的属性接口
 */
interface TranscriptSelectionActionProps {
  /** 浮动按钮的左偏移量 */
  left: number;
  /** 浮动按钮的上偏移量 */
  top: number;
  /** 按钮放置位置（上方/下方） */
  placement: "top" | "bottom";
  /** 添加到聊天的回调 */
  onAddToChat: () => void;
}

/**
 * TranscriptSelectionAction 组件
 * @description 浮动的"添加到聊天"操作按钮，在用户选中助手对话文本时显示
 * @param props.left - 左偏移量
 * @param props.top - 上偏移量
 * @param props.placement - 放置位置
 * @param props.onAddToChat - 添加到聊天回调
 */
export function TranscriptSelectionAction(props: TranscriptSelectionActionProps) {
  return (
    <div
      data-transcript-selection-action="true"
      className="pointer-events-none fixed z-50"
      style={{ left: props.left, top: props.top }}
      aria-hidden="true"
    >
      <button
        type="button"
        className={cn(
          "pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[var(--color-background-elevated-primary-opaque)] px-3 text-[11px] font-medium text-[var(--color-text-foreground)] shadow-xl backdrop-blur-xl transition-transform duration-150 hover:scale-[1.01] hover:bg-[var(--color-background-elevated-secondary)]",
          props.placement === "top" ? "origin-bottom" : "origin-top",
        )}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onAddToChat();
        }}
      >
        <MessageCircleIcon className="size-3.5" />
        <span>Add to chat</span>
      </button>
    </div>
  );
}
