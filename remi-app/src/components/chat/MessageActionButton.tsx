/**
 * @file MessageActionButton.tsx
 * @description 消息操作按钮的共享外壳组件，提供统一的图标按钮样式和工具提示。
 */

import { forwardRef, memo, type ComponentProps, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** 消息操作按钮的基础样式类名 */
export const MESSAGE_ACTION_BUTTON_CLASS_NAME =
  "sidebar-icon-button inline-flex size-5 cursor-pointer border border-transparent bg-transparent shadow-none disabled:cursor-default disabled:opacity-45";

/**
 * MessageActionButton 组件的属性类型
 */
type MessageActionButtonProps = Omit<
  ComponentProps<"button">,
  "aria-label" | "children" | "title"
> & {
  /** 按钮内容（通常为图标） */
  children: ReactNode;
  /** 无障碍标签 */
  label: string;
  /** 工具提示内容 */
  tooltip: ReactNode;
  /** 工具提示弹出方向 */
  tooltipSide?: ComponentProps<typeof TooltipPopup>["side"];
};

/**
 * MessageActionButton 组件
 * @description 消息操作按钮的共享外壳，提供统一的图标按钮样式和工具提示
 * @param props.children - 按钮内容
 * @param props.label - 无障碍标签
 * @param props.tooltip - 工具提示内容
 * @param props.tooltipSide - 工具提示弹出方向
 */
export const MessageActionButton = memo(
  forwardRef<HTMLButtonElement, MessageActionButtonProps>(function MessageActionButton(
    { children, className, label, tooltip, tooltipSide = "top", type = "button", ...props },
    ref,
  ) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              {...props}
              ref={ref}
              type={type}
              aria-label={label}
              className={cn(MESSAGE_ACTION_BUTTON_CLASS_NAME, className)}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipPopup side={tooltipSide}>
          {typeof tooltip === "string" ? <p>{tooltip}</p> : tooltip}
        </TooltipPopup>
      </Tooltip>
    );
  }),
);
