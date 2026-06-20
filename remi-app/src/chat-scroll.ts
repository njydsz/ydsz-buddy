/**
 * @file 聊天滚动位置工具
 * @description 提供聊天面板滚动容器与底部距离计算、自动滚动判断等工具函数，
 * 用于实现消息流式输出时的自动滚底行为。
 */

/** 判定"接近底部"的像素阈值，当距底部不超过此值时视为需要自动滚底 */
export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64;

/** 滚动容器的位置信息 */
interface ScrollPosition {
  /** 当前滚动偏移量 */
  scrollTop: number;
  /** 可视区域高度 */
  clientHeight: number;
  /** 内容总高度 */
  scrollHeight: number;
}

/**
 * 计算滚动容器当前距底部的像素距离
 *
 * @param position - 滚动容器的位置信息
 * @returns 距底部的像素距离，若位置参数无效则返回 0
 *
 * @example
 * ```ts
 * const distance = getScrollContainerDistanceFromBottom({
 *   scrollTop: 100,
 *   clientHeight: 500,
 *   scrollHeight: 700,
 * }); // => 100
 * ```
 */
export function getScrollContainerDistanceFromBottom(position: ScrollPosition): number {
  const { scrollTop, clientHeight, scrollHeight } = position;
  if (![scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) {
    return 0;
  }

  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

/**
 * 判断滚动容器是否"接近底部"
 *
 * 当距底部距离不超过阈值时返回 true，用于决定是否在收到新消息时自动滚底。
 *
 * @param position - 滚动容器的位置信息
 * @param thresholdPx - 判定阈值（像素），默认为 AUTO_SCROLL_BOTTOM_THRESHOLD_PX
 * @returns 是否接近底部
 *
 * @example
 * ```ts
 * isScrollContainerNearBottom({ scrollTop: 636, clientHeight: 500, scrollHeight: 700 }); // true
 * isScrollContainerNearBottom({ scrollTop: 0, clientHeight: 500, scrollHeight: 700 });   // false
 * ```
 */
export function isScrollContainerNearBottom(
  position: ScrollPosition,
  thresholdPx = AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
): boolean {
  const threshold = Number.isFinite(thresholdPx)
    ? Math.max(0, thresholdPx)
    : AUTO_SCROLL_BOTTOM_THRESHOLD_PX;

  return getScrollContainerDistanceFromBottom(position) <= threshold;
}
