// FILE: storageKeyMigration.test.ts
// Purpose: Verify the localStorage migration bootstrap does not crash the app.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

function createMemoryStorage(): Storage {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage;
}

async function importMigrationFresh() {
  vi.resetModules();
  return await import("./storageKeyMigration");
}

describe("storageKeyMigration", () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
    vi.resetModules();
  });

  it("does not modify existing peakcode keys", async () => {
    globalThis.localStorage.setItem("peakcode:renderer-state:v8", '{"projectNamesByCwd":{}}');

    await importMigrationFresh();

    expect(globalThis.localStorage.getItem("peakcode:renderer-state:v8")).toBe(
      '{"projectNamesByCwd":{}}',
    );
  });

  it("swallows storage errors so the app can still boot", async () => {
    const failingStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
      clear: () => {
        throw new Error("denied");
      },
      key: () => null,
      length: 0,
    } as Storage;
    globalThis.localStorage = failingStorage;

    await expect(importMigrationFresh()).resolves.toBeDefined();
  });
});
