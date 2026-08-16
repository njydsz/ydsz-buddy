/**
 * @file terminalRuntimeTypes.ts
 * @description 终端运行时的共享类型定义与稳定标识辅助工具。
 * 定义终端运行时所需的配置、回调和状态接口，提供运行时键的构建方法。
 * 属于终端运行时基础设施层。
 */

import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { type TerminalActivityState, type TerminalCliKind } from "~/shared/terminalThreads";
import { Terminal, type IDisposable } from "@xterm/xterm";

/**
 * 终端运行时回调接口，用于运行时向宿主通知会话生命周期和元数据变化。
 */
export interface TerminalRuntimeCallbacks {
  /** 终端会话退出时的回调 */
  onSessionExited: () => void;
  /** 终端元数据（CLI 类型和标签）发生变化时的回调 */
  onTerminalMetadataChange: (
    terminalId: string,
    metadata: { cliKind: TerminalCliKind | null; label: string },
  ) => void;
  /** 终端活动状态（子进程运行、Agent 状态）发生变化时的回调 */
  onTerminalActivityChange: (
    terminalId: string,
    activity: { hasRunningSubprocess: boolean; agentState: TerminalActivityState | null },
  ) => void;
}

/**
 * 根据线程 ID 和终端 ID 构建运行时唯一键。
 *
 * @param threadId - 线程标识
 * @param terminalId - 终端标识
 * @returns 格式为 `threadId::terminalId` 的唯一键字符串
 */
export function buildTerminalRuntimeKey(threadId: string, terminalId: string): string {
  return `${threadId}::${terminalId}`;
}

/**
 * 终端运行时配置，用于创建或同步运行时实例。
 */
export interface TerminalRuntimeConfig {
  /** 运行时唯一键，由 buildTerminalRuntimeKey 生成 */
  runtimeKey: string;
  /** 所属线程 ID */
  threadId: string;
  /** 终端 ID */
  terminalId: string;
  /** 终端显示标签 */
  terminalLabel: string;
  /** 终端 CLI 类型，如 bash、zsh 等 */
  terminalCliKind?: TerminalCliKind | null;
  /** 终端工作目录 */
  cwd: string;
  /** 终端运行时环境变量 */
  runtimeEnv?: Record<string, string>;
  /** 运行时生命周期回调 */
  callbacks: TerminalRuntimeCallbacks;
}

/**
 * 终端运行时视图状态，描述终端在 UI 中的可见性和焦点状态。
 */
export interface TerminalRuntimeViewState {
  /** 是否自动聚焦该终端 */
  autoFocus: boolean;
  /** 终端是否在视口中可见 */
  isVisible: boolean;
}

/**
 * 终端运行时条目，持有 xterm 实例及其所有关联状态和资源。
 * 是终端运行时注册表中的核心数据结构。
 */
export interface TerminalRuntimeEntry {
  /** 运行时唯一键 */
  runtimeKey: string;
  /** 所属线程 ID */
  threadId: string;
  /** 终端 ID */
  terminalId: string;
  /** 终端显示标签 */
  terminalLabel: string;
  /** 终端 CLI 类型 */
  terminalCliKind: TerminalCliKind | null;
  /** 终端工作目录 */
  cwd: string;
  /** 终端运行时环境变量 */
  runtimeEnv?: Record<string, string>;
  /** 运行时生命周期回调 */
  callbacks: TerminalRuntimeCallbacks;
  /** 终端 DOM 包装容器 */
  wrapper: HTMLDivElement;
  /** 终端挂载容器，可能为 null（未挂载时） */
  container: HTMLDivElement | null;
  /** xterm.js Terminal 实例 */
  terminal: Terminal;
  /** 自适应尺寸插件 */
  fitAddon: FitAddon;
  /** 搜索插件 */
  searchAddon: SearchAddon;
  /** WebGL 渲染插件，可能为 null（未加载或不支持时） */
  webglAddon: WebglAddon | null;
  /** 输出身份识别缓冲区，用于从输出中推断终端 CLI 类型 */
  outputIdentityBuffer: string;
  /** 标题输入缓冲区，用于从终端输入序列中提取标题信息 */
  titleInputBuffer: string;
  /** 是否已处理过退出事件 */
  hasHandledExit: boolean;
  /** 终端是否已执行 open 操作 */
  opened: boolean;
  /** 终端是否已销毁 */
  disposed: boolean;
  /** 尺寸变化观察器 */
  resizeObserver: ResizeObserver | null;
  /** 后端 resize 防抖定时器 ID */
  resizeDispatchTimer: number | null;
  /** 视觉 resize 的 rAF 帧句柄 */
  visualResizeFrame: number | null;
  /** 视觉 resize 的定时器 ID */
  visualResizeTimer: number | null;
  /** 上次视觉 resize 的时间戳 */
  lastVisualResizeAt: number;
  /** 最近一次已发送给后端的 resize 尺寸 */
  lastSentResize: { cols: number; rows: number } | null;
  /** 待发送给后端的 resize 尺寸 */
  pendingResize: { cols: number; rows: number } | null;
  /** 写入批处理的 rAF 帧句柄 */
  writeRafHandle: number | null;
  /** 写入批处理的最大延迟定时器 ID */
  writeFlushTimeout: number | null;
  /** 待写入的数据片段队列 */
  pendingWrites: string[];
  /** 待写入数据的总长度 */
  pendingWriteLength: number;
  /** 延迟写入的数据片段队列（终端不可见时暂存） */
  deferredWrites: string[];
  /** 延迟写入数据的总长度 */
  deferredWriteLength: number;
  /** 输出事件版本号，用于快照回放时检测是否有新输出 */
  outputEventVersion: number;
  /** WebGL 加载的 rAF 帧句柄 */
  webglLoadFrame: number | null;
  /** 主题刷新的 rAF 帧句柄 */
  themeRefreshFrame: number;
  /** 主题变化观察器 */
  themeObserver: MutationObserver | null;
  /** 可见性恢复逻辑的清理函数 */
  visibilityCleanup: (() => void) | null;
  /** 终端事件监听器的可释放资源列表 */
  terminalDisposables: IDisposable[];
  /** 挂载阶段可释放资源的清理函数列表 */
  attachDisposables: Array<() => void>;
  /** 生命周期持久的可释放资源清理函数列表 */
  persistentDisposables: Array<() => void>;
  /** 查询响应抑制的清理函数 */
  querySuppressionDispose: (() => void) | null;
  /** 当前视图状态 */
  viewState: TerminalRuntimeViewState;
  /** 终端事件订阅的取消函数 */
  unsubscribeTerminalEvents: (() => void) | null;
}
