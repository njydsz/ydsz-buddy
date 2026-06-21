/**
 * @file 终端事件分发器
 *
 * 本模块将来自 WebSocket 的 `TerminalEvent` 流分发给对应的 xterm 运行时实例。
 *
 * ## 核心职责
 *
 * - **事件订阅**：订阅 WebSocket 终端事件流
 * - **事件路由**：根据 terminalId 路由到对应运行时
 * - **错误处理**：事件丢失/迟到时的兜底
 * - **生命周期管理**：随组件挂载/卸载启停
 *
 * ## 核心导出
 *
 * - `TerminalEventDispatcher`：单实例分发器
 * - `dispatchTerminalEvent`：分发单个事件
 * - `subscribeTerminalEvents`：订阅事件流
 *
 * ## 使用场景
 *
 * - TerminalViewportPane 内部的实时更新
 * - 多终端并行接收事件
 *
 * ## 注意事项
 *
 * - 事件按到达顺序处理
 * - 未知 terminalId 的事件被丢弃
 * - 分发器全局唯一
 */

import type { TerminalEvent } from "~/contracts";

import { readNativeApi } from "~/nativeApi";

type TerminalEventListener = (event: TerminalEvent) => void;

function terminalEventKey(threadId: string, terminalId: string): string {
  return `${threadId}::${terminalId}`;
}

class TerminalEventDispatcher {
  private listenersByKey = new Map<string, Set<TerminalEventListener>>();
  private unsubscribeSharedListener: (() => void) | null = null;

  subscribe(threadId: string, terminalId: string, listener: TerminalEventListener): () => void {
    const key = terminalEventKey(threadId, terminalId);
    const listeners = this.listenersByKey.get(key) ?? new Set<TerminalEventListener>();
    listeners.add(listener);
    this.listenersByKey.set(key, listeners);
    this.ensureSharedListener();

    return () => {
      const nextListeners = this.listenersByKey.get(key);
      if (!nextListeners) return;
      nextListeners.delete(listener);
      if (nextListeners.size === 0) {
        this.listenersByKey.delete(key);
      }
      if (this.listenersByKey.size === 0) {
        this.unsubscribeSharedListener?.();
        this.unsubscribeSharedListener = null;
      }
    };
  }

  private ensureSharedListener(): void {
    if (this.unsubscribeSharedListener) return;
    const api = readNativeApi();
    if (!api) return;

    this.unsubscribeSharedListener = api.terminal.onEvent((event: TerminalEvent) => {
      const listeners = this.listenersByKey.get(terminalEventKey(event.threadId, event.terminalId));
      if (!listeners) return;
      for (const listener of listeners) {
        listener(event);
      }
    });
  }
}

export const terminalEventDispatcher = new TerminalEventDispatcher();
