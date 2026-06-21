/**
 * @file useLocalStorage.ts
 * @description 本地存储 Hook - 提供类型安全???localStorage 访问和响应式状态管??? * @module hooks/useLocalStorage
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 同构 localStorage 实现
 *
 * @description
 * 在浏览器环境中使用原生的 window.localStorage??? * 在非浏览器环境（???SSR）中使用基于 Map 的内存实现??? */
const isomorphicLocalStorage: Storage =
  typeof window !== "undefined"
    ? window.localStorage
    : (function () {
        const store = new Map<string, string>();
        return {
          clear: () => store.clear(),
          getItem: (_) => store.get(_) ?? null,
          key: (index) => Array.from(store.keys()).at(index) ?? null,
          get length() {
            return store.size;
          },
          removeItem: (_) => store.delete(_),
          setItem: (_, value) => store.set(_, value),
        };
      })();

/**
 * 本地存储编解码器接口
 *
 * TODO: 迁移期间临时使用 JSON 序列化；后续可接???zod/effect 进行校验??? */
export interface LocalStorageCodec<T> {
  encode: (value: T) => string;
  decode: (value: string) => T;
}

/**
 * 创建基于 JSON 的编解码??? */
export function jsonCodec<T>(): LocalStorageCodec<T> {
  return {
    encode: (value) => JSON.stringify(value),
    decode: (value) => JSON.parse(value) as T,
  };
}

/**
 * ???localStorage 获取??? *
 * @param key - 存储键名
 * @param codec - 编解码器（当前仅作类型占位，实际使用 JSON 解析??? * @returns 解码后的值，如果不存在或解码失败则返???null
 */
export const getLocalStorageItem = <T>(key: string, _codec?: unknown): T | null => {
  const item = isomorphicLocalStorage.getItem(key);
  if (!item) return null;
  try {
    return JSON.parse(item) as T;
  } catch {
    return null;
  }
};

/**
 * ???localStorage 设置??? *
 * @param key - 存储键名
 * @param value - 要存储的??? * @param codec - 编解码器（当前仅作类型占位，实际使用 JSON 序列化）
 */
export const setLocalStorageItem = <T>(key: string, value: T, _codec?: unknown) => {
  isomorphicLocalStorage.setItem(key, JSON.stringify(value));
};

/**
 * ???localStorage 移除??? *
 * @param key - 存储键名
 */
export const removeLocalStorageItem = (key: string) => {
  isomorphicLocalStorage.removeItem(key);
};

/** 本地存储变化事件的自定义事件???*/
const LOCAL_STORAGE_CHANGE_EVENT = "remi-claw:local_storage_change";

/** 本地存储变化事件的详情类???*/
interface LocalStorageChangeDetail {
  key: string;
}

/**
 * 派发本地存储变化事件
 *
 * @description
 * 用于在同一标签页内的多个组件之间同???localStorage 变化??? * 跨标签页的同步由原生???storage 事件处理??? *
 * @param key - 变化的存储键??? */
function dispatchLocalStorageChange(key: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LocalStorageChangeDetail>(LOCAL_STORAGE_CHANGE_EVENT, {
      detail: { key },
    }),
  );
}

/**
 * 本地存储 Hook
 *
 * @description
 * 提供类型安全???localStorage 访问，支持：
 * - 自动同步跨标签页的变化（通过 storage 事件??? * - 自动同步同一标签页内的变化（通过自定义事件）
 * - 响应式状态更??? *
 * @typeParam T - 存储值的类型
 *
 * @param key - 存储键名
 * @param initialValue - 初始值（???localStorage 中不存在时使用）
 * @param codec - 编解码器（当前仅作类型占位，实际使用 JSON 序列化）
 *
 * @returns 包含当前值和设置函数的元??? */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  _codec?: unknown,
): [T, (value: T | ((val: T) => T)) => void] {
  // 从 localStorage 获取初始值或使用提供的初始值
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = getLocalStorageItem<T>(key);
      return item ?? initialValue;
    } catch (error) {
      console.error("[LOCALSTORAGE] Error:", error);
      return initialValue;
    }
  });

  // 返回包装后的 setState 函数，将新值持久化???localStorage
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        setStoredValue((prev) => {
          const valueToStore = typeof value === "function" ? (value as (val: T) => T)(prev) : value;
          if (valueToStore === null) {
            removeLocalStorageItem(key);
          } else {
            setLocalStorageItem(key, valueToStore);
          }
          // 在状态更新完成后派发事件，避免嵌套状态更???
          queueMicrotask(() => dispatchLocalStorageChange(key));
          return valueToStore;
        });
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    },
    [key],
  );

  const prevKeyRef = useRef(key);

  // 当键名变化时???localStorage 重新同步
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      try {
        const newValue = getLocalStorageItem<T>(key);
        setStoredValue(newValue ?? initialValue);
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    }
  }, [key, initialValue]);

  // 监听来自其他标签页的 storage 事件和同一标签页的自定义事件
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const newValue = getLocalStorageItem<T>(key);
        setStoredValue(newValue ?? initialValue);
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    };

    // 处理跨标签页???storage 事件
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key) {
        syncFromStorage();
      }
    };

    // 处理同一标签页内的自定义事件
    const handleLocalChange = (event: Event) => {
      const detail = (event as CustomEvent<LocalStorageChangeDetail>).detail;
      if (detail?.key === key) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange);
    };
  }, [key, initialValue]);

  return [storedValue, setValue];
}
