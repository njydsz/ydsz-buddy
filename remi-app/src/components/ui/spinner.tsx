/** @file spinner
 * @description 加载旋转指示器组件，基于 Loader2Icon 实现旋转动画。
 */

import { Loader2Icon } from "~/lib/icons";
import { cn } from "~/lib/utils";

/** 加载旋转指示器组件 */
function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
