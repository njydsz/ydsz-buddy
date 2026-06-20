/**
 * @file separator
 * @description 分隔线组件，基于 Base UI Separator 原语封装，支持水平和垂直方向。
 */
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "~/lib/utils";

/**
 * 分隔线组件
 * @param className - 自定义类名
 * @param orientation - 分隔线方向，默认为 "horizontal"
 * @returns 渲染后的分隔线元素
 */
function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:not-[[class^='h-']]:not-[[class*='_h-']]:self-stretch",
        className,
      )}
      data-slot="separator"
      orientation={orientation}
      {...props}
    />
  );
}

export { Separator };
