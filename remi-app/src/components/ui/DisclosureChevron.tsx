/**
 * @file DisclosureChevron
 * @description 共享的旋转箭头组件，用于可折叠头部（如聊天和侧边栏）的展开/收起指示。
 */

import { ChevronRightIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

/**
 * 折叠指示箭头组件，展开时旋转 90 度
 * @param props.open - 是否处于展开状态
 * @param props.className - 自定义样式类名
 */
export function DisclosureChevron(props: { open: boolean; className?: string | undefined }) {
  const { open, className } = props;

  return (
    <ChevronRightIcon
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out",
        open && "rotate-90",
        className,
      )}
    />
  );
}
