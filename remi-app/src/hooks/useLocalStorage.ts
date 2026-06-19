/**
 * @file useLocalStorage.ts
 * @description 本地存储 Hook - 提供类型安全的 localStorage 访问和响应式状态管理
 * @module hooks/useLocalStorage
 */

import * as Schema from "effect/Schema";
import * as Record from "effect/Record";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 同构 localStorage 实现
 * 
 * @description
 * 在浏览器环境中使用原生的 window.localStorage，
 * 在非浏览器环境（如 SSR）中使用基于 Map 的内存实现。
 */
const isomorphicLocalStorage: Storage =
  typeof window !== "undefined"
    ? window.localStorage
    : (function () {
        const store = new Map<string, string>();
        return {
          clear: () => store.clear(),
          getItem: (_) => store.get(_) ?? null,
          key: (_) => Record.keys(store).at(_) ?? null,
          get length() {
            return store.size;
          },
          removeItem: (_) => store.delete(_),
          setItem: (_, value) => store.set(_, value),
        };
      })();

/**
 * 使用 Effect Schema 解码 localStorage 中的值
 */
const decode = <T, E>(schema: Schema.Codec<T, E>, value: string) =>
  Schema.decodeSync(Schema.fromJsonString(schema))(value);

/**
 * 使用 Effect Schema 编码值以存储到 localStorage
 */
const encode = <T, E>(schema: Schema.Codec<T, E>, value: T) =>
  Schema.encodeSync(Schema.fromJsonString(schema))(value);

/**
 * 从 localStorage 获取项
 * 
 * @param key - 存储键名
 * @param schema - Effect Schema 编解码器
 * @returns 解码后的值，如果不存在或解码失败则返回 null
 */
export const getLocalStorageItem = <T, E>(key: string, schema: Schema.Codec<T, E>): T | null => {
  const item = isomorphicLocalStorage.getItem(key);
  return item ? decode(schema, item) : null;
};

/**
 * 向 localStorage 设置项
 * 
 * @param key - 存储键名
 * @param value - 要存储的值
 * @param schema - Effect Schema 编解码器
 */
export const setLocalStorageItem = <T, E>(key: string, value: T, schema: Schema.Codec<T, E>) => {
  const valueToSet = encode(schema, value);
  isomorphicLocalStorage.setItem(key, valueToSet);
};

/**
 * 从 localStorage 移除项
 * 
 * @param key - 存储键名
 */
export const removeLocalStorageItem = (key: string) => {
  isomorphicLocalStorage.removeItem(key);
};

/** 本地存储变化事件的自定义事件名 */
const LOCAL_STORAGE_CHANGE_EVENT = "remicode:local_storage_change";

/** 本地存储变化事件的详情类型 */
interface LocalStorageChangeDetail {
  key: string;
}

/**
 * 派发本地存储变化事件
 * 
 * @description
 * 用于在同一标签页内的多个组件之间同步 localStorage 变化。
 * 跨标签页的同步由原生的 storage 事件处理。
 * 
 * @param key - 变化的存储键名
 */
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
 * 提供类型安全的 localStorage 访问，支持：
 * - 使用 Effect Schema 进行类型安全的编解码
 * - 自动同步跨标签页的变化（通过 storage 事件）
 * - 自动同步同一标签页内的变化（通过自定义事件）
 * - 响应式状态更新
 * 
 * @typeParam T - 存储值的类型
 * @typeParam E - Schema 编码类型
 * 
 * @param key - 存储键名
 * @param initialValue - 初始值（当 localStorage 中不存在时使用）
 * @param schema - Effect Schema 编解码器
 * 
 * @returns 包含当前值和设置函数的元组
 * 
 * @example
 * ```tsx
 * import * as Schema from "effect/Schema";
 * 
 * const UserSchema = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.Number
 * });
 * 
 * const [user, setUser] = useLocalStorage("user", { name: "", age: 0 }, UserSchema);
 * 
 * setUser({ name: "Alice", age: 30 });
 * ```
 */
export function useLocalStorage<T, E>(
  key: string,
  initialValue: T,
  schema: Schema.Codec<T, E>,
): [T, (value: T | ((val: T) => T)) => void] {
  // 从 localStorage 获取初始值或使用提供的初始值
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = getLocalStorageItem(key, schema);
      return item ?? initialValue;
    } catch (error) {
      console.error("[LOCALSTORAGE] Error:", error);
      return initialValue;
    }
  });

  // 返回包装后的 setState 函数，将新值持久化到 localStorage
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        setStoredValue((prev) => {
          const valueToStore = typeof value === "function" ? (value as (val: T) => T)(prev) : value;
          if (valueToStore === null) {
            removeLocalStorageItem(key);
          } else {
            setLocalStorageItem(key, valueToStore, schema);
          }
          // 在状态更新完成后派发事件，避免嵌套状态更新
          queueMicrotask(() => dispatchLocalStorageChange(key));
          return valueToStore;
        });
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    },
    [key, schema],
  );

  const prevKeyRef = useRef(key);

  // 当键名变化时从 localStorage 重新同步
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      try {
        const newValue = getLocalStorageItem(key, schema);
        setStoredValue(newValue ?? initialValue);
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    }
  }, [key, initialValue, schema]);

  // 监听来自其他标签页的 storage 事件和同一标签页的自定义事件
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const newValue = getLocalStorageItem(key, schema);
        setStoredValue(newValue ?? initialValue);
      } catch (error) {
        console.error("[LOCALSTORAGE] Error:", error);
      }
    };

    // 处理跨标签页的 storage 事件
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key) {
        syncFromStorage();
      }
    };

    // 处理同一标签页内的自定义事件
    const handleLocalChange = (event: CustomEvent<LocalStorageChangeDetail>) => {
      if (event.detail.key === key) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange as EventListener);
    };
  }, [key, initialValue, schema]);

  return [storedValue, setValue];
}
