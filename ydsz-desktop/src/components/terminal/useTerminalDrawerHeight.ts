/**
 * @file useTerminalDrawerHeight.ts
 * @description 封装终端抽屉的高度状态管理、边界约束和指针拖拽调整行为。
 * 提供抽屉高度的状态管理、最小/最大高度约束以及拖拽调整交互逻辑。
 */

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { DEFAULT_THREAD_TERMINAL_HEIGHT } from "../../types";

/** 抽屉最小高度（像素），防止抽屉被拖拽到过小 */
const MIN_DRAWER_HEIGHT = 180;
/** 抽屉最大高度占视口高度的比例 */
const MAX_DRAWER_HEIGHT_RATIO = 0.75;

/**
 * 计算抽屉的最大允许高度，基于视口高度和最大比例。
 * 在 SSR 环境下返回默认终端高度。
 *
 * @returns 最大抽屉高度（像素）
 */
function maxDrawerHeight(): number {
  if (typeof window === "undefined") return DEFAULT_THREAD_TERMINAL_HEIGHT;
  return Math.max(MIN_DRAWER_HEIGHT, Math.floor(window.innerHeight * MAX_DRAWER_HEIGHT_RATIO));
}

/**
 * 将抽屉高度约束在最小值和最大值之间。
 * 如果传入的高度不是有效有限数，则使用默认终端高度。
 *
 * @param height - 待约束的高度值
 * @returns 约束后的高度值（像素，四舍五入取整）
 */
export function clampTerminalDrawerHeight(height: number): number {
  const safeHeight = Number.isFinite(height) ? height : DEFAULT_THREAD_TERMINAL_HEIGHT;
  const maxHeight = maxDrawerHeight();
  return Math.min(Math.max(Math.round(safeHeight), MIN_DRAWER_HEIGHT), maxHeight);
}

/**
 * 终端抽屉高度管理 Hook，提供高度状态和拖拽调整交互。
 *
 * 核心行为：
 * - 维护抽屉高度状态，自动约束在合法范围内
 * - 支持指针拖拽调整高度，拖拽结束后同步到外部
 * - 监听窗口 resize 事件，自动调整高度到合法范围
 * - 组件卸载时自动同步最终高度
 *
 * @param options.height - 外部传入的初始高度
 * @param options.onHeightChange - 高度变化时的回调
 * @param options.resetKey - 重置键，变化时重新同步外部高度
 * @returns 抽屉高度和指针事件处理器
 */
export function useTerminalDrawerHeight(options: {
  height: number;
  onHeightChange: (height: number) => void;
  resetKey: string;
}) {
  const [drawerHeight, setDrawerHeight] = useState(() => clampTerminalDrawerHeight(options.height));
  /** 保存最新的抽屉高度，供事件回调中读取，避免闭包过期 */
  const drawerHeightRef = useRef(drawerHeight);
  /** 记录上次同步到外部的高度，避免重复触发回调 */
  const lastSyncedHeightRef = useRef(clampTerminalDrawerHeight(options.height));
  /** 保存最新的 onHeightChange 回调，避免闭包过期 */
  const onHeightChangeRef = useRef(options.onHeightChange);
  /** 拖拽调整状态，记录当前拖拽的指针 ID、起始 Y 坐标和起始高度 */
  const resizeStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  /** 标记本次拖拽是否实际改变了高度，用于判断松开时是否需要同步 */
  const didResizeDuringDragRef = useRef(false);

  useEffect(() => {
    onHeightChangeRef.current = options.onHeightChange;
  }, [options.onHeightChange]);

  useEffect(() => {
    drawerHeightRef.current = drawerHeight;
  }, [drawerHeight]);

  /** 将约束后的高度同步到外部回调，仅在高度实际变化时触发 */
  const syncHeight = useCallback((nextHeight: number) => {
    const clampedHeight = clampTerminalDrawerHeight(nextHeight);
    if (lastSyncedHeightRef.current === clampedHeight) return;
    lastSyncedHeightRef.current = clampedHeight;
    onHeightChangeRef.current(clampedHeight);
  }, []);

  /** 当外部高度或重置键变化时，重新同步抽屉高度状态 */
  useEffect(() => {
    const clampedHeight = clampTerminalDrawerHeight(options.height);
    setDrawerHeight(clampedHeight);
    drawerHeightRef.current = clampedHeight;
    lastSyncedHeightRef.current = clampedHeight;
  }, [options.height, options.resetKey]);

  /** 指针按下时开始拖拽调整，仅响应左键 */
  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    didResizeDuringDragRef.current = false;
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: drawerHeightRef.current,
    };
  }, []);

  /** 指针移动时根据拖拽偏移量实时更新抽屉高度 */
  const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const clampedHeight = clampTerminalDrawerHeight(
      resizeState.startHeight + (resizeState.startY - event.clientY),
    );
    if (clampedHeight === drawerHeightRef.current) {
      return;
    }
    didResizeDuringDragRef.current = true;
    drawerHeightRef.current = clampedHeight;
    setDrawerHeight(clampedHeight);
  }, []);

  /** 指针松开时结束拖拽，若高度有变化则同步到外部 */
  const handleResizePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      resizeStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!didResizeDuringDragRef.current) {
        return;
      }
      syncHeight(drawerHeightRef.current);
    },
    [syncHeight],
  );

  /** 监听窗口 resize 事件，当视口变化时重新约束抽屉高度 */
  useEffect(() => {
    const onWindowResize = () => {
      const clampedHeight = clampTerminalDrawerHeight(drawerHeightRef.current);
      const changed = clampedHeight !== drawerHeightRef.current;
      if (changed) {
        setDrawerHeight(clampedHeight);
        drawerHeightRef.current = clampedHeight;
      }
      if (!resizeStateRef.current) {
        syncHeight(clampedHeight);
      }
    };
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
    };
  }, [syncHeight]);

  useEffect(() => {
    return () => {
      syncHeight(drawerHeightRef.current);
    };
  }, [syncHeight]);

  return {
    drawerHeight,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerEnd,
  };
}
