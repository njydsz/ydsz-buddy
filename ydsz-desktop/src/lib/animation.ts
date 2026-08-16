/**
 * @file 动画配置与工具
 *
 * 统一动画配置，支持"减少动画"偏好：
 *
 * - **动画时长**：统一 200ms ease-out
 * - **Spring 物理**：自然弹性效果
 * - **减少动画**：prefers-reduced-motion 支持
 * - **性能优化**：不阻塞主线程
 *
 * ## 核心导出
 *
 * - `ANIMATION_CONFIG`: 统一动画配置
 * - `useReducedMotion`: 检测减少动画偏好（来自全局 appearance store）
 * - `getAnimationDuration` / `getTransition`: 动画工具函数
 * - `getFadeInStyle` / `getScaleStyle` / `getSlideInStyle` / `getExpandStyle`: 动画样式工具
 *
 * ## 使用场景
 *
 * - 所有动画组件
 * - 主题切换
 * - 模态对话框
 *
 * ## 注意事项
 *
 * - 尊重系统"减少动画"设置
 * - 动画时长 < 50ms（减少动画模式）
 * - 使用 transform/opacity 避免重排
 */

export { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * 动画配置
 */
export const ANIMATION_CONFIG = {
  /** 标准时长 */
  duration: {
    fast: 150,
    normal: 200,
    slow: 300,
  },
  /** 缓动函数 */
  easing: {
    easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  /** Spring 物理配置 */
  spring: {
    gentle: { stiffness: 120, damping: 20 },
    normal: { stiffness: 180, damping: 18 },
    stiff: { stiffness: 240, damping: 20 },
  },
} as const;

/**
 * 获取动画时长（考虑减少动画偏好）
 *
 * @param duration - 原始时长
 * @param prefersReduced - 是否偏好减少动画
 * @returns 实际使用的时长
 */
export function getAnimationDuration(
  duration: number,
  prefersReduced: boolean,
): number {
  return prefersReduced ? Math.min(duration, 50) : duration;
}

/**
 * 获取 CSS transition 字符串
 *
 * @param properties - CSS 属性数组
 * @param duration - 动画时长
 * @param easing - 缓动函数
 * @param prefersReduced - 是否偏好减少动画
 * @returns CSS transition 字符串
 */
export function getTransition(
  properties: string[],
  duration: number = ANIMATION_CONFIG.duration.normal,
  easing: string = ANIMATION_CONFIG.easing.easeOut,
  prefersReduced: boolean = false,
): string {
  const actualDuration = getAnimationDuration(duration, prefersReduced);
  return properties
    .map((prop) => `${prop} ${actualDuration}ms ${easing}`)
    .join(", ");
}

/**
 * 淡入动画样式
 */
export function getFadeInStyle(
  isVisible: boolean,
  prefersReduced: boolean = false,
): React.CSSProperties {
  const duration = getAnimationDuration(ANIMATION_CONFIG.duration.normal, prefersReduced);
  return {
    opacity: isVisible ? 1 : 0,
    transition: `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`,
  };
}

/**
 * 缩放动画样式
 */
export function getScaleStyle(
  isVisible: boolean,
  prefersReduced: boolean = false,
): React.CSSProperties {
  const duration = getAnimationDuration(ANIMATION_CONFIG.duration.normal, prefersReduced);
  return {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "scale(1)" : "scale(0.95)",
    transition: `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}, transform ${duration}ms ${ANIMATION_CONFIG.easing.spring}`,
  };
}

/**
 * 滑入动画样式
 */
export function getSlideInStyle(
  isVisible: boolean,
  direction: "up" | "down" | "left" | "right" = "up",
  distance: number = 20,
  prefersReduced: boolean = false,
): React.CSSProperties {
  const duration = getAnimationDuration(ANIMATION_CONFIG.duration.normal, prefersReduced);

  const transformMap = {
    up: `translateY(${distance}px)`,
    down: `translateY(-${distance}px)`,
    left: `translateX(${distance}px)`,
    right: `translateX(-${distance}px)`,
  };

  return {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translate(0, 0)" : transformMap[direction],
    transition: `opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}, transform ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`,
  };
}

/**
 * 展开/收起动画样式
 */
export function getExpandStyle(
  isExpanded: boolean,
  prefersReduced: boolean = false,
): React.CSSProperties {
  const duration = getAnimationDuration(ANIMATION_CONFIG.duration.normal, prefersReduced);
  return {
    maxHeight: isExpanded ? "1000px" : "0",
    opacity: isExpanded ? 1 : 0,
    overflow: "hidden",
    transition: `max-height ${duration}ms ${ANIMATION_CONFIG.easing.easeInOut}, opacity ${duration}ms ${ANIMATION_CONFIG.easing.easeOut}`,
  };
}

/**
 * 动画类名生成器
 */
export const animationClasses = {
  fadeIn: "transition-opacity duration-200 ease-out",
  scale: "transition-all duration-200 ease-out",
  slide: "transition-all duration-200 ease-out",
  expand: "transition-all duration-200 ease-in-out overflow-hidden",
} as const;
