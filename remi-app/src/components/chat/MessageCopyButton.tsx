/**
 * @file 消息复制按钮组件
 *
 * 本组件提供"复制消息内容"功能：
 *
 * - **复制消息**：将消息文本（Markdown / 纯文本）复制到剪贴板
 * - **状态反馈**：复制成功后短暂显示对勾
 * - **超时重置**：2 秒后恢复图标
 *
 * ## 核心导出
 *
 * - `MessageCopyButton`：复制按钮
 * - `MessageCopyButtonHandle`：通过 ref 触发的命令式 API
 *
 * ## 使用场景
 *
 * - 消息行尾的"复制"按钮
 * - 用户消息 / AI 消息均支持
 * - 选区复制
 *
 * ## 注意事项
 *
 * - 复制 Markdown 源码（保留格式）
 * - 长内容（> 100k 字符）使用分块复制
 * - 失败时显示错误提示
 */

import { memo, useRef, type RefObject } from "react";
import { CheckIcon, CopyIcon } from "~/lib/icons";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { anchoredToastManager } from "../ui/toast";
import { MessageActionButton } from "./MessageActionButton";

const ANCHORED_TOAST_TIMEOUT_MS = 1000;

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
