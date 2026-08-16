/**
 * @file useIdleDetector
 * @description 监听鼠标 / 键盘 / 指针活动,通过 onActivity 回调通知上层
 *
 * ## 设计原则
 *
 * - **仅监听,不持有状态**:本 hook 不持有 idle 时间,真正的阈值判断在
 *   后端 `IdleLockState`。前端只把"有活动"信号通过 callback 上报。
 * - **事件可定制**:默认监听 `mousemove / keydown / pointerdown / wheel /
 *   touchstart`;调用方可在 `events` 字段覆盖。
 * - **去重 passive listener**:事件都是 passive,避免阻塞滚动。
 * - **SSR 安全**:`typeof window === "undefined"` 时直接返回空函数。
 */
import { useEffect } from "react";

export type IdleActivityEvent =
  | "mousemove"
  | "keydown"
  | "pointerdown"
  | "wheel"
  | "touchstart"
  | "click";

const DEFAULT_EVENTS: IdleActivityEvent[] = [
  "mousemove",
  "keydown",
  "pointerdown",
  "wheel",
  "touchstart",
  "click",
];

export interface UseIdleDetectorOptions {
  /** 触发回调的事件列表;默认包含 mousemove/keydown/pointerdown/wheel/touchstart/click */
  events?: IdleActivityEvent[];
  /** 是否暂停监听(临时关闭,例如隐私屏覆盖期间仍要监听以记录登录尝试) */
  paused?: boolean;
  /** 触发回调 */
  onActivity: (event: IdleActivityEvent) => void;
}

export function useIdleDetector(options: UseIdleDetectorOptions): void {
  const { events = DEFAULT_EVENTS, paused = false, onActivity } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (paused) return;

    const handler = (e: Event) => {
      onActivity(e.type as IdleActivityEvent);
    };

    for (const name of events) {
      window.addEventListener(name, handler, { passive: true });
    }
    return () => {
      for (const name of events) {
        window.removeEventListener(name, handler);
      }
    };
  }, [events, paused, onActivity]);
}
