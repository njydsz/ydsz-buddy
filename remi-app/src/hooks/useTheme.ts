/**
 * @file useTheme.ts
 * @description 主题管理 Hook - 持久化主题状态并将活动主题包投影��?DOM CSS 变量
 * @module hooks/useTheme
 * @layer Web 外观状��?Hook
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isDesktop } from "../env";
import { tauriBridge } from "../lib/tauri-bridge";
import {
  DEFAULT_THEME_STATE,
  type ChromeTheme,
  type ThemeFonts,
  type ThemeMode,
  type ThemePack,
  type ThemeState,
  type ThemeVariant,
  areThemePacksEqual,
  buildThemeCssVariables,
  canParseThemeShareString,
  createThemeShareString,
  parseStoredThemeState,
  resetThemeVariant as resetThemeVariantState,
  resolveThemePack,
  resolveThemeVariant,
  serializeThemeState,
  setThemeCodeThemeId,
  setThemeFonts,
  updateChromeTheme,
  updateThemePackFromShareString,
} from "../theme/theme.logic";

/** 主题快照类型 */
type ThemeSnapshot = {
  state: ThemeState;
  systemDark: boolean;
};

/** localStorage 存储��?*/
const STORAGE_KEY = "remi-claw:theme";
/** 系统深色模式媒体查询 */
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** 监听器列��?*/
let listeners: Array<() => void> = [];
/** 上一次快照缓��?*/
let lastSnapshot: ThemeSnapshot | null = null;
/** 上一次快照键（用于缓存比对） */
let lastSnapshotKey = "";
/** 上一次桌面端主题模式 */
let lastDesktopTheme: ThemeMode | null = null;

// ─── 存储连接 ─────────────────────────────────────────────────────────

/**
 * 触发所有监听器
 */
function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * 检查是否支持主题存��? */
function hasThemeStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * 获取系统是否为深色模��? */
function getSystemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches;
}

/**
 * ��?localStorage 读取主题状��? * 如果读取失败或不存在，返回默认主题状��? */
function readStoredThemeState(): ThemeState {
  if (!hasThemeStorage()) {
    return DEFAULT_THEME_STATE;
  }

  try {
    return parseStoredThemeState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_STATE;
  }
}

/**
 * 将主题状态写��?localStorage
 */
function writeStoredThemeState(state: ThemeState) {
  if (!hasThemeStorage()) {
    return;
  }

  localStorage.setItem(STORAGE_KEY, serializeThemeState(state));
}

/**
 * 获取当前主题快照（用��?useSyncExternalStore��? * 使用缓存机制避免不必要的重新计算
 */
function getSnapshot(): ThemeSnapshot {
  const state = readStoredThemeState();
  const systemDark = state.mode === "system" ? getSystemDark() : false;
  const snapshotKey = `${serializeThemeState(state)}|${systemDark ? "dark" : "light"}`;

  // 如果快照未变化，返回缓存
  if (lastSnapshot && lastSnapshotKey === snapshotKey) {
    return lastSnapshot;
  }

  lastSnapshotKey = snapshotKey;
  lastSnapshot = { state, systemDark };
  return lastSnapshot;
}

/**
 * 更新存储的主题状��? * 更新后会应用��?DOM 并通知所有监听器
 */
function updateStoredThemeState(update: (state: ThemeState) => ThemeState) {
  const nextState = update(readStoredThemeState());
  writeStoredThemeState(nextState);
  applyThemeState(nextState, true);
  emitChange();
}

/**
 * 订阅主题变化（用��?useSyncExternalStore��? * 监听系统深色模式变化和跨标签页的存储变化
 */
function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.push(listener);

  // 监听系统深色模式变化
  const mediaQuery = window.matchMedia(MEDIA_QUERY);
  const handleMediaChange = () => {
    const state = readStoredThemeState();
    if (state.mode === "system") {
      applyThemeState(state, true);
    }
    emitChange();
  };
  
  // 监听跨标签页的存储变��?  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }
    applyThemeState(readStoredThemeState(), true);
    emitChange();
  };

  mediaQuery.addEventListener("change", handleMediaChange);
  window.addEventListener("storage", handleStorage);

  // 返回取消订阅函数
  return () => {
    listeners = listeners.filter((currentListener) => currentListener !== listener);
    mediaQuery.removeEventListener("change", handleMediaChange);
    window.removeEventListener("storage", handleStorage);
  };
}

// ─── DOM 投影 ───────────────────────────────────────────────────────

/**
 * 将主题状态应用到 DOM
 * 设置 CSS 变量、data 属性和 class
 * 
 * @param state - 主题状��? * @param suppressTransitions - 是否抑制过渡动画（用于初始加载）
 */
function applyThemeState(state: ThemeState, suppressTransitions = false) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const root = document.documentElement;
  
  // 安全检查：某些服务端渲染测试只 stub 了最小的 DOM 接口
  if (
    typeof root.classList?.toggle !== "function" ||
    typeof root.style?.setProperty !== "function" ||
    typeof root.style?.removeProperty !== "function"
  ) {
    return;
  }

  // 抑制过渡动画，避免初始加载时的闪��?  if (suppressTransitions) {
    root.classList.add("no-transitions");
  }

  // 解析当前主题变体（light/dark��?  const variant = resolveThemeVariant(state.mode, getSystemDark());
  const activeTheme = resolveThemePack(state, variant);
  
  // 构建 CSS 变量
  const cssVariableBuild = buildThemeCssVariables(activeTheme, variant, {
    desktop: isDesktop,
  });

  // 设置深色模式 class
  root.classList.toggle("dark", variant === "dark");
  
  // 设置 data 属��?  root.setAttribute("data-code-theme-id", activeTheme.codeThemeId);
  root.setAttribute("data-theme-mode", state.mode);
  root.setAttribute("data-theme-variant", variant);
  root.setAttribute("data-window-material", cssVariableBuild.material);

  // 应用所��?CSS 变量
  for (const [name, value] of Object.entries(cssVariableBuild.variables)) {
    if (value.trim().length === 0) {
      root.style.removeProperty(name);
      continue;
    }
    root.style.setProperty(name, value);
  }

  // 同步到桌面端（Tauri��?  syncDesktopTheme(state.mode);

  // 恢复过渡动画
  if (suppressTransitions) {
    // 强制重排，确��?no-transitions class 生效后再移除
    // oxlint-disable-next-line no-unused-expressions
    root.offsetHeight;
    requestAnimationFrame(() => {
      root.classList.remove("no-transitions");
    });
  }
}

/**
 * 同步主题到桌面端（Tauri��? * 通过 Tauri bridge 设置原生窗口主题
 */
function syncDesktopTheme(theme: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  const bridge = tauriBridge;
  if (!bridge || lastDesktopTheme === theme) {
    return;
  }

  lastDesktopTheme = theme;
  void bridge.setTheme(theme).catch(() => {
    // 如果设置失败，重置缓存以便下次重��?    if (lastDesktopTheme === theme) {
      lastDesktopTheme = null;
    }
  });
}

// 模块加载时立即应用主题，最小化 React 挂载前的闪烁
if (typeof document !== "undefined") {
  applyThemeState(readStoredThemeState());
}

// ─── 公共 Hook ──────────────────────────────────────────────────────

/**
 * 主题管理 Hook
 * 
 * @description
 * 提供完整的主题管理功能，包括��? * - 主题模式切换（light/dark/system��? * - 主题包导��?导出
 * - 主题重置
 * - 主题字体和代码主题配��? * - 自动同步��?DOM 和桌面端
 * 
 * @returns 主题状态和操作方法
 * 
 * @example
 * ```tsx
 * const {
 *   theme,
 *   setTheme,
 *   activeTheme,
 *   updateThemePack,
 *   resetAllThemes,
 * } = useTheme();
 * 
 * // 切换到深色模��? * setTheme('dark');
 * 
 * // 导出当前主题
 * const themeString = exportThemeString();
 * ```
 */
export function useTheme() {
  // 使用 useSyncExternalStore 订阅主题状��?  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => ({
    state: DEFAULT_THEME_STATE,
    systemDark: false,
  }));
  
  const theme = snapshot.state.mode;
  const resolvedTheme = resolveThemeVariant(theme, snapshot.systemDark);
  const activeTheme = resolveThemePack(snapshot.state, resolvedTheme);
  const darkTheme = resolveThemePack(snapshot.state, "dark");
  const lightTheme = resolveThemePack(snapshot.state, "light");
  const defaultActiveTheme = resolveThemePack(DEFAULT_THEME_STATE, resolvedTheme);
  const isDefaultActiveTheme = areThemePacksEqual(activeTheme, defaultActiveTheme);

  /**
   * 设置主题模式
   */
  const setTheme = useCallback((nextTheme: ThemeMode) => {
    updateStoredThemeState((state) => ({
      ...state,
      mode: nextTheme,
    }));
  }, []);

  /**
   * 检查是否可以导入主题字符串
   */
  const canImportThemeString = useCallback(
    (value: string, variant: ThemeVariant = resolvedTheme) =>
      canParseThemeShareString(value, variant),
    [resolvedTheme],
  );

  /**
   * 从分享字符串导入主题
   */
  const importThemeString = useCallback(
    (value: string, variant: ThemeVariant = resolvedTheme) => {
      updateStoredThemeState((state) => updateThemePackFromShareString(state, value, variant));
    },
    [resolvedTheme],
  );

  /**
   * 导出主题为分享字符串
   */
  const exportThemeString = useCallback(
    (variant: ThemeVariant = resolvedTheme) =>
      createThemeShareString(variant, resolveThemePack(snapshot.state, variant)),
    [resolvedTheme, snapshot.state],
  );

  /**
   * 重置当前活动主题变体
   */
  const resetActiveTheme = useCallback(() => {
    updateStoredThemeState((state) => resetThemeVariantState(state, resolvedTheme));
  }, [resolvedTheme]);

  /**
   * 重置指定主题变体
   */
  const resetThemeVariant = useCallback((variant: ThemeVariant) => {
    updateStoredThemeState((state) => resetThemeVariantState(state, variant));
  }, []);

  /**
   * 重置所有主题到默认状��?   */
  const resetAllThemes = useCallback(() => {
    updateStoredThemeState(() => DEFAULT_THEME_STATE);
  }, []);

  /**
   * 更新主题包（颜色配置��?   */
  const updateThemePack = useCallback((variant: ThemeVariant, patch: Partial<ChromeTheme>) => {
    updateStoredThemeState((state) => updateChromeTheme(state, variant, patch));
  }, []);

  /**
   * 更新主题字体配置
   */
  const updateThemeFonts = useCallback((variant: ThemeVariant, patch: Partial<ThemeFonts>) => {
    updateStoredThemeState((state) => setThemeFonts(state, variant, patch));
  }, []);

  /**
   * 设置代码主题 ID
   */
  const setCodeThemeId = useCallback((variant: ThemeVariant, codeThemeId: string) => {
    updateStoredThemeState((state) => setThemeCodeThemeId(state, variant, codeThemeId));
  }, []);

  /**
   * 检查指定主题变体是否为默认主题��?   */
  const isDefaultThemePack = useCallback(
    (variant: ThemeVariant) =>
      areThemePacksEqual(
        resolveThemePack(snapshot.state, variant),
        resolveThemePack(DEFAULT_THEME_STATE, variant),
      ),
    [snapshot.state],
  );

  // 保持 DOM 同步（如果某些操作绕过了模块加载时的立即应用��?  useEffect(() => {
    applyThemeState(snapshot.state);
  }, [snapshot.state]);

  return {
    activeTheme,
    canImportThemeString,
    darkTheme,
    defaultActiveTheme,
    exportThemeString,
    importThemeString,
    isDefaultActiveTheme,
    isDefaultThemePack,
    lightTheme,
    resetActiveTheme,
    resetAllThemes,
    resetThemeVariant,
    resolvedTheme,
    setCodeThemeId,
    setTheme,
    theme,
    themeState: snapshot.state,
    updateThemeFonts,
    updateThemePack,
  } as const;
}

// 导出类型定义
export type { ChromeTheme, ThemeFonts, ThemeMode, ThemePack, ThemeState, ThemeVariant };
