/**
 * @file 功能开关（Feature Flags）管��? *
 * 提供应用内功能开关的注册、持久化和响应式读取��? * 支持两种类型的功能开关：
 * - action 类型：一次性触发动作，无开关状��? * - toggle 类型：可开��?关闭的开关，状态持久化��?localStorage
 *
 * 使用 React ��?useSyncExternalStore 实现状态同步，
 * 支持跨标签页通过 StorageEvent 实时更新��? */

import { useSyncExternalStore } from "react";

/**
 * 功能开关定义，支持 action ��?toggle 两种类型��? * - action: 触发一次性动作，无状��? * - toggle: 可切换的开关，具有默认启用状��? */
export type FeatureFlag =
  | {
      /** action 类型功能开关标��?*/
      id: "trigger-action-failed-toasts";
      kind: "action";
      /** 开关显示标��?*/
      label: string;
      /** 开关功能描��?*/
      description: string;
    }
  | {
      /** toggle 类型功能开关标��?*/
      id: ToggleFeatureFlagId;
      kind: "toggle";
      /** 开关显示标��?*/
      label: string;
      /** 开关功能描��?*/
      description: string;
      /** 默认是否启用 */
      defaultEnabled: boolean;
    };

/** 可切换的功能开��?ID 枚举 */
export type ToggleFeatureFlagId =
  | "persist-action-failed-debug-toasts"
  | "show-debug-task-banner"
  | "show-expanded-cursor-model-variants";

/** 功能开关状态映射，键为开��?ID，值为是否启用 */
type FeatureFlagState = Record<ToggleFeatureFlagId, boolean>;

/** localStorage 中功能开关数据的存储��?*/
const FEATURE_FLAG_STORAGE_KEY = "remi-claw:feature-flags";

/** 功能开关的默认状��?*/
const DEFAULT_FEATURE_FLAG_STATE: FeatureFlagState = {
  "persist-action-failed-debug-toasts": false,
  "show-debug-task-banner": false,
  "show-expanded-cursor-model-variants": false,
};

/** 所有功能开关的注册列表 */
export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  {
    id: "trigger-action-failed-toasts",
    kind: "action",
    label: "Trigger action failed toasts",
    description: "Show stacked Git action failure toasts for local UI testing.",
  },
  {
    id: "persist-action-failed-debug-toasts",
    kind: "toggle",
    label: "Keep debug error toasts open",
    description: "Disable auto-dismiss for locally triggered error toasts.",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["persist-action-failed-debug-toasts"],
  },
  {
    id: "show-debug-task-banner",
    kind: "toggle",
    label: "Show debug task banner",
    description: "Render a local sample active task banner for UI testing.",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["show-debug-task-banner"],
  },
  {
    id: "show-expanded-cursor-model-variants",
    kind: "toggle",
    label: "Show Cursor model variants",
    description: "Show every Cursor CLI model variant as a separate picker row.",
    defaultEnabled: DEFAULT_FEATURE_FLAG_STATE["show-expanded-cursor-model-variants"],
  },
];

/** 状态变更监听器集合 */
const listeners = new Set<() => void>();
/** 内存中的功能开关状态（用于 localStorage 不可用时的回退��?*/
let memoryState = DEFAULT_FEATURE_FLAG_STATE;
/** 缓存的原��?localStorage 值，用于避免重复 JSON 解析 */
let cachedRawFeatureFlagState: string | null | undefined;
/** 缓存的解析后功能开关状��?*/
let cachedFeatureFlagState = DEFAULT_FEATURE_FLAG_STATE;

/** 检测当前环境是否可使用 localStorage */
function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * 将未知值标准化为功能开关状态对象��? * 对每个开关字段进行类型校验，无效值回退到默认状态��? *
 * @param value - 待标准化的��? * @returns 标准化后的功能开关状��? */
function normalizeFeatureFlagState(value: unknown): FeatureFlagState {
  if (!value || typeof value !== "object") {
    return DEFAULT_FEATURE_FLAG_STATE;
  }

  const record = value as Partial<Record<ToggleFeatureFlagId, unknown>>;
  return {
    "persist-action-failed-debug-toasts":
      typeof record["persist-action-failed-debug-toasts"] === "boolean"
        ? record["persist-action-failed-debug-toasts"]
        : DEFAULT_FEATURE_FLAG_STATE["persist-action-failed-debug-toasts"],
    "show-debug-task-banner":
      typeof record["show-debug-task-banner"] === "boolean"
        ? record["show-debug-task-banner"]
        : DEFAULT_FEATURE_FLAG_STATE["show-debug-task-banner"],
    "show-expanded-cursor-model-variants":
      typeof record["show-expanded-cursor-model-variants"] === "boolean"
        ? record["show-expanded-cursor-model-variants"]
        : DEFAULT_FEATURE_FLAG_STATE["show-expanded-cursor-model-variants"],
  };
}

/**
 * ��?localStorage 读取功能开关状态��? * 使用缓存机制避免重复 JSON 解析，localStorage 不可用时回退到内存状态��? *
 * @returns 当前的功能开关状��? */
function readFeatureFlagState(): FeatureFlagState {
  if (!canUseLocalStorage()) {
    return memoryState;
  }

  try {
    const raw = window.localStorage.getItem(FEATURE_FLAG_STORAGE_KEY);
    if (raw === cachedRawFeatureFlagState) {
      return cachedFeatureFlagState;
    }

    cachedRawFeatureFlagState = raw;
    cachedFeatureFlagState = normalizeFeatureFlagState(raw ? JSON.parse(raw) : null);
    return cachedFeatureFlagState;
  } catch {
    return DEFAULT_FEATURE_FLAG_STATE;
  }
}

/**
 * 将功能开关状态写��?localStorage 并通知所有监听器��? * 写入失败时静默处理，因为功能开关是尽力而为的开发者工具��? *
 * @param state - 要写入的功能开关状��? */
function writeFeatureFlagState(state: FeatureFlagState): void {
  memoryState = state;

  if (canUseLocalStorage()) {
    try {
      const raw = JSON.stringify(state);
      window.localStorage.setItem(FEATURE_FLAG_STORAGE_KEY, raw);
      cachedRawFeatureFlagState = raw;
      cachedFeatureFlagState = state;
    } catch {
      // Local feature flags are best-effort developer tools.
    }
  }

  for (const listener of listeners) {
    listener();
  }
}

/**
 * 订阅功能开关状态变更。同时监��?localStorage ��?storage 事件以支持跨标签页同步��? *
 * @param listener - 状态变更回调函��? * @returns 取消订阅的函��? */
function subscribeFeatureFlags(listener: () => void): () => void {
  listeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === FEATURE_FLAG_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * 设置指定功能开关的启用状态，并持久化��?localStorage��? *
 * @param id - 功能开��?ID
 * @param enabled - 是否启用
 */
export function setFeatureFlagEnabled(id: ToggleFeatureFlagId, enabled: boolean): void {
  writeFeatureFlagState({
    ...readFeatureFlagState(),
    [id]: enabled,
  });
}

/**
 * React Hook：获取当前所有功能开关的状态��? * 使用 useSyncExternalStore 实现响应式更新，支持跨标签页同步��? *
 * @returns 当前功能开关状态映��? *
 * @example
 * ```tsx
 * const flags = useFeatureFlags();
 * if (flags["show-debug-task-banner"]) { ... }
 * ```
 */
export function useFeatureFlags(): FeatureFlagState {
  return useSyncExternalStore(
    subscribeFeatureFlags,
    readFeatureFlagState,
    () => DEFAULT_FEATURE_FLAG_STATE,
  );
}
