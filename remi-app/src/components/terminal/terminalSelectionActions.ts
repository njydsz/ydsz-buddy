/**
 * @file terminalSelectionActions.ts
 * @description 终端选区操作的位置计算和交互辅助函数。
 * 提供选区操作弹窗的定位、多击延迟判断和鼠标松开事件处理。
 * 属于聊天终端工作区辅助层。
 */

/** 多击选区操作的延迟阈值（毫秒），双击及以上时延迟显示操作弹窗 */
const MULTI_CLICK_SELECTION_ACTION_DELAY_MS = 260;

/**
 * 解析终端选区操作弹窗的显示位置。根据选区矩形、指针位置和视口边界，
 * 计算弹窗的最佳坐标，确保不超出视口范围。
 *
 * @param options.bounds - 终端抽屉的边界矩形
 * @param options.selectionRect - 选区矩形（右下角坐标），无选区时为 null
 * @param options.pointer - 指针位置坐标，无指针时为 null
 * @param options.viewport - 视口尺寸，SSR 环境下为 null
 * @returns 弹窗显示的 x/y 坐标
 */
export function resolveTerminalSelectionActionPosition(options: {
  bounds: { left: number; top: number; width: number; height: number };
  selectionRect: { right: number; bottom: number } | null;
  pointer: { x: number; y: number } | null;
  viewport?: { width: number; height: number } | null;
}): { x: number; y: number } {
  const { bounds, selectionRect, pointer, viewport } = options;
  const viewportWidth =
    viewport?.width ??
    (typeof window === "undefined" ? bounds.left + bounds.width + 8 : window.innerWidth);
  const viewportHeight =
    viewport?.height ??
    (typeof window === "undefined" ? bounds.top + bounds.height + 8 : window.innerHeight);
  const drawerLeft = Math.round(bounds.left);
  const drawerTop = Math.round(bounds.top);
  const drawerRight = Math.round(bounds.left + bounds.width);
  const drawerBottom = Math.round(bounds.top + bounds.height);
  const preferredX =
    selectionRect !== null
      ? Math.round(selectionRect.right)
      : pointer === null
        ? Math.round(bounds.left + bounds.width - 140)
        : Math.max(drawerLeft, Math.min(Math.round(pointer.x), drawerRight));
  const preferredY =
    selectionRect !== null
      ? Math.round(selectionRect.bottom + 4)
      : pointer === null
        ? Math.round(bounds.top + 12)
        : Math.max(drawerTop, Math.min(Math.round(pointer.y), drawerBottom));
  return {
    x: Math.max(8, Math.min(preferredX, Math.max(viewportWidth - 8, 8))),
    y: Math.max(8, Math.min(preferredY, Math.max(viewportHeight - 8, 8))),
  };
}

/**
 * 根据点击次数返回选区操作的延迟时间。
 * 双击及以上时返回延迟阈值，单击时无延迟。
 *
 * @param clickCount - 点击次数
 * @returns 延迟时间（毫秒）
 */
export function terminalSelectionActionDelayForClickCount(clickCount: number): number {
  return clickCount >= 2 ? MULTI_CLICK_SELECTION_ACTION_DELAY_MS : 0;
}

/**
 * 判断是否应处理终端选区的鼠标松开事件。
 * 仅在选区手势活跃且为左键松开时返回 true。
 *
 * @param selectionGestureActive - 选区手势是否活跃
 * @param button - 鼠标按钮编号（0 为左键）
 * @returns 是否应处理该鼠标松开事件
 */
export function shouldHandleTerminalSelectionMouseUp(
  selectionGestureActive: boolean,
  button: number,
): boolean {
  return selectionGestureActive && button === 0;
}
