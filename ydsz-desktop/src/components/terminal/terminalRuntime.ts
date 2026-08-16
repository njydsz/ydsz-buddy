/**
 * @file terminalRuntime.ts
 * @description 管理长生命周期 xterm 运行时的完整生命周期，包括创建、挂载、销毁等。
 * 负责终端实例的初始化、写入批处理、尺寸调整、WebGL 渲染、主题同步、
 * 可见性恢复和事件处理等核心逻辑。
 * 属于终端运行时基础设施层。
 */

import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import {
  defaultTerminalTitleForCliKind,
  consumeTerminalIdentityInput,
  deriveTerminalOutputIdentity,
} from "~/shared/terminalThreads";
import { Terminal } from "@xterm/xterm";

import { readNativeApi } from "~/nativeApi";
import { suppressQueryResponses } from "~/lib/suppressQueryResponses";
import type { TerminalSessionSnapshot } from "~/contracts";

import { openInPreferredEditor } from "../../editorPreferences";
import { isTerminalClearShortcut, terminalNavigationShortcutData } from "../../keybindings";
import {
  collectWrappedTerminalLinkLine,
  extractTerminalLinks,
  isTerminalLinkActivation,
  resolvePathLinkTarget,
  resolveWrappedTerminalLinkRange,
  wrappedTerminalLinkRangeIntersectsBufferLine,
} from "../../terminal-links";
import {
  getTerminalFontFamily,
  terminalThemeFromApp,
  writeSystemMessage,
} from "./terminalRuntimeAppearance";
import { terminalEventDispatcher } from "./terminalEventDispatcher";
import {
  checkCommandSafety,
  extractLastCommandLine,
  isCommandSubmit,
} from "./commandSafety";
import { toastManager } from "../ui/toast";
import type {
  TerminalRuntimeConfig,
  TerminalRuntimeEntry,
  TerminalRuntimeViewState,
} from "./terminalRuntimeTypes";

/** 是否启用 WebGL 渲染加速 */
const ENABLE_TERMINAL_WEBGL = true;
/** 视觉 resize 最小间隔（毫秒），防止过于频繁的 resize 操作 */
const VISUAL_RESIZE_MIN_INTERVAL_MS = 64;
/** 后端 resize 防抖延迟（毫秒） */
const BACKEND_RESIZE_DEBOUNCE_MS = 120;
/** 写入批处理大小上限（字节），超过则立即刷新 */
const WRITE_BATCH_SIZE_LIMIT = 262_144;
/** 写入批处理最大延迟（毫秒），确保数据不会积压太久 */
const WRITE_BATCH_MAX_LATENCY_MS = 50;
/** 打开终端后快照回放协调延迟（毫秒） */
const OPEN_SNAPSHOT_RECONCILE_DELAY_MS = 250;

/**
 * 全局渲染器类型建议。当 WebGL 加载失败后，后续终端将跳过 WebGL 而使用 DOM 渲染。
 */
let suggestedRendererType: "webgl" | "dom" | undefined;

/**
 * 重置终端状态以准备快照回放。清空缓冲区、清除待写入数据并发送重置转义序列。
 *
 * @param entry - 终端运行时条目
 */
function resetForSnapshotReplay(entry: TerminalRuntimeEntry): void {
  entry.titleInputBuffer = "";
  entry.outputIdentityBuffer = "";
  clearPendingWrites(entry);
  clearDeferredWrites(entry);
  entry.terminal.write("\u001bc");
}

/**
 * 回放快照历史数据到终端。先重置状态，再推断身份，最后写入历史数据。
 *
 * @param entry - 终端运行时条目
 * @param history - 快照历史数据字符串
 */
function replaySnapshotHistory(entry: TerminalRuntimeEntry, history: string): void {
  resetForSnapshotReplay(entry);
  maybePromoteTerminalIdentityFromOutput(entry, history);
  entry.terminal.write(history);
}

/** 清除后端 resize 防抖定时器 */
function clearBackendResizeTimer(entry: TerminalRuntimeEntry): void {
  if (entry.resizeDispatchTimer !== null) {
    window.clearTimeout(entry.resizeDispatchTimer);
    entry.resizeDispatchTimer = null;
  }
}

/** 取消待写入数据的 rAF 和定时器，并清空待写入队列 */
function clearPendingWrites(entry: TerminalRuntimeEntry): void {
  if (entry.writeRafHandle !== null) {
    window.cancelAnimationFrame(entry.writeRafHandle);
    entry.writeRafHandle = null;
  }
  if (entry.writeFlushTimeout !== null) {
    window.clearTimeout(entry.writeFlushTimeout);
    entry.writeFlushTimeout = null;
  }
  entry.pendingWrites.length = 0;
  entry.pendingWriteLength = 0;
}

/** 清空延迟写入队列 */
function clearDeferredWrites(entry: TerminalRuntimeEntry): void {
  entry.deferredWrites.length = 0;
  entry.deferredWriteLength = 0;
}

/**
 * 立即将所有待写入数据刷新到终端。取消 rAF 和定时器，合并所有数据片段后一次性写入。
 *
 * @param entry - 终端运行时条目
 */
function flushPendingWrites(entry: TerminalRuntimeEntry): void {
  if (entry.writeRafHandle !== null) {
    window.cancelAnimationFrame(entry.writeRafHandle);
    entry.writeRafHandle = null;
  }
  if (entry.writeFlushTimeout !== null) {
    window.clearTimeout(entry.writeFlushTimeout);
    entry.writeFlushTimeout = null;
  }
  if (entry.pendingWrites.length === 0) {
    entry.pendingWriteLength = 0;
    return;
  }
  const combined = entry.pendingWrites.join("");
  entry.pendingWrites.length = 0;
  entry.pendingWriteLength = 0;
  entry.terminal.write(combined);
}

/**
 * 将延迟写入队列中的数据转为待写入队列，由 scheduleWrite 统一调度。
 * 通常在终端变为可见时调用。
 *
 * @param entry - 终端运行时条目
 */
function flushDeferredWrites(entry: TerminalRuntimeEntry): void {
  if (entry.deferredWrites.length === 0) {
    entry.deferredWriteLength = 0;
    return;
  }

  const combined = entry.deferredWrites.join("");
  clearDeferredWrites(entry);
  scheduleWrite(entry, combined);
}

/**
 * 调度数据写入终端。将数据加入待写入队列，通过 rAF 和定时器实现批处理，
 * 当数据量超过上限时立即刷新。
 *
 * @param entry - 终端运行时条目
 * @param data - 待写入的数据字符串
 */
function scheduleWrite(entry: TerminalRuntimeEntry, data: string): void {
  entry.pendingWrites.push(data);
  entry.pendingWriteLength += data.length;

  if (entry.pendingWriteLength >= WRITE_BATCH_SIZE_LIMIT) {
    flushPendingWrites(entry);
    return;
  }

  if (entry.writeRafHandle === null) {
    entry.writeRafHandle = window.requestAnimationFrame(() => {
      entry.writeRafHandle = null;
      flushPendingWrites(entry);
    });
  }
  if (entry.writeFlushTimeout === null) {
    entry.writeFlushTimeout = window.setTimeout(() => {
      entry.writeFlushTimeout = null;
      flushPendingWrites(entry);
    }, WRITE_BATCH_MAX_LATENCY_MS);
  }
}

/**
 * 将待处理的 resize 尺寸发送给后端 PTY 进程。
 *
 * @param entry - 终端运行时条目
 */
function flushPendingResize(entry: TerminalRuntimeEntry): void {
  const api = readNativeApi();
  const pendingResize = entry.pendingResize;
  if (!api || !pendingResize) return;

  entry.pendingResize = null;
  entry.lastSentResize = pendingResize;
  void api.terminal
    .resize({
      threadId: entry.threadId,
      terminalId: entry.terminalId,
      cols: pendingResize.cols,
      rows: pendingResize.rows,
    })
    .catch(() => {
      const current = entry.lastSentResize;
      if (current && current.cols === pendingResize.cols && current.rows === pendingResize.rows) {
        entry.lastSentResize = null;
      }
    });
}

/**
 * 将后端 resize 请求加入队列，通过防抖延迟后发送给 PTY。
 * 如果尺寸与已发送或待发送的相同则跳过。
 *
 * @param entry - 终端运行时条目
 * @param cols - 列数
 * @param rows - 行数
 */
function queueBackendResize(entry: TerminalRuntimeEntry, cols: number, rows: number): void {
  const lastSentResize = entry.lastSentResize;
  const pendingResize = entry.pendingResize;
  if (
    (lastSentResize && lastSentResize.cols === cols && lastSentResize.rows === rows) ||
    (pendingResize && pendingResize.cols === cols && pendingResize.rows === rows)
  ) {
    return;
  }
  entry.pendingResize = { cols, rows };
  clearBackendResizeTimer(entry);
  entry.resizeDispatchTimer = window.setTimeout(() => {
    entry.resizeDispatchTimer = null;
    flushPendingResize(entry);
  }, BACKEND_RESIZE_DEBOUNCE_MS);
}

/**
 * 执行终端视觉 resize 操作。调用 fitAddon 适配容器尺寸，
 * 可选清除 WebGL 纹理图集、刷新终端显示、通知后端 resize。
 *
 * @param entry - 终端运行时条目
 * @param options - 可选配置项
 * @param options.clearTextureAtlas - 是否清除 WebGL 纹理图集
 * @param options.refresh - 是否刷新终端显示
 * @param options.dispatchBackend - 是否通知后端 resize
 */
function runTerminalResize(
  entry: TerminalRuntimeEntry,
  options?: { clearTextureAtlas?: boolean; refresh?: boolean; dispatchBackend?: boolean },
): void {
  if (!entry.container || !entry.viewState.isVisible) return;

  const { clearTextureAtlas = false, refresh = false, dispatchBackend = true } = options ?? {};
  const wasAtBottom = entry.terminal.buffer.active.viewportY >= entry.terminal.buffer.active.baseY;

  if (clearTextureAtlas) {
    (
      entry.webglAddon as unknown as {
        clearTextureAtlas?: () => void;
      } | null
    )?.clearTextureAtlas?.();
  }

  entry.fitAddon.fit();
  if (wasAtBottom) {
    entry.terminal.scrollToBottom();
  }
  if (dispatchBackend) {
    queueBackendResize(entry, entry.terminal.cols, entry.terminal.rows);
  }
  if (refresh) {
    entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));
  }
}

/** 取消已调度的视觉 resize 操作（rAF 帧和定时器） */
function cancelScheduledVisualResize(entry: TerminalRuntimeEntry): void {
  if (entry.visualResizeFrame !== null) {
    window.cancelAnimationFrame(entry.visualResizeFrame);
    entry.visualResizeFrame = null;
  }
  if (entry.visualResizeTimer !== null) {
    window.clearTimeout(entry.visualResizeTimer);
    entry.visualResizeTimer = null;
  }
}

/**
 * 调度视觉 resize 操作，受最小间隔限制以防止过于频繁的 resize。
 * 终端不可见时不会调度。
 *
 * @param entry - 终端运行时条目
 */
function scheduleVisualResize(entry: TerminalRuntimeEntry): void {
  if (!entry.viewState.isVisible || entry.visualResizeTimer !== null) {
    return;
  }

  const now = Date.now();
  const remaining = Math.max(0, VISUAL_RESIZE_MIN_INTERVAL_MS - (now - entry.lastVisualResizeAt));

  const run = () => {
    entry.visualResizeTimer = null;
    if (entry.visualResizeFrame !== null) {
      window.cancelAnimationFrame(entry.visualResizeFrame);
    }
    entry.visualResizeFrame = window.requestAnimationFrame(() => {
      entry.visualResizeFrame = null;
      entry.lastVisualResizeAt = Date.now();
      runTerminalResize(entry);
    });
  };

  if (remaining === 0) {
    run();
    return;
  }

  entry.visualResizeTimer = window.setTimeout(run, remaining);
}

/**
 * 启动可见性恢复机制。当终端从隐藏状态恢复为可见时，
 * 监听 document visibilitychange 和 window focus 事件，
 * 在合适的时机重新执行 resize 以恢复终端显示。
 *
 * @param entry - 终端运行时条目
 */
function startVisibilityRecovery(entry: TerminalRuntimeEntry): void {
  if (!entry.container || !entry.viewState.isVisible || entry.visibilityCleanup) {
    return;
  }

  let recoveryFrame = 0;
  let throttleTimer: number | null = null;
  let lastRunAt = 0;
  const RECOVERY_THROTTLE_MS = 120;

  const runRecovery = () => {
    const mount = entry.container;
    if (!mount) return;
    if (!mount.isConnected) return;

    const style = window.getComputedStyle(mount);
    if (style.display === "none" || style.visibility === "hidden") {
      return;
    }
    const rect = mount.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return;
    }

    cancelScheduledVisualResize(entry);
    entry.lastVisualResizeAt = Date.now();
    runTerminalResize(entry, {
      clearTextureAtlas: true,
      refresh: true,
    });
  };

  const scheduleRecovery = () => {
    if (recoveryFrame !== 0) return;

    recoveryFrame = window.requestAnimationFrame(() => {
      recoveryFrame = 0;
      const now = Date.now();
      if (now - lastRunAt < RECOVERY_THROTTLE_MS) {
        const remaining = RECOVERY_THROTTLE_MS - (now - lastRunAt);
        if (throttleTimer !== null) {
          window.clearTimeout(throttleTimer);
        }
        throttleTimer = window.setTimeout(() => {
          throttleTimer = null;
          scheduleRecovery();
        }, remaining + 1);
        return;
      }
      lastRunAt = now;
      runRecovery();
    });
  };

  const handleVisibilityChange = () => {
    if (document.hidden) return;
    scheduleRecovery();
  };
  const handleWindowFocus = () => {
    scheduleRecovery();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleWindowFocus);
  entry.visibilityCleanup = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleWindowFocus);
    if (recoveryFrame !== 0) {
      window.cancelAnimationFrame(recoveryFrame);
    }
    if (throttleTimer !== null) {
      window.clearTimeout(throttleTimer);
    }
    entry.visibilityCleanup = null;
  };
}

/** 停止可见性恢复机制，移除所有事件监听器 */
function stopVisibilityRecovery(entry: TerminalRuntimeEntry): void {
  entry.visibilityCleanup?.();
  entry.visibilityCleanup = null;
}

/**
 * 同步终端主题。从应用主题令牌获取最新主题并应用到 xterm 实例，
 * 仅在主题实际变化时更新。
 *
 * @param entry - 终端运行时条目
 */
function syncTheme(entry: TerminalRuntimeEntry): void {
  const nextTheme = terminalThemeFromApp();
  const nextThemeKey = JSON.stringify(nextTheme);
  const previousThemeKey = (entry.wrapper.dataset.themeKey ?? "") as string;
  if (nextThemeKey === previousThemeKey) {
    return;
  }
  entry.wrapper.dataset.themeKey = nextThemeKey;
  entry.terminal.options.theme = nextTheme;
  entry.terminal.options.fontFamily = getTerminalFontFamily();
  if (entry.viewState.isVisible) {
    runTerminalResize(entry, { refresh: true });
  } else {
    entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));
  }
}

/** 取消待处理的 WebGL 加载 rAF 帧 */
function cancelPendingWebglLoad(entry: TerminalRuntimeEntry): void {
  if (entry.webglLoadFrame !== null) {
    window.cancelAnimationFrame(entry.webglLoadFrame);
    entry.webglLoadFrame = null;
  }
}

/** 释放 WebGL 插件并取消待加载帧 */
function disposeWebglAddon(entry: TerminalRuntimeEntry): void {
  cancelPendingWebglLoad(entry);
  entry.webglAddon?.dispose();
  entry.webglAddon = null;
}

/**
 * 尝试加载 WebGL 渲染插件。在终端可见且未禁用 WebGL 时异步加载，
 * 加载失败后标记全局建议为 DOM 渲染以避免后续终端重复失败。
 *
 * @param entry - 终端运行时条目
 */
function maybeLoadWebglAddon(entry: TerminalRuntimeEntry): void {
  if (
    entry.disposed ||
    !ENABLE_TERMINAL_WEBGL ||
    suggestedRendererType === "dom" ||
    entry.webglAddon !== null ||
    entry.webglLoadFrame !== null ||
    !entry.viewState.isVisible
  ) {
    return;
  }

  entry.webglLoadFrame = window.requestAnimationFrame(() => {
    entry.webglLoadFrame = null;
    if (
      entry.disposed ||
      !ENABLE_TERMINAL_WEBGL ||
      suggestedRendererType === "dom" ||
      entry.webglAddon !== null ||
      !entry.viewState.isVisible
    ) {
      return;
    }

    try {
      const nextWebglAddon = new WebglAddon();
      nextWebglAddon.onContextLoss(() => {
        nextWebglAddon.dispose();
        if (entry.webglAddon === nextWebglAddon) {
          entry.webglAddon = null;
        }
        entry.terminal.refresh(0, Math.max(0, entry.terminal.rows - 1));
      });
      entry.terminal.loadAddon(nextWebglAddon);
      entry.webglAddon = nextWebglAddon;
    } catch {
      suggestedRendererType = "dom";
      entry.webglAddon = null;
    }
  });
}

/**
 * 从终端输出中推断 CLI 类型身份。如果尚未识别 CLI 类型，
 * 会尝试从输出数据中提取身份信息并通知宿主。
 *
 * @param entry - 终端运行时条目
 * @param output - 终端输出数据
 */
function maybePromoteTerminalIdentityFromOutput(entry: TerminalRuntimeEntry, output: string): void {
  if (entry.terminalCliKind !== null) {
    return;
  }
  const nextOutputBuffer = `${entry.outputIdentityBuffer}${output}`;
  const outputIdentity =
    deriveTerminalOutputIdentity(output) ?? deriveTerminalOutputIdentity(nextOutputBuffer);
  entry.outputIdentityBuffer = nextOutputBuffer.slice(-8192);
  if (!outputIdentity?.cliKind) {
    return;
  }
  entry.terminalCliKind = outputIdentity.cliKind;
  entry.callbacks.onTerminalMetadataChange(entry.terminalId, {
    cliKind: outputIdentity.cliKind,
    label: outputIdentity.title,
  });
}

/**
 * 应用初始视觉 resize。在终端首次变为可见时执行两帧 resize，
 * 第一帧清除纹理图集并刷新，第二帧确保布局稳定。
 *
 * @param entry - 终端运行时条目
 */
function applyInitialVisualResize(entry: TerminalRuntimeEntry): void {
  if (!entry.viewState.isVisible) return;

  let firstFrame = 0;
  let secondFrame = 0;

  firstFrame = window.requestAnimationFrame(() => {
    cancelScheduledVisualResize(entry);
    entry.lastVisualResizeAt = Date.now();
    runTerminalResize(entry, {
      clearTextureAtlas: true,
      refresh: true,
    });

    secondFrame = window.requestAnimationFrame(() => {
      entry.lastVisualResizeAt = Date.now();
      runTerminalResize(entry, { refresh: true });
    });
  });

  entry.attachDisposables.push(() => {
    if (firstFrame !== 0) {
      window.cancelAnimationFrame(firstFrame);
    }
    if (secondFrame !== 0) {
      window.cancelAnimationFrame(secondFrame);
    }
  });
}

/**
 * 确保终端容器上的 ResizeObserver 已启动。
 * 观察容器尺寸变化并调度视觉 resize。
 *
 * @param entry - 终端运行时条目
 */
function ensureResizeObserver(entry: TerminalRuntimeEntry): void {
  if (!entry.container || !entry.viewState.isVisible || entry.resizeObserver) {
    return;
  }

  let frame = 0;
  const observer = new ResizeObserver(() => {
    if (frame !== 0) {
      window.cancelAnimationFrame(frame);
    }
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      scheduleVisualResize(entry);
    });
  });

  observer.observe(entry.container);
  entry.resizeObserver = observer;
  entry.attachDisposables.push(() => {
    observer.disconnect();
    if (frame !== 0) {
      window.cancelAnimationFrame(frame);
    }
    if (entry.resizeObserver === observer) {
      entry.resizeObserver = null;
    }
  });
}

/** 清除所有挂载阶段的可释放资源，包括 ResizeObserver */
function clearAttachDisposables(entry: TerminalRuntimeEntry): void {
  const disposables = [...entry.attachDisposables];
  entry.attachDisposables.length = 0;
  for (const dispose of disposables) {
    dispose();
  }
  entry.resizeObserver = null;
}

/**
 * 向后端 PTY 发送终端输入数据，失败时在终端中显示系统消息。
 *
 * @param entry - 终端运行时条目
 * @param data - 输入数据字符串
 * @param fallbackError - 发送失败时的默认错误消息
 */
async function sendTerminalInput(
  entry: TerminalRuntimeEntry,
  data: string,
  fallbackError: string,
): Promise<void> {
  const api = readNativeApi();
  if (!api) return;
  try {
    await api.terminal.write({ threadId: entry.threadId, terminalId: entry.terminalId, data });
  } catch (error) {
    writeSystemMessage(entry.terminal, error instanceof Error ? error.message : fallbackError);
  }
}

export function syncRuntimeConfig(
  entry: TerminalRuntimeEntry,
  config: TerminalRuntimeConfig,
): void {
  entry.runtimeKey = config.runtimeKey;
  entry.threadId = config.threadId;
  entry.terminalId = config.terminalId;
  entry.terminalLabel = config.terminalLabel;
  entry.terminalCliKind = config.terminalCliKind ?? entry.terminalCliKind ?? null;
  entry.cwd = config.cwd;
  if (config.runtimeEnv === undefined) {
    delete entry.runtimeEnv;
  } else {
    entry.runtimeEnv = config.runtimeEnv;
  }
  entry.callbacks = config.callbacks;
}

export function createRuntimeEntry(config: TerminalRuntimeConfig): TerminalRuntimeEntry {
  const wrapper = document.createElement("div");
  wrapper.className = "h-full w-full";

  const fitAddon = new FitAddon();
  const clipboardAddon = new ClipboardAddon();
  const imageAddon = new ImageAddon();
  const searchAddon = new SearchAddon();
  const unicode11Addon = new Unicode11Addon();
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 12,
    scrollback: 5_000,
    fontFamily: getTerminalFontFamily(),
    theme: terminalThemeFromApp(),
    allowProposedApi: true,
    customGlyphs: true,
    macOptionIsMeta: false,
    cursorStyle: "block",
    cursorInactiveStyle: "outline",
    screenReaderMode: false,
  });
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(clipboardAddon);
  terminal.loadAddon(imageAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(unicode11Addon);
  terminal.unicode.activeVersion = "11";
  try {
    terminal.loadAddon(new LigaturesAddon());
  } catch {
    // Keep terminal startup resilient when the active font doesn't support ligatures.
  }
  terminal.open(wrapper);

  const entry: TerminalRuntimeEntry = {
    runtimeKey: config.runtimeKey,
    threadId: config.threadId,
    terminalId: config.terminalId,
    terminalLabel: config.terminalLabel,
    terminalCliKind: config.terminalCliKind ?? null,
    cwd: config.cwd,
    callbacks: config.callbacks,
    wrapper,
    container: null,
    terminal,
    fitAddon,
    searchAddon,
    webglAddon: null,
    outputIdentityBuffer: "",
    titleInputBuffer: "",
    hasHandledExit: false,
    opened: false,
    disposed: false,
    resizeObserver: null,
    resizeDispatchTimer: null,
    visualResizeFrame: null,
    visualResizeTimer: null,
    lastVisualResizeAt: 0,
    lastSentResize: null,
    pendingResize: null,
    writeRafHandle: null,
    writeFlushTimeout: null,
    pendingWrites: [],
    pendingWriteLength: 0,
    deferredWrites: [],
    deferredWriteLength: 0,
    outputEventVersion: 0,
    webglLoadFrame: null,
    themeRefreshFrame: 0,
    themeObserver: null,
    visibilityCleanup: null,
    terminalDisposables: [],
    attachDisposables: [],
    persistentDisposables: [],
    querySuppressionDispose: null,
    viewState: {
      autoFocus: false,
      isVisible: false,
    },
    unsubscribeTerminalEvents: null,
  };
  if (config.runtimeEnv !== undefined) {
    entry.runtimeEnv = config.runtimeEnv;
  }

  entry.querySuppressionDispose = suppressQueryResponses(terminal);

  const handleCopy = (event: ClipboardEvent) => {
    const selection = terminal.getSelection();
    if (!selection) return;
    const trimmed = selection.replace(/[^\S\n]+$/gm, "");
    if (trimmed === selection) return;

    if (event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", trimmed);
      return;
    }

    void navigator.clipboard?.writeText(trimmed).catch(() => undefined);
  };
  wrapper.addEventListener("copy", handleCopy);
  entry.persistentDisposables.push(() => {
    wrapper.removeEventListener("copy", handleCopy);
  });

  terminal.attachCustomKeyEventHandler((event) => {
    if (
      event.type === "keydown" &&
      event.key === "Enter" &&
      event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      void sendTerminalInput(entry, "\n", "Failed to insert newline");
      return false;
    }

    if (
      event.type === "keydown" &&
      event.key.toLowerCase() === "f" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      return true;
    }

    const navigationData = terminalNavigationShortcutData(event);
    if (navigationData !== null) {
      event.preventDefault();
      event.stopPropagation();
      void sendTerminalInput(entry, navigationData, "Failed to move cursor");
      return false;
    }

    if (!isTerminalClearShortcut(event)) return true;
    event.preventDefault();
    event.stopPropagation();
    void sendTerminalInput(entry, "\u000c", "Failed to clear terminal");
    return false;
  });

  entry.terminalDisposables.push(
    terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const wrappedLine = collectWrappedTerminalLinkLine(bufferLineNumber, (bufferLineIndex) =>
          terminal.buffer.active.getLine(bufferLineIndex),
        );
        if (!wrappedLine) {
          callback(undefined);
          return;
        }

        const links = extractTerminalLinks(wrappedLine.text)
          .map((match) => ({
            match,
            range: resolveWrappedTerminalLinkRange(wrappedLine, match),
          }))
          .filter(({ range }) =>
            wrappedTerminalLinkRangeIntersectsBufferLine(range, bufferLineNumber),
          );
        if (links.length === 0) {
          callback(undefined);
          return;
        }

        callback(
          links.map(({ match, range }) => ({
            text: match.text,
            range,
            activate: (event: MouseEvent) => {
              if (!isTerminalLinkActivation(event)) return;
              const api = readNativeApi();
              if (!api) return;

              if (match.kind === "url") {
                void api.shell.openExternal(match.text).catch((error: unknown) => {
                  writeSystemMessage(
                    terminal,
                    error instanceof Error ? error.message : "Unable to open link",
                  );
                });
                return;
              }

              const target = resolvePathLinkTarget(match.text, entry.cwd);
              void openInPreferredEditor(api, target).catch((error: unknown) => {
                writeSystemMessage(
                  terminal,
                  error instanceof Error ? error.message : "Unable to open path",
                );
              });
            },
          })),
        );
      },
    }),
  );

  entry.terminalDisposables.push(
    terminal.onData((data) => {
      const nextIdentityState = consumeTerminalIdentityInput(entry.titleInputBuffer, data);
      entry.titleInputBuffer = nextIdentityState.buffer;
      if (nextIdentityState.identity?.cliKind && entry.terminalCliKind === null) {
        entry.terminalCliKind = nextIdentityState.identity.cliKind;
        entry.callbacks.onTerminalMetadataChange(entry.terminalId, {
          cliKind: nextIdentityState.identity.cliKind,
          label: nextIdentityState.identity.title,
        });
      }

      // 终端命令安全检查:在用户按回车时检测危险命令
      if (isCommandSubmit(data)) {
        const commandLine = extractLastCommandLine(entry.titleInputBuffer);
        if (commandLine) {
          const danger = checkCommandSafety(commandLine);
          if (danger) {
            toastManager.add({
              type: danger.severity === "danger" ? "error" : "warning",
              title: danger.severity === "danger" ? "Dangerous command detected" : "Warning: potentially dangerous command",
              description: danger.description,
              timeout: 6000,
            });
          }
        }
      }

      const api = readNativeApi();
      if (!api) return;
      void api.terminal
        .write({ threadId: entry.threadId, terminalId: entry.terminalId, data })
        .catch((error: unknown) =>
          writeSystemMessage(
            terminal,
            error instanceof Error ? error.message : "Terminal write failed",
          ),
        );
    }),
  );

  entry.themeObserver = new MutationObserver(() => {
    if (entry.themeRefreshFrame !== 0) return;
    entry.themeRefreshFrame = window.requestAnimationFrame(() => {
      entry.themeRefreshFrame = 0;
      syncTheme(entry);
    });
  });
  entry.themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  entry.unsubscribeTerminalEvents = terminalEventDispatcher.subscribe(
    entry.threadId,
    entry.terminalId,
    (event) => {
      if (event.type === "output") {
        entry.outputEventVersion += 1;
        maybePromoteTerminalIdentityFromOutput(entry, event.data);
        flushDeferredWrites(entry);
        scheduleWrite(entry, event.data);
        return;
      }

      if (event.type === "started" || event.type === "restarted") {
        entry.hasHandledExit = false;
        const shouldReplaySnapshot =
          event.type === "restarted" || event.snapshot.history.length > 0;
        if (shouldReplaySnapshot) {
          resetForSnapshotReplay(entry);
        }
        if (event.snapshot.history.length > 0) {
          maybePromoteTerminalIdentityFromOutput(entry, event.snapshot.history);
          terminal.write(event.snapshot.history);
        }
        return;
      }

      if (event.type === "cleared") {
        entry.titleInputBuffer = "";
        entry.outputIdentityBuffer = "";
        clearPendingWrites(entry);
        clearDeferredWrites(entry);
        terminal.clear();
        terminal.write("\u001bc");
        return;
      }

      if (event.type === "activity") {
        if (event.cliKind && entry.terminalCliKind !== event.cliKind) {
          entry.terminalCliKind = event.cliKind;
          entry.callbacks.onTerminalMetadataChange(entry.terminalId, {
            cliKind: event.cliKind,
            label: defaultTerminalTitleForCliKind(event.cliKind),
          });
        }
        entry.callbacks.onTerminalActivityChange(entry.terminalId, {
          hasRunningSubprocess: event.hasRunningSubprocess,
          agentState: event.agentState,
        });
        return;
      }

      if (event.type === "error") {
        writeSystemMessage(terminal, event.message);
        return;
      }

      if (event.type === "exited") {
        flushPendingWrites(entry);
        const details = [
          typeof event.exitCode === "number" ? `code ${event.exitCode}` : null,
          typeof event.exitSignal === "number" ? `signal ${event.exitSignal}` : null,
        ]
          .filter((value): value is string => value !== null)
          .join(", ");
        writeSystemMessage(
          terminal,
          details.length > 0 ? `Process exited (${details})` : "Process exited",
        );
        if (entry.hasHandledExit) {
          return;
        }
        entry.hasHandledExit = true;
        window.setTimeout(() => {
          if (!entry.hasHandledExit) {
            return;
          }
          entry.callbacks.onSessionExited();
        }, 0);
      }
    },
  );

  return entry;
}

function openTerminal(entry: TerminalRuntimeEntry): void {
  const api = readNativeApi();
  if (!api || entry.opened) return;

  entry.fitAddon.fit();
  entry.lastSentResize = null;
  entry.opened = true;
  const outputEventVersionAtOpen = entry.outputEventVersion;
  const openInput = {
    threadId: entry.threadId,
    terminalId: entry.terminalId,
    cwd: entry.cwd,
    cols: entry.terminal.cols,
    rows: entry.terminal.rows,
    ...(entry.runtimeEnv ? { env: entry.runtimeEnv } : {}),
  };

  void api.terminal
    .open(openInput)
    .then((snapshot) => {
      if (entry.disposed) return;
      if (snapshot.history.length > 0 && entry.outputEventVersion === outputEventVersionAtOpen) {
        replaySnapshotHistory(entry, snapshot.history);
      } else if (entry.outputEventVersion === outputEventVersionAtOpen) {
        window.setTimeout(() => {
          if (
            entry.disposed ||
            !entry.opened ||
            entry.outputEventVersion !== outputEventVersionAtOpen
          ) {
            return;
          }
          void api.terminal
            .open(openInput)
            .then((nextSnapshot: TerminalSessionSnapshot) => {
              if (
                entry.disposed ||
                entry.outputEventVersion !== outputEventVersionAtOpen ||
                nextSnapshot.history.length === 0
              ) {
                return;
              }
              replaySnapshotHistory(entry, nextSnapshot.history);
            })
            .catch(() => {
              // Best-effort recovery only; the original open already succeeded.
            });
        }, OPEN_SNAPSHOT_RECONCILE_DELAY_MS);
      }
      if (entry.viewState.autoFocus) {
        window.requestAnimationFrame(() => {
          entry.terminal.focus();
        });
      }
    })
    .catch((error: unknown) => {
      if (entry.disposed) return;
      entry.opened = false;
      writeSystemMessage(
        entry.terminal,
        error instanceof Error ? error.message : "Failed to open terminal",
      );
    });
}

export function attachRuntimeToContainer(
  entry: TerminalRuntimeEntry,
  viewState: TerminalRuntimeViewState,
  container: HTMLDivElement,
): void {
  if (entry.container !== container) {
    detachRuntimeFromContainer(entry);
    entry.container = container;
    container.append(entry.wrapper);
  }

  updateRuntimeViewState(entry, viewState);
  maybeLoadWebglAddon(entry);
  ensureResizeObserver(entry);
  startVisibilityRecovery(entry);
  openTerminal(entry);
}

export function updateRuntimeViewState(
  entry: TerminalRuntimeEntry,
  nextViewState: TerminalRuntimeViewState,
): void {
  const wasVisible = entry.viewState.isVisible;
  entry.viewState = nextViewState;

  if (entry.container) {
    if (nextViewState.isVisible && !wasVisible) {
      maybeLoadWebglAddon(entry);
      flushDeferredWrites(entry);
      applyInitialVisualResize(entry);
      ensureResizeObserver(entry);
      startVisibilityRecovery(entry);
    } else if (!nextViewState.isVisible && wasVisible) {
      cancelScheduledVisualResize(entry);
      stopVisibilityRecovery(entry);
      disposeWebglAddon(entry);
      clearAttachDisposables(entry);
    }
  }

  if (nextViewState.autoFocus) {
    window.requestAnimationFrame(() => {
      entry.terminal.focus();
    });
  }
}

export function detachRuntimeFromContainer(entry: TerminalRuntimeEntry): void {
  cancelScheduledVisualResize(entry);
  stopVisibilityRecovery(entry);
  disposeWebglAddon(entry);
  clearAttachDisposables(entry);
  clearBackendResizeTimer(entry);
  entry.pendingResize = null;
  entry.lastSentResize = null;
  entry.lastVisualResizeAt = 0;
  entry.wrapper.remove();
  entry.container = null;
}

export function disposeRuntimeEntry(entry: TerminalRuntimeEntry): void {
  detachRuntimeFromContainer(entry);
  entry.disposed = true;
  flushPendingWrites(entry);
  clearDeferredWrites(entry);
  entry.unsubscribeTerminalEvents?.();
  entry.unsubscribeTerminalEvents = null;
  entry.querySuppressionDispose?.();
  entry.querySuppressionDispose = null;
  if (entry.themeRefreshFrame !== 0) {
    window.cancelAnimationFrame(entry.themeRefreshFrame);
    entry.themeRefreshFrame = 0;
  }
  entry.themeObserver?.disconnect();
  entry.themeObserver = null;
  for (const disposable of entry.terminalDisposables) {
    disposable.dispose();
  }
  entry.terminalDisposables.length = 0;
  for (const dispose of entry.persistentDisposables) {
    dispose();
  }
  entry.persistentDisposables.length = 0;
  disposeWebglAddon(entry);
  entry.terminal.dispose();
}
