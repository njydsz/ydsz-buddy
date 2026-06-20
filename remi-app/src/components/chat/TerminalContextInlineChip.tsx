/**
 * @file TerminalContextInlineChip.tsx
 * @description 终端上下文内联标签组件，在编辑器中显示终端上下文的缩略标签，支持过期状态和工具提示。
 */

import { TerminalIcon } from "~/lib/icons";

import { cn } from "~/lib/utils";
import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * TerminalContextInlineChip 组件的属性接口
 */
interface TerminalContextInlineChipProps {
  /** 标签显示文本 */
  label: string;
  /** 工具提示文本 */
  tooltipText: string;
  /** 上下文是否已过期 */
  expired?: boolean;
}

/**
 * TerminalContextInlineChip 组件
 * @description 终端上下文内联标签，在编辑器中显示终端上下文的缩略标签
 * @param props.label - 标签显示文本
 * @param props.tooltipText - 工具提示文本
 * @param props.expired - 上下文是否已过期
 */
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
