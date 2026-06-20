/**
 * @file 存储键迁移
 *
 * 将旧版浏览器 localStorage 键名迁移到 RemiCode 命名空间。
 * 在应用启动时（Store 水合之前）自动执行迁移，
 * 确保旧版数据不会丢失。仅当目标键不存在时才执行迁移。
 */

/** 存储键迁移映射表，每个元素为 [旧键名, 新键名] */
const STORAGE_KEY_MIGRATIONS: readonly (readonly [string, string])[] = [];

/**
 * 执行 localStorage 键名迁移。
 * 遍历迁移映射表，将旧键的值复制到新键（仅当新键不存在时）。
 * 使用 globalThis.localStorage 以兼容浏览器和 Node 测试环境。
 */
export function migrateRemiCodeLocalStorageKeys(): void {
  // Prefer globalThis.localStorage so this works identically in browsers (where
  // globalThis === window) and in node-based unit tests that stub the global.
  let storage: Storage | null = null;
  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    return;
  }
  if (!storage) {
    return;
  }

  try {
    for (const [legacyKey, nextKey] of STORAGE_KEY_MIGRATIONS) {
      if (storage.getItem(nextKey) !== null) {
        continue;
      }
      const legacyValue = storage.getItem(legacyKey);
      if (legacyValue !== null) {
        storage.setItem(nextKey, legacyValue);
      }
    }
  } catch {
    // Storage can be unavailable in private/sandboxed contexts; the app should still boot.
  }
}

/** 在应用启动时、Store 水合之前自动执行迁移 */
migrateRemiCodeLocalStorageKeys();
