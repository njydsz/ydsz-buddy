/**
 * @file terminalRuntimeRegistry.ts
 * @description 终端运行时注册表，维护稳定的运行时映射并委托终端生命周期操作到 terminalRuntime.ts。
 * 属于终端运行时基础设施层，依赖 terminalRuntime.ts 处理生命周期，
 * 依赖 terminalRuntimeTypes.ts 提供稳定标识和契约。
 */

import { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";

import {
  attachRuntimeToContainer,
  createRuntimeEntry,
  detachRuntimeFromContainer,
  disposeRuntimeEntry,
  syncRuntimeConfig,
  updateRuntimeViewState,
} from "./terminalRuntime";
import type {
  TerminalRuntimeConfig,
  TerminalRuntimeEntry,
  TerminalRuntimeViewState,
} from "./terminalRuntimeTypes";
import { buildTerminalRuntimeKey } from "./terminalRuntimeTypes";

/** 重新导出终端运行时类型和工具，供外部直接使用 */
export { buildTerminalRuntimeKey, type TerminalRuntimeCallbacks } from "./terminalRuntimeTypes";

// --- 注册表编排 -------------------------------------------------

/**
 * 终端运行时注册表。维护运行时键到运行时条目的映射，
 * 委托创建、挂载、卸载、销毁等生命周期操作到 terminalRuntime.ts。
 * 确保同一运行时键只创建一个运行时实例，配置变更时同步更新。
 */
class TerminalRuntimeRegistry {
  /** 运行时键到运行时条目的映射 */
  private entries = new Map<string, TerminalRuntimeEntry>();

  /**
   * 挂载终端运行时到指定容器。若运行时条目不存在则创建，已存在则同步配置。
   *
   * @param config - 终端运行时配置
   * @param viewState - 视图状态
   * @param container - 目标 DOM 容器
   * @returns 终端实例和搜索插件
   */
  attach(
    config: TerminalRuntimeConfig,
    viewState: TerminalRuntimeViewState,
    container: HTMLDivElement,
  ): { terminal: Terminal; searchAddon: SearchAddon } {
    let entry = this.entries.get(config.runtimeKey);
    if (!entry) {
      entry = createRuntimeEntry(config);
      this.entries.set(config.runtimeKey, entry);
    } else {
      syncRuntimeConfig(entry, config);
    }

    attachRuntimeToContainer(entry, viewState, container);
    return {
      terminal: entry.terminal,
      searchAddon: entry.searchAddon,
    };
  }

  /**
   * 同步运行时配置到已有的运行时条目。
   *
   * @param runtimeKey - 运行时唯一键
   * @param config - 新的运行时配置
   */
  syncConfig(runtimeKey: string, config: TerminalRuntimeConfig): void {
    const entry = this.entries.get(runtimeKey);
    if (!entry) return;
    syncRuntimeConfig(entry, config);
  }

  /**
   * 更新运行时条目的视图状态。
   *
   * @param runtimeKey - 运行时唯一键
   * @param viewState - 新的视图状态
   */
  setViewState(runtimeKey: string, viewState: TerminalRuntimeViewState): void {
    const entry = this.entries.get(runtimeKey);
    if (!entry) return;
    updateRuntimeViewState(entry, viewState);
  }

  /**
   * 将运行时条目从 DOM 容器卸载，但不销毁运行时实例。
   *
   * @param runtimeKey - 运行时唯一键
   */
  detach(runtimeKey: string): void {
    const entry = this.entries.get(runtimeKey);
    if (!entry) return;
    detachRuntimeFromContainer(entry);
  }

  /**
   * 完全销毁运行时条目并从注册表中移除。
   *
   * @param runtimeKey - 运行时唯一键
   */
  dispose(runtimeKey: string): void {
    const entry = this.entries.get(runtimeKey);
    if (!entry) return;
    disposeRuntimeEntry(entry);
    this.entries.delete(runtimeKey);
  }

  /**
   * 根据线程 ID 和终端 ID 销毁运行时条目。
   *
   * @param threadId - 线程标识
   * @param terminalId - 终端标识
   */
  disposeTerminal(threadId: string, terminalId: string): void {
    this.dispose(buildTerminalRuntimeKey(threadId, terminalId));
  }

  /**
   * 销毁指定线程下的所有运行时条目。
   *
   * @param threadId - 线程标识
   */
  disposeThread(threadId: string): void {
    for (const runtimeKey of [...this.entries.keys()]) {
      if (runtimeKey.startsWith(`${threadId}::`)) {
        this.dispose(runtimeKey);
      }
    }
  }

  /**
   * 聚焦指定运行时的终端实例。
   *
   * @param runtimeKey - 运行时唯一键
   */
  focus(runtimeKey: string): void {
    this.entries.get(runtimeKey)?.terminal.focus();
  }
}

/** 全局终端运行时注册表单例 */
export const terminalRuntimeRegistry = new TerminalRuntimeRegistry();
