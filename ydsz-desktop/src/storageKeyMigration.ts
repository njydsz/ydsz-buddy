/**
 * @file 存储键迁移
 * 将旧版浏览器 localStorage 键名迁移到 ydsz-buddy 命名空间。
 * 在应用启动时（Store 水合之前）自动执行迁移，
 * 确保旧版数据不会丢失。仅当目标键不存在时才执行迁移。
 */

/**
 * 存储键迁移映射表，每个元素为 [旧键名, 新键名]
 *
 * 品牌升级 ydsz-shared:: -> ydsz-buddy 后，所有 `/ydsz-git/` 前缀的 localStorage 键
 * 都需要迁移到 `ydsz-buddy:` 前缀。此映射表集中维护迁移关系。
 */
const STORAGE_KEY_MIGRATIONS: readonly (readonly [string, string])[] = [
  ["/ydsz-git/app-settings:v1", "ydsz-buddy:app-settings:v1"],
  ["/ydsz-git/server-settings-migrated:v1", "ydsz-buddy:server-settings-migrated:v1"],
  // workspace-pages store 的 storage key 已升到 v3(zustand persist version=4),
  // 旧版 ydszcode 用户的 v2 数据复制到 v3 key 后,会由 store 的 migrate(version<3)/(version<4)
  // 自动补齐 homeDir=null + threadId/worktreePath=null 字段。
  ["/ydsz-git/workspace-pages:v2", "ydsz-buddy:workspace-pages:v3"],
  ["ydsz-buddy:workspace-pages:v2", "ydsz-buddy:workspace-pages:v3"],
  ["/ydsz-git/terminal-state:v1", "ydsz-buddy:terminal-state:v1"],
  ["/ydsz-git/single-chat-panel-state:v1", "ydsz-buddy:single-chat-panel-state:v1"],
  ["/ydsz-git/repo-diff-scope:v1", "ydsz-buddy:repo-diff-scope:v1"],
  ["/ydsz-git/pinned-threads:v1", "ydsz-buddy:pinned-threads:v1"],
  ["/ydsz-git/latest-project:v1", "ydsz-buddy:latest-project:v1"],
  ["/ydsz-git/browser-state:v1", "ydsz-buddy:browser-state:v1"],
  ["/ydsz-git/split-view-state:v1", "ydsz-buddy:split-view-state:v1"],
  ["/ydsz-git/composer-drafts:v1", "ydsz-buddy:composer-drafts:v1"],
  ["/ydsz-git/enabled-model-channels:v1", "ydsz-buddy:enabled-model-channels:v1"],
  ["/ydsz-git/whats-new:v1", "ydsz-buddy:whats-new:v1"],
  ["/ydsz-git/sidebar-ui:v1", "ydsz-buddy:sidebar-ui:v1"],
  ["/ydsz-git/show-debug-feature-flags-menu", "ydsz-buddy:show-debug-feature-flags-menu"],
  ["/ydsz-git/feature-flags", "ydsz-buddy:feature-flags"],
  ["/ydsz-git/theme", "ydsz-buddy:theme"],
  ["2. 环境变量 YDSZ_BOOTSTRAP_TOKEN.openUsage.enabled", "2. 环境变量 YDSZ_BOOTSTRAP_TOKEN.openUsage.enabled"],
  ["/ydsz-git/last-invoked-script-by-project", "ydsz-buddy:last-invoked-script-by-project"],
  ["/ydsz-git/dismissed-provider-health-banners", "ydsz-buddy:dismissed-provider-health-banners"],
  ["/ydsz-git/renderer-state:v8", "ydsz-buddy:renderer-state:v8"],
  ["/ydsz-git/panel-resize-overlay-sync", "ydsz-buddy:panel-resize-overlay-sync"],
  // WebView partition（由 webkit 内部使用）
  ["persist:2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-browser", "persist:2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-browser"],
  // Lexical 编辑器 namespace
  ["2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-composer-editor", "2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-composer-editor"],
];

/**
 * 执行 localStorage 键名迁移。
 * 遍历迁移映射表，将旧键的值复制到新键（仅当新键不存在时）。
 * 使用 globalThis.localStorage 以兼容浏览器和 Node 测试环境。
 */
export function migrateYdszBuddyLocalStorageKeys(): void {
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
migrateYdszBuddyLocalStorageKeys();
