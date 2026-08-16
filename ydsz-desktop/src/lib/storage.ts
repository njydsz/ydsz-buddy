/**
 * @file storage.ts
 * @description 状态存储抽象层，提供内存存储和防抖存储实现，
 * 用于需要持久化或延迟写入的状态管理场景。
 */

import { Debouncer } from "@tanstack/react-pacer";

/** 状态存储接口，定义 get/set/remove 操作 */
export interface StateStorage<R = unknown> {
  /** 获取存储项 */
  getItem: (name: string) => string | null | Promise<string | null>;
  /** 设置存储项 */
  setItem: (name: string, value: string) => R;
  /** 删除存储项 */
  removeItem: (name: string) => R;
}

/** 防抖存储接口，扩展 StateStorage 增加刷新操作 */
export interface DebouncedStorage<R = unknown> extends StateStorage<R> {
  /** 立即刷新所有待写入的防抖操作 */
  flush: () => void;
}

/**
 * 创建内存存储实例（基于 Map，非持久化）
 *
 * @returns StateStorage 实例
 */
export function createMemoryStorage(): StateStorage {
  const store = new Map<string, string>();
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => {
      store.set(name, value);
    },
    removeItem: (name) => {
      store.delete(name);
    },
  };
}

/**
 * 创建防抖存储实例，写入操作延迟执行以减少高频更新
 *
 * @param baseStorage - 底层存储实现
 * @param debounceMs - 防抖延迟时间（毫秒），默认 300ms
 * @returns DebouncedStorage 实例
 */
export function createDebouncedStorage(
  baseStorage: StateStorage,
  debounceMs: number = 300,
): DebouncedStorage {
  const debouncedSetItem = new Debouncer(
    (name: string, value: string) => {
      baseStorage.setItem(name, value);
    },
    { wait: debounceMs },
  );

  return {
    getItem: (name) => baseStorage.getItem(name),
    setItem: (name, value) => {
      debouncedSetItem.maybeExecute(name, value);
    },
    removeItem: (name) => {
      debouncedSetItem.cancel();
      baseStorage.removeItem(name);
    },
    flush: () => {
      debouncedSetItem.flush();
    },
  };
}