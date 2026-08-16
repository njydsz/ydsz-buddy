/**
 * @file 终端上下文内联标签组件
 *
 * 本组件以紧凑的 chip 形式展示终端上下文（命令/输出），
 * 用于在 Composer 中内联显示已选中的引用。
 *
 * ## 核心职责
 *
 * - **标签展示**：终端 ID + 命令摘要
 * - **点击预览**：展开查看完整输出
 * - **删除操作**：从 Composer 中移除引用
 *
 * ## 使用场景
 *
 * - Composer 中已选中的终端上下文
 * - 消息行内引用其他线程的终端输出
 *
 * ## 注意事项
 *
 * - 输出过长时显示截断
 * - 失效（> 5 分钟）时变灰
 */

import { TerminalIcon } from "~/lib/icons";

import { cn } from "~/lib/utils";
import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface TerminalContextInlineChipProps {
  label: string;
  tooltipText: string;
  expired?: boolean;
}

export function TerminalContextInlineChip(props: TerminalContextInlineChipProps) {
  const { label, tooltipText, expired = false } = props;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              COMPOSER_INLINE_CHIP_CLASS_NAME,
              expired && "border-destructive/35 bg-destructive/8 text-destructive",
            )}
            data-terminal-context-expired={expired ? "true" : undefined}
          >
            <TerminalIcon
              className={cn(
                COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
                "size-3.5",
                expired && "opacity-100",
              )}
            />
            <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-80 whitespace-pre-wrap leading-tight">
        {tooltipText}
      </TooltipPopup>
    </Tooltip>
  );
}
