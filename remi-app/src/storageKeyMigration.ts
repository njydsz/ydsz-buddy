// FILE: storageKeyMigration.ts
// Purpose: Migrates legacy browser storage keys to the RemiCode namespace.
// Layer: Web bootstrap utility
// Exports: migrateRemiCodeLocalStorageKeys

const STORAGE_KEY_MIGRATIONS: readonly (readonly [string, string])[] = [
  ["peakcode:workspace-pages:v2", "remicode:workspace-pages:v2"],
  ["peakcode:terminal-state:v1", "remicode:terminal-state:v1"],
  ["peakcode:renderer-state:v8", "remicode:renderer-state:v8"],
  ["peakcode:split-view-state:v1", "remicode:split-view-state:v1"],
  ["peakcode:single-chat-panel-state:v1", "remicode:single-chat-panel-state:v1"],
  ["peakcode:repo-diff-scope:v1", "remicode:repo-diff-scope:v1"],
  ["peakcode:pinned-threads:v1", "remicode:pinned-threads:v1"],
  ["peakcode:latest-project:v1", "remicode:latest-project:v1"],
  ["peakcode:feature-flags", "remicode:feature-flags"],
  ["peakcode:last-editor", "remicode:last-editor"],
  ["peakcode:composer-drafts:v1", "remicode:composer-drafts:v1"],
  ["peakcode:browser-state:v1", "remicode:browser-state:v1"],
  ["peakcode:app-settings:v1", "remicode:app-settings:v1"],
  ["peakcode:server-settings-migrated:v1", "remicode:server-settings-migrated:v1"],
  ["peakcode:whats-new:v1", "remicode:whats-new:v1"],
  ["peakcode:enabled-model-channels:v1", "remicode:enabled-model-channels:v1"],
  ["peakcode.openUsage.enabled", "remicode.openUsage.enabled"],
];

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

// Run during bootstrap before stores hydrate from localStorage.
migrateRemiCodeLocalStorageKeys();
