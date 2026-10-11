/**
 * @file 执行权限级别全局 Store
 *
 * 通过 zustand + localStorage 持久化用户选择的执行权限模式（4 态），
 * 默认值为 "edit"（平衡安全与效率）。
 *
 * 与 InteractionMode 独立，可以在 ModeSwitcher 旁边快速切换
 * Agent 的执行自主度。
 */

import { create } from "zustand";
import {
  type ExecutionPermissionLevel,
  DEFAULT_EXECUTION_PERMISSION_LEVEL,
  normalizeExecutionPermissionLevelValue,
} from "./contracts/orchestration";

/** localStorage 键名 */
const STORAGE_KEY = "ydsz-buddy:execution-permission-level";

/** 读取本地存储的权限级别 */
function readStoredLevel(): ExecutionPermissionLevel {
  if (typeof window === "undefined") return DEFAULT_EXECUTION_PERMISSION_LEVEL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EXECUTION_PERMISSION_LEVEL;
    return normalizeExecutionPermissionLevelValue(JSON.parse(raw));
  } catch {
    return DEFAULT_EXECUTION_PERMISSION_LEVEL;
  }
}

/** 写入本地存储的权限级别 */
function writeStoredLevel(value: ExecutionPermissionLevel) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / disabled storage
  }
}

interface ExecutionPermissionState {
  level: ExecutionPermissionLevel;
}

interface ExecutionPermissionStore extends ExecutionPermissionState {
  setLevel: (next: ExecutionPermissionLevel | ((prev: ExecutionPermissionLevel) => ExecutionPermissionLevel)) => void;
  resetLevel: () => void;
  /** 从 localStorage 重新同步（用于跨标签页 storage 事件） */
  hydrateFromStorage: () => void;
}

/** 全局执行权限级别 store */
export const useExecutionPermissionStore = create<ExecutionPermissionStore>((set) => ({
  level: readStoredLevel(),
  setLevel: (next) => {
    set((state) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: ExecutionPermissionLevel) => ExecutionPermissionLevel)(state.level)
          : next;
      const normalized = normalizeExecutionPermissionLevelValue(resolved);
      if (normalized === state.level) return state;
      writeStoredLevel(normalized);
      return { level: normalized };
    });
  },
  resetLevel: () => {
    set((state) => {
      if (state.level === DEFAULT_EXECUTION_PERMISSION_LEVEL) return state;
      writeStoredLevel(DEFAULT_EXECUTION_PERMISSION_LEVEL);
      return { level: DEFAULT_EXECUTION_PERMISSION_LEVEL };
    });
  },
  hydrateFromStorage: () => {
    set({ level: readStoredLevel() });
  },
}));

// 跨标签页 storage 事件桥接
let storageBridgeInstalled = false;
export function installExecutionPermissionStorageBridge(): void {
  if (typeof window === "undefined" || storageBridgeInstalled) return;
  storageBridgeInstalled = true;
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      useExecutionPermissionStore.getState().hydrateFromStorage();
    }
  });
}
