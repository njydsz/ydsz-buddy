/**
 * @file toast.logic
 * @description Toast 布局计算逻辑，负责折叠堆叠时的内容隐藏判断和可见 Toast 的偏移布局计算。
 */

/**
 * 判断折叠堆叠中的 Toast 是否应该隐藏内容
 * @param visibleToastIndex - Toast 在可见列表中的索引（0 为最前面）
 * @param visibleToastCount - 可见 Toast 总数
 * @returns 非最前面的 Toast 在堆叠模式下应隐藏内容
 */
export function shouldHideCollapsedToastContent(
  visibleToastIndex: number,
  visibleToastCount: number,
): boolean {
  // Keep the front-most toast readable even if Base UI marks it as "behind"
  // due to toasts hidden by thread filtering.
  if (visibleToastCount <= 1) return false;
  return visibleToastIndex > 0;
}

type ToastWithHeight = {
  height?: number | null | undefined;
};

type VisibleToastLayoutItem<TToast extends object> = {
  toast: TToast;
  visibleIndex: number;
  offsetY: number;
};

/**
 * 构建可见 Toast 的布局信息，计算每个 Toast 的垂直偏移和最前面 Toast 的高度
 * @param visibleToasts - 可见 Toast 列表（需包含 height 属性）
 * @returns 包含最前面 Toast 高度和每个 Toast 布局项（含偏移量）的结果对象
 */
export function buildVisibleToastLayout<TToast extends object>(
  visibleToasts: readonly (TToast & ToastWithHeight)[],
): {
  frontmostHeight: number;
  items: VisibleToastLayoutItem<TToast & ToastWithHeight>[];
} {
  let offsetY = 0;

  return {
    frontmostHeight: normalizeToastHeight(visibleToasts[0]?.height),
    items: visibleToasts.map((toast, visibleIndex) => {
      const item = {
        toast,
        visibleIndex,
        offsetY,
      };

      offsetY += normalizeToastHeight(toast.height);
      return item;
    }),
  };
}

/** 将 Toast 高度规范化为有效正数，无效值返回 0 */
function normalizeToastHeight(height: number | null | undefined): number {
  return typeof height === "number" && Number.isFinite(height) && height > 0 ? height : 0;
}
