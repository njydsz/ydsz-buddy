/**
 * @file useEscapeKey 通用 Hook
 *
 * 提供统一、可靠的 Esc 关闭行为,补齐 D-1 键盘导航规范的"非基 UI 弹层 Esc 关闭"要求。
 *
 * ## 设计目标
 *
 * - **零心智负担**:调用方只需传入 `onEscape` 回调,无需关心事件监听、清理、
 *   阻止冒泡、防止 IME 误触等细节。
 * - **与基 UI 协同**:基于 `@base-ui/react` 的 Dialog/Popover 已自带 Esc 关闭,
 *   本 Hook 主要用于 Toast、自定义模态、错误覆盖层、命令面板外部覆盖层等
 *   不在 Base UI 体系内的弹层。
 * - **栈式优先级**:Hook 实例按"最后挂载的最先响应"工作,符合模态栈直觉
 *   (用户按 Esc 总是想关闭最顶层的弹层)。
 * - **IME 友好**:中文/日文输入法在拼写阶段会派发 `Escape` 用于取消候选,
 *   此时 `keyCode === 229`,Hook 会忽略以避免吞掉输入法事件。
 * - **可访问元素限定**:默认只对 `document.activeElement` 位于 `enabledIn` 容器内
 *   (或当前没有任何受限容器时全局)触发,避免与"非激活模态"的内部 Esc 冲突。
 * - **不与全局快捷键冲突**:不与 `keybindings.ts` 中的 `Escape` 快捷键重复注册,
 *   单一职责 —— 只负责"弹层 Esc 关闭"语义。
 *
 * ## 使用示例
 *
 * ```tsx
 * function MyOverlay({ open, onClose, children }) {
 *   useEscapeKey(open, onClose);
 *   if (!open) return null;
 *   return <div role="dialog">{children}</div>;
 * }
 * ```
 *
 * ## 注意事项
 *
 * - 永远不要在同一时刻把 `useEscapeKey` 用于多个会同时打开的弹层,
 *   使用 `<EscapeKeyScope>` 让子作用域临时获得最高优先级。
 * - 当弹层会动态挂载/卸载,Hook 会自动根据 `active` 决定是否监听。
 */

import { useEffect, useRef } from "react";

/** Escape 键事件过滤选项 */
export interface UseEscapeKeyOptions {
  /**
   * 限定 Esc 仅在 `document.activeElement` 位于该容器内(或容器内子元素)
   * 时触发回调。默认 `null` 表示不限定。
   *
   * 用于模态栈:外层模态挂载时限定为它的根元素,
   * 内层模态挂载时再注册一个更窄的作用域,自然形成"内层优先"。
   */
  enabledIn?: HTMLElement | null;
  /**
   * 是否阻止 Esc 的默认行为(浏览器内置 Esc 可能触发全屏退出等)。
   * 默认 `true` —— 弹层期望独占响应 Esc。
   */
  preventDefault?: boolean;
  /**
   * 是否在事件上调用 `stopPropagation()`。
   * 默认 `false` —— 让外层模态有机会一起响应(例如多级 Toast 同时关闭)。
   * 设置为 `true` 表示独占(单层模态 + 命令面板等)。
   */
  stopPropagation?: boolean;
}

interface EscapeEntry {
  /** 注册顺序的稳定 id,用于在卸载时从栈中移除 */
  id: number;
  /** 当前是否处于启用状态 */
  active: boolean;
  /** 触发回调 */
  handler: (event: KeyboardEvent) => void;
  /** 限定作用的容器 */
  scope: HTMLElement | null;
}

// 全局栈:同窗口共享,按"后注册先响应"排序
const escapeStack: EscapeEntry[] = [];
let nextEntryId = 1;
let globalListenerInstalled = false;

function isEventInScope(event: KeyboardEvent, scope: HTMLElement | null): boolean {
  if (!scope) {
    return true;
  }
  if (typeof document === "undefined") {
    return false;
  }
  const active = document.activeElement;
  if (active && active instanceof Node && scope.contains(active)) {
    return true;
  }
  // 也允许事件冒泡路径上的元素作为作用域命中,例如弹层内部 <input> 触发的 Esc
  if (event.target instanceof Node && scope.contains(event.target)) {
    return true;
  }
  return false;
}

function dispatchEscape(event: KeyboardEvent): void {
  // 从栈顶向下找到第一个 active 且 scope 命中的条目
  for (let i = escapeStack.length - 1; i >= 0; i -= 1) {
    const entry = escapeStack[i]!;
    if (!entry.active) {
      continue;
    }
    if (!isEventInScope(event, entry.scope)) {
      continue;
    }
    entry.handler(event);
    return;
  }
}

function ensureGlobalListener(): void {
  if (globalListenerInstalled || typeof window === "undefined") {
    return;
  }
  globalListenerInstalled = true;
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" && event.key !== "Esc") {
      return;
    }
    // IME 拼写态:keyCode 为 229 表示输入法正在消费 Esc,放过
    if (event.keyCode === 229 || event.isComposing) {
      return;
    }
    dispatchEscape(event);
  });
}

/**
 * 注册一个 Esc 关闭处理器。
 *
 * @param active 是否启用。`false` 时不会监听(用于关闭态的弹层)。
 * @param onEscape 触发回调。返回一个可选 boolean:
 *   - `true` 表示已处理,Hook 会自动 `preventDefault`/`stopPropagation` (按 opts)。
 *   - `false` 或 `void` 表示不消费事件,继续向上层弹层派发。
 * @param options 过滤选项
 */
export function useEscapeKey(
  active: boolean,
  onEscape: (event: KeyboardEvent) => void | boolean,
  options: UseEscapeKeyOptions = {},
): void {
  const { enabledIn = null, preventDefault = true, stopPropagation = false } = options;
  // 保留最新回调与最新 active,避免卸载/订阅频繁时回调闭包过期
  const handlerRef = useRef(onEscape);
  const activeRef = useRef(active);
  const optsRef = useRef({ enabledIn, preventDefault, stopPropagation });
  const entryRef = useRef<EscapeEntry | null>(null);

  useEffect(() => {
    handlerRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    activeRef.current = active;
    if (entryRef.current) {
      entryRef.current.active = active;
    }
  }, [active]);

  useEffect(() => {
    optsRef.current = { enabledIn, preventDefault, stopPropagation };
    if (entryRef.current) {
      entryRef.current.scope = enabledIn;
    }
  }, [enabledIn, preventDefault, stopPropagation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    ensureGlobalListener();

    const entry: EscapeEntry = {
      id: nextEntryId++,
      active: activeRef.current,
      handler: (event) => {
        const consumed = handlerRef.current(event);
        if (consumed === false) {
          return;
        }
        const opts = optsRef.current;
        if (opts.preventDefault) {
          event.preventDefault();
        }
        if (opts.stopPropagation) {
          event.stopPropagation();
        }
      },
      scope: optsRef.current.enabledIn,
    };
    entryRef.current = entry;
    escapeStack.push(entry);

    return () => {
      const index = escapeStack.findIndex((existing) => existing.id === entry.id);
      if (index >= 0) {
        escapeStack.splice(index, 1);
      }
      if (entryRef.current?.id === entry.id) {
        entryRef.current = null;
      }
    };
  }, []);
}

/**
 * 当前 Escape 栈深度(用于测试/调试)。
 */
export function getEscapeStackDepth(): number {
  return escapeStack.length;
}

/**
 * 清空 Escape 栈(仅用于测试清理)。
 */
export function resetEscapeStack(): void {
  escapeStack.length = 0;
  nextEntryId = 1;
}
