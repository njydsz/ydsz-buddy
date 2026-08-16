/**
 * @file threadRename 单元测试
 *
 * 覆盖：
 * - 空标题 → "empty"
 * - unchangedTitles 命中 → "unchanged"
 * - 没有 nativeApi → "unavailable"
 * - 有 nativeApi + 无 createIfMissing → dispatch thread.meta.update → "renamed"
 * - 有 nativeApi + 有 createIfMissing + promotion='created' → 走 promotion, "renamed"
 * - 有 nativeApi + 有 createIfMissing + promotion='exists' → 后续 dispatch thread.meta.update, "renamed"
 * - 标题 trim 处理
 *
 * 策略：mock nativeApi + promoteThreadCreate，覆盖所有 outcome 路径。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectId, ThreadId } from "@ydsz-buddy/contracts";

// =============================================================================
// Mock 状态容器
// =============================================================================

const { mockState } = vi.hoisted(() => {
  const state = {
    api: null as null | {
      orchestration: { dispatchCommand: ReturnType<typeof vi.fn> };
    },
    promoteResult: "created" as "created" | "exists" | "unavailable",
  };
  return { mockState: state };
});

vi.mock("../nativeApi", () => ({
  readNativeApi: () => mockState.api,
}));

vi.mock("./threadCreatePromotion", () => ({
  promoteThreadCreate: vi.fn(async () => mockState.promoteResult),
}));

vi.mock("./utils", () => ({
  newCommandId: () => "cmd-id-1",
}));

// 必须在 mock 之后导入
import { dispatchThreadRename } from "./threadRename";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetMocks() {
  mockState.api = null;
  mockState.promoteResult = "created";
}

const TID = "thread-1" as ThreadId;
const PROJECT = "project-1" as ProjectId;

const baseInput = {
  threadId: TID,
  unchangedTitles: ["untitled"],
  createIfMissing: {
    projectId: PROJECT,
    modelSelection: { provider: "codex" as const, model: "codex-default" },
    runtimeMode: "code" as const,
    interactionMode: "agent" as const,
    envMode: "local" as const,
    branch: null,
    worktreePath: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
};

function makeApi() {
  return {
    orchestration: {
      dispatchCommand: vi.fn(async () => undefined),
    },
  };
}

// =============================================================================
// 1. 早期返回
// =============================================================================

describe("dispatchThreadRename - 早期返回", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("空标题 → empty", async () => {
    mockState.api = makeApi();
    const result = await dispatchThreadRename({ ...baseInput, newTitle: "   " });
    expect(result).toBe("empty");
  });

  it("unchangedTitles 命中 → unchanged", async () => {
    mockState.api = makeApi();
    const result = await dispatchThreadRename({
      ...baseInput,
      newTitle: "untitled",
    });
    expect(result).toBe("unchanged");
  });

  it("无 nativeApi → unavailable", async () => {
    mockState.api = null;
    const result = await dispatchThreadRename({ ...baseInput, newTitle: "new title" });
    expect(result).toBe("unavailable");
  });
});

// =============================================================================
// 2. 走 thread.meta.update 路径（无 createIfMissing）
// =============================================================================

describe("dispatchThreadRename - thread.meta.update", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("有 api + 无 createIfMissing → dispatch thread.meta.update", async () => {
    const api = makeApi();
    mockState.api = api;

    const result = await dispatchThreadRename({
      threadId: TID,
      newTitle: "My Thread",
      unchangedTitles: [],
    });
    expect(result).toBe("renamed");
    expect(api.orchestration.dispatchCommand).toHaveBeenCalledWith({
      type: "thread.meta.update",
      commandId: "cmd-id-1",
      threadId: TID,
      title: "My Thread",
    });
  });

  it("trim 处理：前后空格被去掉", async () => {
    const api = makeApi();
    mockState.api = api;

    await dispatchThreadRename({
      threadId: TID,
      newTitle: "  Padded  ",
      unchangedTitles: [],
    });
    expect(api.orchestration.dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Padded" }),
    );
  });
});

// =============================================================================
// 3. 走 promoteThreadCreate 路径
// =============================================================================

describe("dispatchThreadRename - promoteThreadCreate", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("promotion=created → 走 promotion 路径，不再单独 dispatch thread.meta.update", async () => {
    const api = makeApi();
    mockState.api = api;
    mockState.promoteResult = "created";

    const result = await dispatchThreadRename({
      ...baseInput,
      newTitle: "New Title",
    });
    expect(result).toBe("renamed");
    // dispatchCommand 应只被 promoteThreadCreate 调用（mocked），不在 hook 中
    expect(api.orchestration.dispatchCommand).not.toHaveBeenCalled();
  });

  it("promotion=exists → 后续 dispatch thread.meta.update", async () => {
    const api = makeApi();
    mockState.api = api;
    mockState.promoteResult = "exists";

    const result = await dispatchThreadRename({
      ...baseInput,
      newTitle: "Recovered Title",
    });
    expect(result).toBe("renamed");
    expect(api.orchestration.dispatchCommand).toHaveBeenCalledWith({
      type: "thread.meta.update",
      commandId: "cmd-id-1",
      threadId: TID,
      title: "Recovered Title",
    });
  });
});
