// FILE: vitest.setup.ts
// Purpose: Polyfill browser-only globals (localStorage) for zustand persist
//          tests that need to run in the node test environment.

const memoryStorageStore = new Map<string, string>();

const memoryStorage: Storage = {
  get length() {
    return memoryStorageStore.size;
  },
  clear() {
    memoryStorageStore.clear();
  },
  getItem(key) {
    return memoryStorageStore.has(key) ? (memoryStorageStore.get(key) ?? null) : null;
  },
  key(index) {
    return Array.from(memoryStorageStore.keys())[index] ?? null;
  },
  removeItem(key) {
    memoryStorageStore.delete(key);
  },
  setItem(key, value) {
    memoryStorageStore.set(key, value);
  },
};

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: memoryStorage,
  });
}
