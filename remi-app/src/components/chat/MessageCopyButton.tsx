/**
 * @file MessageCopyButton.tsx
 * @description 消息复制按钮组件，点击后将消息文本复制到剪贴板，并显示锚定提示。
 */

import { memo, useRef, type RefObject } from "react";
import { CheckIcon, CopyIcon } from "~/lib/icons";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { anchoredToastManager } from "../ui/toast";
import { MessageActionButton } from "./MessageActionButton";

/** 锚定提示的显示时长（毫秒） */
const ANCHORED_TOAST_TIMEOUT_MS = 1000;

/**
 * 在按钮旁显示锚定提示
 * @param ref - 按钮元素的引用
 * @param title - 提示标题
 * @param description - 提示描述（可选）
 */
function showCopyToast(
  ref: RefObject<HTMLButtonElement | null>,
  title: string,
  description?: string,
): void {
  if (!ref.current) return;

  anchoredToastManager.add({
    data: {
      tooltipStyle: true,
    },
    positionerProps: {
      anchor: ref.current,
    },
    timeout: ANCHORED_TOAST_TIMEOUT_MS,
    title,
    ...(description ? { description } : {}),
  });
}

/**
 * MessageCopyButton 组件
 * @description 消息复制按钮，点击后将消息文本复制到剪贴板，并显示锚定提示
 * @param props.text - 待复制的文本
 * @param props.size - 按钮大小
 * @param props.variant - 按钮变体样式
 * @param props.className - 额外类名
 */
export const MessageCopyButton = memo(function MessageCopyButton({
  text,
  size = "icon-xs",
  variant = "ghost",
  className,
}: {
  text: string;
  size?: "xs" | "icon-xs";
  variant?: "outline" | "ghost";
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    onCopy: () => showCopyToast(ref, "Copied!"),
    onError: (error: Error) => showCopyToast(ref, "Failed to copy", error.message),
    timeout: ANCHORED_TOAST_TIMEOUT_MS,
  });

  return (
    <MessageActionButton
      ref={ref}
      label="Copy message"
      tooltip="Copy to clipboard"
      disabled={isCopied}
      className={cn(variant === "outline" && "border", size === "xs" && "h-5 px-1.5", className)}
      onClick={() => copyToClipboard(text)}
    >
      {isCopied ? (
        <CheckIcon className="size-3.5 text-success" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </MessageActionButton>
  );
});
