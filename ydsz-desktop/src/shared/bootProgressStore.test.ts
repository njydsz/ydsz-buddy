/**
 * @file bootProgressStore 单元测试
 *
 * 覆盖:
 *
 * 1. 默认值（所有阶段为 pending、isBootCompleted=false、bootError=null）
 * 2. startStage / completeStage / failStage 状态转换
 * 3. 状态机：已 done / in_progress 阶段不会被重复覆盖
 * 4. isBootCompleted 在所有阶段 done 时自动翻转
 * 5. failStage 会写入 bootError（整体错误）
 * 6. resetStages 回到初始状态（可指定自定义 label）
 * 7. setBootError 单独设置整体错误
 * 8. computeBootProgress 进度计算（done 阶段数 / 总阶段数）
 * 9. labelOverride 生效
 * 10. startedAt / completedAt 时间戳写入
 * 11. 非法阶段 id 容错（不影响其他阶段）
 * 12. failStage 支持 errorType 参数，fatal 错误会标记 hasFatalError
 * 13. clearFatalError 清除 fatal 错误
 * 14. inferBootStageErrorType 启发式推断
 * 15. isFatalBootErrorType 判定
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOOT_STAGE_IDS,
  DEFAULT_BOOT_STAGE_LABELS,
  FATAL_BOOT_STAGE_ERROR_TYPES,
  __resetBootProgressStoreForTest,
  computeBootProgress,
  inferBootStageErrorType,
  isFatalBootErrorType,
  useBootProgressStore,
  type BootStageErrorType,
  type BootStageId,
} from "./bootProgressStore";

function resetStore() {
  __resetBootProgressStoreForTest();
}

beforeEach(() => {
  resetStore();
  vi.useRealTimers();
});

afterEach(() => {
  resetStore();
  vi.useRealTimers();
});

describe("bootProgressStore - 默认值", () => {
  it("所有阶段默认 status=pending、errorMessage=null", () => {
    const stages = useBootProgressStore.getState().stages;
    for (const id of BOOT_STAGE_IDS) {
      expect(stages[id]?.status).toBe("pending");
      expect(stages[id]?.errorMessage ?? null).toBeNull();
      expect(stages[id]?.startedAt ?? null).toBeNull();
      expect(stages[id]?.completedAt ?? null).toBeNull();
      expect(stages[id]?.label).toBe(DEFAULT_BOOT_STAGE_LABELS[id]);
    }
  });

  it("isBootCompleted=false, bootError=null", () => {
    const state = useBootProgressStore.getState();
    expect(state.isBootCompleted).toBe(false);
    expect(state.bootError).toBeNull();
  });

  it("BOOT_STAGE_IDS 按启动顺序排列", () => {
    expect(BOOT_STAGE_IDS).toEqual([
      "native-api",
      "server-welcome",
      "shell-snapshot",
      "settings",
      "route-ready",
      "ui-ready",
    ]);
  });
});

describe("bootProgressStore - startStage", () => {
  it("pending → in_progress 并写入 startedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    useBootProgressStore.getState().startStage("native-api");
    const stage = useBootProgressStore.getState().stages["native-api"];
    expect(stage?.status).toBe("in_progress");
    expect(stage?.startedAt).toBe(1_700_000_000_000);
    expect(stage?.completedAt ?? null).toBeNull();
  });

  it("labelOverride 会覆盖默认 label", () => {
    useBootProgressStore.getState().startStage("native-api", "Custom label");
    const stage = useBootProgressStore.getState().stages["native-api"];
    expect(stage?.label).toBe("Custom label");
  });

  it("已经在 in_progress 时重复 startStage 不会重置 startedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    useBootProgressStore.getState().startStage("settings");

    vi.setSystemTime(1_700_000_001_000);
    useBootProgressStore.getState().startStage("settings");
    expect(useBootProgressStore.getState().stages["settings"]?.startedAt).toBe(1_700_000_000_000);
  });

  it("已经 done 时 startStage 不会回退状态", () => {
    useBootProgressStore.getState().startStage("native-api");
    useBootProgressStore.getState().completeStage("native-api");
    expect(useBootProgressStore.getState().stages["native-api"]?.status).toBe("done");

    useBootProgressStore.getState().startStage("native-api");
    expect(useBootProgressStore.getState().stages["native-api"]?.status).toBe("done");
  });

  it("error 阶段可以重新 start（允许重试流程）", () => {
    useBootProgressStore.getState().startStage("settings");
    useBootProgressStore.getState().failStage("settings", "boom");
    expect(useBootProgressStore.getState().stages["settings"]?.status).toBe("error");

    useBootProgressStore.getState().startStage("settings");
    expect(useBootProgressStore.getState().stages["settings"]?.status).toBe("in_progress");
    expect(useBootProgressStore.getState().stages["settings"]?.errorMessage).toBeNull();
  });
});

describe("bootProgressStore - completeStage", () => {
  it("in_progress → done 并写入 completedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);

    useBootProgressStore.getState().startStage("settings");
    vi.setSystemTime(5_000);
    useBootProgressStore.getState().completeStage("settings");

    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.status).toBe("done");
    expect(stage?.startedAt).toBe(2_000);
    expect(stage?.completedAt).toBe(5_000);
  });

  it("pending 也能直接 complete（无需先 start）", () => {
    useBootProgressStore.getState().completeStage("ui-ready");
    expect(useBootProgressStore.getState().stages["ui-ready"]?.status).toBe("done");
  });

  it("重复 completeStage 是幂等的", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    useBootProgressStore.getState().startStage("settings");
    useBootProgressStore.getState().completeStage("settings");

    vi.setSystemTime(20_000);
    useBootProgressStore.getState().completeStage("settings");
    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.status).toBe("done");
    expect(stage?.completedAt).toBe(10_000);
  });

  it("error 阶段可以 complete（覆盖错误态）", () => {
    useBootProgressStore.getState().startStage("settings");
    useBootProgressStore.getState().failStage("settings", "boom");
    useBootProgressStore.getState().completeStage("settings");

    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.status).toBe("done");
    expect(stage?.errorMessage).toBeNull();
  });

  it("全部阶段都 done 时 isBootCompleted 自动翻转", () => {
    for (const id of BOOT_STAGE_IDS) {
      useBootProgressStore.getState().startStage(id);
      useBootProgressStore.getState().completeStage(id);
    }
    expect(useBootProgressStore.getState().isBootCompleted).toBe(true);
  });

  it("还有阶段未 done 时 isBootCompleted 保持 false", () => {
    useBootProgressStore.getState().startStage("native-api");
    useBootProgressStore.getState().completeStage("native-api");
    useBootProgressStore.getState().startStage("server-welcome");
    useBootProgressStore.getState().completeStage("server-welcome");
    expect(useBootProgressStore.getState().isBootCompleted).toBe(false);
  });
});

describe("bootProgressStore - failStage", () => {
  it("in_progress → error 并写入 errorMessage / completedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(123_000);

    useBootProgressStore.getState().startStage("settings");
    vi.setSystemTime(456_000);
    useBootProgressStore.getState().failStage("settings", "load failed");

    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.status).toBe("error");
    expect(stage?.errorMessage).toBe("load failed");
    expect(stage?.completedAt).toBe(456_000);
  });

  it("failStage 同时把错误信息写入整体 bootError", () => {
    useBootProgressStore.getState().startStage("server-welcome");
    useBootProgressStore.getState().failStage("server-welcome", "ws closed");
    expect(useBootProgressStore.getState().bootError).toBe("ws closed");
  });

  it("多次 failStage 以最后一次错误为准", () => {
    useBootProgressStore.getState().startStage("settings");
    useBootProgressStore.getState().failStage("settings", "first");
    useBootProgressStore.getState().startStage("settings");
    useBootProgressStore.getState().failStage("settings", "second");
    expect(useBootProgressStore.getState().stages["settings"]?.errorMessage).toBe("second");
    expect(useBootProgressStore.getState().bootError).toBe("second");
  });
});

describe("bootProgressStore - resetStages", () => {
  it("重置后所有阶段回到 pending", () => {
    useBootProgressStore.getState().startStage("native-api");
    useBootProgressStore.getState().completeStage("native-api");
    useBootProgressStore.getState().failStage("settings", "x");

    useBootProgressStore.getState().resetStages();
    for (const id of BOOT_STAGE_IDS) {
      expect(useBootProgressStore.getState().stages[id]?.status).toBe("pending");
    }
  });

  it("重置后 isBootCompleted=false、bootError=null", () => {
    for (const id of BOOT_STAGE_IDS) {
      useBootProgressStore.getState().startStage(id);
      useBootProgressStore.getState().completeStage(id);
    }
    useBootProgressStore.getState().failStage("ui-ready", "x");

    useBootProgressStore.getState().resetStages();
    expect(useBootProgressStore.getState().isBootCompleted).toBe(false);
    expect(useBootProgressStore.getState().bootError).toBeNull();
  });

  it("可传入 label 覆盖默认 label", () => {
    useBootProgressStore.getState().resetStages({
      "native-api": "Booting native API",
      settings: "Loading prefs",
    });

    expect(useBootProgressStore.getState().stages["native-api"]?.label).toBe("Booting native API");
    expect(useBootProgressStore.getState().stages["settings"]?.label).toBe("Loading prefs");
    // 未指定的阶段沿用默认 label
    expect(useBootProgressStore.getState().stages["server-welcome"]?.label).toBe(
      DEFAULT_BOOT_STAGE_LABELS["server-welcome"],
    );
  });
});

describe("bootProgressStore - setBootError", () => {
  it("独立设置整体错误", () => {
    useBootProgressStore.getState().setBootError("global failure");
    expect(useBootProgressStore.getState().bootError).toBe("global failure");
  });

  it("setBootError(null) 清空错误", () => {
    useBootProgressStore.getState().setBootError("global failure");
    useBootProgressStore.getState().setBootError(null);
    expect(useBootProgressStore.getState().bootError).toBeNull();
  });
});

describe("bootProgressStore - computeBootProgress", () => {
  it("全 pending 时进度为 0", () => {
    expect(computeBootProgress(useBootProgressStore.getState().stages)).toBe(0);
  });

  it("全 done 时进度为 1", () => {
    for (const id of BOOT_STAGE_IDS) {
      useBootProgressStore.getState().startStage(id);
      useBootProgressStore.getState().completeStage(id);
    }
    expect(computeBootProgress(useBootProgressStore.getState().stages)).toBe(1);
  });

  it("in_progress 阶段不计入 done 进度", () => {
    useBootProgressStore.getState().startStage("native-api");
    useBootProgressStore.getState().completeStage("native-api");
    useBootProgressStore.getState().startStage("server-welcome");
    // server-welcome 此时是 in_progress

    const stages = useBootProgressStore.getState().stages;
    expect(computeBootProgress(stages)).toBeCloseTo(1 / BOOT_STAGE_IDS.length);
  });

  it("error 阶段不计入 done 进度", () => {
    useBootProgressStore.getState().startStage("native-api");
    useBootProgressStore.getState().completeStage("native-api");
    useBootProgressStore.getState().startStage("settings");
    useBootProgressStore.getState().failStage("settings", "x");

    const stages = useBootProgressStore.getState().stages;
    expect(computeBootProgress(stages)).toBeCloseTo(1 / BOOT_STAGE_IDS.length);
  });
});

describe("bootProgressStore - 非法 id 容错", () => {
  it("传入未知 id 时 setState 不抛错", () => {
    expect(() =>
      useBootProgressStore.getState().startStage("not-a-stage" as BootStageId),
    ).not.toThrow();
    expect(() =>
      useBootProgressStore.getState().completeStage("not-a-stage" as BootStageId),
    ).not.toThrow();
    expect(() =>
      useBootProgressStore.getState().failStage("not-a-stage" as BootStageId, "x"),
    ).not.toThrow();
  });

  it("非法 id 不影响其他阶段", () => {
    useBootProgressStore.getState().startStage("not-a-stage" as BootStageId);
    useBootProgressStore.getState().startStage("native-api");
    expect(useBootProgressStore.getState().stages["native-api"]?.status).toBe("in_progress");
  });
});

describe("bootProgressStore - __resetBootProgressStoreForTest", () => {
  it("重置后 store 状态完全回归初始", () => {
    useBootProgressStore.getState().startStage("native-api");
    useBootProgressStore.getState().completeStage("native-api");
    useBootProgressStore.getState().failStage("settings", "x");

    __resetBootProgressStoreForTest();
    const state = useBootProgressStore.getState();
    expect(state.isBootCompleted).toBe(false);
    expect(state.bootError).toBeNull();
    for (const id of BOOT_STAGE_IDS) {
      expect(state.stages[id]?.status).toBe("pending");
    }
  });
});

describe("bootProgressStore - 错误分类 errorType / fatal", () => {
  it("failStage 默认 errorType=unknown", () => {
    useBootProgressStore.getState().failStage("settings", "x");
    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.errorType).toBe("unknown");
    expect(stage?.fatal).toBe(false);
    expect(useBootProgressStore.getState().hasFatalError).toBe(false);
  });

  it("failStage 接受 errorType 参数", () => {
    useBootProgressStore.getState().failStage("settings", "x", "network");
    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.errorType).toBe("network");
    expect(stage?.fatal).toBe(false);
    expect(useBootProgressStore.getState().bootErrorType).toBe("network");
  });

  it.each(["config", "permission", "cancelled"] satisfies readonly BootStageErrorType[])(
    "failStage(%s) 标记 fatal=true, hasFatalError=true",
    (type: BootStageErrorType) => {
      useBootProgressStore.getState().failStage("settings", "x", type);
      const stage = useBootProgressStore.getState().stages["settings"];
      expect(stage?.fatal).toBe(true);
      expect(stage?.errorType).toBe(type);
      expect(useBootProgressStore.getState().hasFatalError).toBe(true);
    },
  );

  it.each(["network", "timeout", "internal", "unknown"] satisfies readonly BootStageErrorType[])(
    "failStage(%s) 标记 fatal=false",
    (type: BootStageErrorType) => {
      useBootProgressStore.getState().failStage("settings", "x", type);
      const stage = useBootProgressStore.getState().stages["settings"];
      expect(stage?.fatal).toBe(false);
      expect(useBootProgressStore.getState().hasFatalError).toBe(false);
    },
  );

  it("startStage 重置 errorType/fatal 字段", () => {
    useBootProgressStore.getState().failStage("settings", "x", "config");
    expect(useBootProgressStore.getState().stages["settings"]?.fatal).toBe(true);

    useBootProgressStore.getState().startStage("settings");
    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.errorType).toBeUndefined();
    expect(stage?.fatal).toBe(false);
    expect(stage?.errorMessage).toBeNull();
  });

  it("completeStage 重置 errorType/fatal 字段", () => {
    useBootProgressStore.getState().failStage("settings", "x", "config");
    useBootProgressStore.getState().completeStage("settings");
    const stage = useBootProgressStore.getState().stages["settings"];
    expect(stage?.errorType).toBeUndefined();
    expect(stage?.fatal).toBe(false);
    expect(stage?.errorMessage).toBeNull();
  });

  it("hasFatalError 在多个阶段中只要存在一个 fatal 阶段就为 true", () => {
    useBootProgressStore.getState().failStage("settings", "x", "network");
    expect(useBootProgressStore.getState().hasFatalError).toBe(false);
    useBootProgressStore.getState().failStage("server-welcome", "x", "permission");
    expect(useBootProgressStore.getState().hasFatalError).toBe(true);
  });
});

describe("bootProgressStore - clearFatalError", () => {
  it("没有 fatal 错误时是 noop", () => {
    const before = useBootProgressStore.getState();
    useBootProgressStore.getState().clearFatalError();
    const after = useBootProgressStore.getState();
    expect(after).toBe(before);
  });

  it("清除 fatal 错误后 hasFatalError=false", () => {
    useBootProgressStore.getState().failStage("settings", "x", "config");
    expect(useBootProgressStore.getState().hasFatalError).toBe(true);

    useBootProgressStore.getState().clearFatalError();
    expect(useBootProgressStore.getState().hasFatalError).toBe(false);
    expect(useBootProgressStore.getState().stages["settings"]?.fatal).toBe(false);
    // 阶段 status 仍为 error,errorMessage 保留
    expect(useBootProgressStore.getState().stages["settings"]?.status).toBe("error");
    expect(useBootProgressStore.getState().stages["settings"]?.errorMessage).toBe("x");
  });

  it("重试前调用 clearFatalError 不影响其他字段", () => {
    useBootProgressStore.getState().failStage("settings", "x", "config");
    useBootProgressStore.getState().clearFatalError();
    // 之后 startStage 会进入 in_progress
    useBootProgressStore.getState().startStage("settings");
    expect(useBootProgressStore.getState().stages["settings"]?.status).toBe("in_progress");
  });
});

describe("bootProgressStore - setBootError errorType", () => {
  it("setBootError(null) 重置 errorType 保留", () => {
    useBootProgressStore.getState().setBootError("x", "network");
    expect(useBootProgressStore.getState().bootErrorType).toBe("network");

    useBootProgressStore.getState().setBootError(null);
    // bootErrorType 保持上次的 type，不主动改
    expect(useBootProgressStore.getState().bootError).toBeNull();
  });

  it("setBootError 写 fatal 类型会让 hasFatalError=true", () => {
    useBootProgressStore.getState().setBootError("config broken", "config");
    expect(useBootProgressStore.getState().hasFatalError).toBe(true);
  });

  it("resetStages 也会清空 hasFatalError / bootErrorType", () => {
    useBootProgressStore.getState().setBootError("config broken", "config");
    useBootProgressStore.getState().resetStages();
    expect(useBootProgressStore.getState().hasFatalError).toBe(false);
    expect(useBootProgressStore.getState().bootErrorType).toBe("unknown");
  });
});

describe("bootProgressStore - 辅助函数", () => {
  it("FATAL_BOOT_STAGE_ERROR_TYPES 包含 config/permission/cancelled", () => {
    expect(FATAL_BOOT_STAGE_ERROR_TYPES.has("config")).toBe(true);
    expect(FATAL_BOOT_STAGE_ERROR_TYPES.has("permission")).toBe(true);
    expect(FATAL_BOOT_STAGE_ERROR_TYPES.has("cancelled")).toBe(true);
    expect(FATAL_BOOT_STAGE_ERROR_TYPES.has("network")).toBe(false);
    expect(FATAL_BOOT_STAGE_ERROR_TYPES.has("timeout")).toBe(false);
  });

  it("isFatalBootErrorType 与 FATAL_BOOT_STAGE_ERROR_TYPES 行为一致", () => {
    expect(isFatalBootErrorType("config")).toBe(true);
    expect(isFatalBootErrorType("network")).toBe(false);
    expect(isFatalBootErrorType("cancelled")).toBe(true);
  });

  it("inferBootStageErrorType 从 Error.name 识别 cancelled / timeout / permission", () => {
    expect(inferBootStageErrorType({ name: "AbortError", message: "" })).toBe("cancelled");
    expect(inferBootStageErrorType({ name: "TimeoutError", message: "" })).toBe("timeout");
    expect(inferBootStageErrorType({ name: "PermissionError", message: "" })).toBe("permission");
  });

  it("inferBootStageErrorType 从 message 关键词识别", () => {
    expect(inferBootStageErrorType(new Error("permission denied"))).toBe("permission");
    expect(inferBootStageErrorType(new Error("invalid config"))).toBe("config");
    expect(inferBootStageErrorType(new Error("connection timed out"))).toBe("timeout");
    expect(inferBootStageErrorType(new Error("network ECONNREFUSED"))).toBe("network");
    expect(inferBootStageErrorType(new Error("user cancelled"))).toBe("cancelled");
    expect(inferBootStageErrorType(new Error("random failure"))).toBe("unknown");
  });

  it("inferBootStageErrorType null/undefined 返回 unknown", () => {
    expect(inferBootStageErrorType(null)).toBe("unknown");
    expect(inferBootStageErrorType(undefined)).toBe("unknown");
  });
});
