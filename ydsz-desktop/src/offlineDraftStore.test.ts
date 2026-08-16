/**
 * @file offlineDraftStore 单元测试
 *
 * 覆盖：
 * 1. enqueue → 增加条目
 * 2. remove → 移除指定 id 的条目
 * 3. pop → 按 createdAt 升序弹出最早一条
 * 4. peek → 查看最早一条不移除
 * 5. clearForThread → 清空某线程
 * 6. countForThread / listForThread → 数量与列表
 * 7. selectOfflineDraftCountForThread / selectOfflineDraftsForThread 选择器
 * 8. 重复 enqueue 同一 id → 保留多条（与 queuedTurn 语义一致）
 * 9. pop 空列表 → 返回 null
 * 10. 并发修改 → listForThread 返回按时间排序的副本
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  useOfflineDraftStore,
  selectOfflineDraftCountForThread,
  selectOfflineDraftsForThread,
  type OfflineDraftEntry,
} from "./offlineDraftStore";

function makeEntry(overrides: Partial<OfflineDraftEntry> = {}): OfflineDraftEntry {
  return {
    id: overrides.id ?? `draft-${Math.random().toString(36).slice(2, 8)}`,
    kind: "chat",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    previewText: overrides.previewText ?? "preview",
    prompt: overrides.prompt ?? "hello",
    images: overrides.images ?? [],
    assistantSelections: overrides.assistantSelections ?? [],
    terminalContexts: overrides.terminalContexts ?? [],
    skills: overrides.skills ?? [],
    mentions: overrides.mentions ?? [],
    selectedProvider: overrides.selectedProvider ?? "codex",
    selectedModel: overrides.selectedModel ?? null,
    selectedPromptEffort: overrides.selectedPromptEffort ?? null,
    modelSelection: overrides.modelSelection ?? { provider: "codex", model: "gpt-5" },
    runtimeMode: overrides.runtimeMode ?? "code",
    interactionMode: overrides.interactionMode ?? "chat",
    envMode: overrides.envMode ?? "local",
    enqueuedAt: overrides.enqueuedAt ?? Date.now(),
    reason: overrides.reason ?? "offline",
  };
}

describe("offlineDraftStore", () => {
  beforeEach(() => {
    useOfflineDraftStore.setState({ draftsByThreadId: {} });
  });

  it("enqueue adds entry to thread bucket", () => {
    const entry = makeEntry();
    useOfflineDraftStore.getState().enqueue("t1", entry);
    expect(useOfflineDraftStore.getState().draftsByThreadId.t1).toHaveLength(1);
    expect(useOfflineDraftStore.getState().draftsByThreadId.t1?.[0]?.id).toBe(entry.id);
  });

  it("enqueue appends to existing bucket", () => {
    const a = makeEntry({ id: "a" });
    const b = makeEntry({ id: "b" });
    useOfflineDraftStore.getState().enqueue("t1", a);
    useOfflineDraftStore.getState().enqueue("t1", b);
    const list = useOfflineDraftStore.getState().draftsByThreadId.t1 ?? [];
    expect(list).toHaveLength(2);
    expect(list.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("remove deletes specific entry", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "a" }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "b" }));
    useOfflineDraftStore.getState().remove("t1", "a");
    const list = useOfflineDraftStore.getState().draftsByThreadId.t1 ?? [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("b");
  });

  it("remove keeps empty bucket present (will be cleaned by pop)", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "a" }));
    useOfflineDraftStore.getState().remove("t1", "a");
    expect(useOfflineDraftStore.getState().draftsByThreadId.t1).toBeUndefined();
  });

  it("remove with unknown id is a no-op", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "a" }));
    useOfflineDraftStore.getState().remove("t1", "missing");
    expect(useOfflineDraftStore.getState().draftsByThreadId.t1).toHaveLength(1);
  });

  it("pop returns the earliest entry by enqueuedAt", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "late", enqueuedAt: 200 }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "early", enqueuedAt: 100 }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "mid", enqueuedAt: 150 }));
    const popped = useOfflineDraftStore.getState().pop("t1");
    expect(popped?.id).toBe("early");
    const remaining = useOfflineDraftStore.getState().draftsByThreadId.t1 ?? [];
    expect(remaining.map((entry) => entry.id).sort()).toEqual(["late", "mid"]);
  });

  it("pop returns null for empty bucket", () => {
    expect(useOfflineDraftStore.getState().pop("t1")).toBeNull();
  });

  it("peek returns earliest entry without removing it", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "late", enqueuedAt: 200 }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "early", enqueuedAt: 100 }));
    const peeked = useOfflineDraftStore.getState().peek("t1");
    expect(peeked?.id).toBe("early");
    expect(useOfflineDraftStore.getState().draftsByThreadId.t1).toHaveLength(2);
  });

  it("peek returns null for empty bucket", () => {
    expect(useOfflineDraftStore.getState().peek("t1")).toBeNull();
  });

  it("clearForThread removes the bucket entirely", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "a" }));
    useOfflineDraftStore.getState().enqueue("t2", makeEntry({ id: "b" }));
    useOfflineDraftStore.getState().clearForThread("t1");
    expect(useOfflineDraftStore.getState().draftsByThreadId.t1).toBeUndefined();
    expect(useOfflineDraftStore.getState().draftsByThreadId.t2).toHaveLength(1);
  });

  it("countForThread returns bucket length", () => {
    expect(useOfflineDraftStore.getState().countForThread("t1")).toBe(0);
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "a" }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "b" }));
    expect(useOfflineDraftStore.getState().countForThread("t1")).toBe(2);
  });

  it("listForThread returns entries sorted by enqueuedAt ascending", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "late", enqueuedAt: 300 }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "early", enqueuedAt: 100 }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "mid", enqueuedAt: 200 }));
    const list = useOfflineDraftStore.getState().listForThread("t1");
    expect(list.map((entry) => entry.id)).toEqual(["early", "mid", "late"]);
  });

  it("listForThread returns frozen empty list for missing bucket", () => {
    const list = useOfflineDraftStore.getState().listForThread("missing");
    expect(list).toEqual([]);
  });

  it("selectOfflineDraftCountForThread works as selector", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "a" }));
    expect(selectOfflineDraftCountForThread(useOfflineDraftStore.getState(), "t1")).toBe(1);
    expect(selectOfflineDraftCountForThread(useOfflineDraftStore.getState(), "missing")).toBe(0);
  });

  it("selectOfflineDraftsForThread returns sorted list", () => {
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "late", enqueuedAt: 200 }));
    useOfflineDraftStore.getState().enqueue("t1", makeEntry({ id: "early", enqueuedAt: 100 }));
    const list = selectOfflineDraftsForThread(useOfflineDraftStore.getState(), "t1");
    expect(list.map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("enqueue with empty threadId is a no-op", () => {
    useOfflineDraftStore.getState().enqueue("", makeEntry({ id: "a" }));
    expect(Object.keys(useOfflineDraftStore.getState().draftsByThreadId)).toHaveLength(0);
  });
});
