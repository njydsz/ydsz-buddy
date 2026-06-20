/**
 * @file PickerTriggerButton.tsx
 * @description 选择器触发按钮，为头部和编辑器中的下拉式选择器提供统一的触发按钮外壳。
 */

import { type ComponentProps, type ReactNode } from "react";
import { ChevronDownIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME } from "./composerPickerStyles";

/**
 * PickerTriggerButton 组件
 * @description 选择器触发按钮，为下拉式选择器提供统一的触发按钮外壳
 * @param props.icon - 按钮左侧图标
 * @param props.label - 按钮标签
 * @param props.compact - 是否使用紧凑模式
 */
export function PickerTriggerButton(
  props: {
    icon: ReactNode;
    label: ReactNode;
    compact?: boolean;
  } & Omit<ComponentProps<typeof Button>, "children" | "size" | "variant">,
) {
  const { icon, label, compact, className, ...buttonProps } = props;

  return (
    <Button
      {...buttonProps}
      size="sm"
      variant="chrome"
      className={cn(
        "min-w-0 justify-start overflow-hidden whitespace-nowrap px-1.5 text-[var(--color-text-foreground)] [&_svg]:mx-0",
        COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME,
        compact ? "max-w-52 shrink-0" : "max-w-56 shrink sm:max-w-64 sm:px-1.5",
        className,
      )}
    >
      <span
        className={cn(
          "flex min-w-0 w-full items-center gap-2 overflow-hidden",
          compact ? "max-w-44" : undefined,
        )}
      >
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
      </span>
    </Button>
  );
}
