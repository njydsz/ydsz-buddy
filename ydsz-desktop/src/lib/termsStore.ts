/**
 * @file 使用条款接受状态 Store
 * @description 记录用户在首次启动时是否已接受使用条款 + 隐私政策。
 *
 * ## 核心能力
 *
 * - `termsAcceptedAt`: ISO 时间戳字符串,用户勾选并点击"同意并继续"后写入
 * - 跨标签页同步(通过 storage 事件)
 * - React 响应式读取(基于 useSyncExternalStore)
 *
 * ## 合规背景
 *
 * 对齐移动端 `ydsz-mobile/src/lib/settings-store.ts::termsAcceptedAt`,
 * 桌面端同样需要在首次启动时强制用户接受条款,并在设置页提供查看入口。
 *
 * @module lib/termsStore
 */

import { useSyncExternalStore } from "react";

/** localStorage 存储键 */
const TERMS_STORAGE_KEY = "ydsz-buddy:terms-accepted";

/** Terms 状态形态 */
export interface TermsState {
  /** ISO 时间戳;null 表示尚未接受 */
  termsAcceptedAt: string | null;
}

/** 默认状态:未接受 */
const DEFAULT_TERMS_STATE: TermsState = {
  termsAcceptedAt: null,
};

/** 监听器集合 */
const listeners = new Set<() => void>();
/** 内存回退状态(localStorage 不可用时) */
let memoryState: TermsState = DEFAULT_TERMS_STATE;
/** 缓存的原始 localStorage 值,避免重复 JSON 解析 */
let cachedRawTermsState: string | null | undefined;
/** 缓存的解析后状态 */
let cachedTermsState = DEFAULT_TERMS_STATE;

/** 检测 localStorage 是否可用 */
function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** 将未知值标准化为 TermsState */
function normalizeTermsState(value: unknown): TermsState {
  if (!value || typeof value !== "object") {
    return DEFAULT_TERMS_STATE;
  }
  const record = value as Partial<TermsState>;
  const raw = record.termsAcceptedAt;
  return {
    termsAcceptedAt:
      typeof raw === "string" && raw.length > 0 ? raw : null,
  };
}

/** 从 localStorage 读取(带缓存) */
function readTermsState(): TermsState {
  if (!canUseLocalStorage()) {
    return memoryState;
  }
  try {
    const raw = window.localStorage.getItem(TERMS_STORAGE_KEY);
    if (raw === cachedRawTermsState) {
      return cachedTermsState;
    }
    cachedRawTermsState = raw;
    cachedTermsState = normalizeTermsState(raw ? JSON.parse(raw) : null);
    return cachedTermsState;
  } catch {
    return DEFAULT_TERMS_STATE;
  }
}

/** 写入 localStorage 并通知监听器 */
function writeTermsState(state: TermsState): void {
  memoryState = state;
  if (canUseLocalStorage()) {
    try {
      const raw = JSON.stringify(state);
      window.localStorage.setItem(TERMS_STORAGE_KEY, raw);
      cachedRawTermsState = raw;
      cachedTermsState = state;
    } catch {
      // 静默失败:terms 状态是尽力而为的本地标记
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

/** 订阅状态变更(含跨标签页 storage 事件) */
function subscribeTerms(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === TERMS_STORAGE_KEY) {
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
 * 标记用户已接受使用条款。
 * 写入当前时间戳并通知所有订阅者。
 */
export function acceptTerms(): void {
  writeTermsState({
    termsAcceptedAt: new Date().toISOString(),
  });
}

/**
 * 重置接受状态(用于设置页"重新查看条款"或测试场景)。
 * 清空时间戳,使 TermsAcceptanceGate 重新弹出。
 */
export function resetTermsAcceptance(): void {
  writeTermsState(DEFAULT_TERMS_STATE);
}

/** 同步读取当前 terms 状态(非 React 上下文使用) */
export function getTermsState(): TermsState {
  return readTermsState();
}

/** 同步判断是否已接受条款 */
export function hasAcceptedTerms(): boolean {
  return readTermsState().termsAcceptedAt !== null;
}

/**
 * React Hook:响应式读取 terms 状态。
 *
 * @example
 * ```tsx
 * const { termsAcceptedAt } = useTermsState();
 * if (!termsAcceptedAt) return <TermsAcceptanceGate />;
 * ```
 */
export function useTermsState(): TermsState {
  return useSyncExternalStore(
    subscribeTerms,
    readTermsState,
    () => DEFAULT_TERMS_STATE,
  );
}
