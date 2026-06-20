/**
 * @file terminalEventDispatcher.ts
 * @description 终端事件分发器，管理终端事件的订阅与分发。
 * 通过共享的后端事件监听器，将终端事件按线程 ID 和终端 ID 路由到对应的监听器。
 * 属于终端运行时基础设施层。
 */

import type { TerminalEvent } from "~/contracts";

import { readNativeApi } from "~/nativeApi";

/** 终端事件监听器类型 */
type TerminalEventListener = (event: TerminalEvent) => void;

/**
 * 根据线程 ID 和终端 ID 构建事件监听器的映射键。
 *
 * @param threadId - 线程标识
 * @param terminalId - 终端标识
 * @returns 格式为 `threadId::terminalId` 的映射键
 */
function terminalEventKey(threadId: string, terminalId: string): string {
  return `${threadId}::${terminalId}`;
}

/**
 * 终端事件分发器。维护按线程 ID 和终端 ID 索引的监听器集合，
 * 通过单一的后端事件源将事件路由到对应的监听器。
 * 当所有监听器取消订阅后，自动释放后端事件监听器。
 */
class TerminalEventDispatcher {
  /** 按映射键索引的监听器集合 */
  private listenersByKey = new Map<string, Set<TerminalEventListener>>();
  /** 后端共享事件监听器的取消函数 */
  private unsubscribeSharedListener: (() => void) | null = null;

  /**
   * 订阅指定线程和终端的事件。首次订阅时自动建立后端事件监听器。
   *
   * @param threadId - 线程标识
   * @param terminalId - 终端标识
   * @param listener - 事件监听器回调
   * @returns 取消订阅的函数
   */
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

    this.unsubscribeSharedListener = api.terminal.onEvent((event) => {
      const listeners = this.listenersByKey.get(terminalEventKey(event.threadId, event.terminalId));
      if (!listeners) return;
      for (const listener of listeners) {
        listener(event);
      }
    });
  }
}

export const terminalEventDispatcher = new TerminalEventDispatcher();
