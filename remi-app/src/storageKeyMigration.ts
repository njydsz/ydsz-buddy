/**
 * @file 存储键迁�? *
 * 将旧版浏览器 localStorage 键名迁移�?Remi Claw 命名空间�? * 在应用启动时（Store 水合之前）自动执行迁移，
 * 确保旧版数据不会丢失。仅当目标键不存在时才执行迁移�? */

/**
 * 存储键迁移映射表，每个元素为 [旧键�? 新键名]
 *
 * 品牌升级 Remi Code �?Remi Claw 后，所�?`remicode:` 前缀�?localStorage �? * 都需要迁移到 `remi-claw:` 前缀。此映射表集中维护迁移关系�? */
const STORAGE_KEY_MIGRATIONS: readonly (readonly [string, string])[] = [
  ["remicode:app-settings:v1", "remi-claw:app-settings:v1"],
  ["remicode:server-settings-migrated:v1", "remi-claw:server-settings-migrated:v1"],
  ["remicode:workspace-pages:v2", "remi-claw:workspace-pages:v2"],
  ["remicode:terminal-state:v1", "remi-claw:terminal-state:v1"],
  ["remicode:single-chat-panel-state:v1", "remi-claw:single-chat-panel-state:v1"],
  ["remicode:repo-diff-scope:v1", "remi-claw:repo-diff-scope:v1"],
  ["remicode:pinned-threads:v1", "remi-claw:pinned-threads:v1"],
  ["remicode:latest-project:v1", "remi-claw:latest-project:v1"],
  ["remicode:browser-state:v1", "remi-claw:browser-state:v1"],
  ["remicode:split-view-state:v1", "remi-claw:split-view-state:v1"],
  ["remicode:composer-drafts:v1", "remi-claw:composer-drafts:v1"],
  ["remicode:enabled-model-channels:v1", "remi-claw:enabled-model-channels:v1"],
  ["remicode:whats-new:v1", "remi-claw:whats-new:v1"],
  ["remicode:sidebar-ui:v1", "remi-claw:sidebar-ui:v1"],
  ["remicode:show-debug-feature-flags-menu", "remi-claw:show-debug-feature-flags-menu"],
  ["remicode:feature-flags", "remi-claw:feature-flags"],
  ["remicode:theme", "remi-claw:theme"],
  ["remi-claw.openUsage.enabled", "remi-claw.openUsage.enabled"],
  ["remicode:last-invoked-script-by-project", "remi-claw:last-invoked-script-by-project"],
  ["remicode:dismissed-provider-health-banners", "remi-claw:dismissed-provider-health-banners"],
  ["remicode:renderer-state:v8", "remi-claw:renderer-state:v8"],
  ["remicode:panel-resize-overlay-sync", "remi-claw:panel-resize-overlay-sync"],
  // WebView partition（由 webkit 内部使用�?  ["persist:remi-claw-browser", "persist:remi-claw-browser"],
  // Lexical 编辑�?namespace
  ["remi-claw-composer-editor", "remi-claw-composer-editor"],
];

/**
 * 执行 localStorage 键名迁移�? * 遍历迁移映射表，将旧键的值复制到新键（仅当新键不存在时）�? * 使用 globalThis.localStorage 以兼容浏览器�?Node 测试环境�? */
export function migrateRemiClawLocalStorageKeys(): void {
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
migrateRemiClawLocalStorageKeys();
