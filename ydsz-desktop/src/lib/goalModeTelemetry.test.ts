/**
 * @file goalModeTelemetry 单元测试
 * @description P2-6 24h 长跑准备 - 验证 Goal Mode 性能埋点器正确采集关键指标
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metricsCollector } from "./performanceMetrics";
import {
  GoalModeTelemetry,
  goalModeTelemetry,
  GOAL_METRIC_NAMES,
  measureGoalApi,
  recordGoalLifecycle,
} from "./goalModeTelemetry";

/** 帮助函数:在测试之间清理 metricsCollector */
function clearCollector(): void {
  metricsCollector.clear();
}

beforeEach(() => {
  clearCollector();
  goalModeTelemetry.resetSession();
});

afterEach(() => {
  clearCollector();
  goalModeTelemetry.resetSession();
});

describe("GOAL_METRIC_NAMES - 指标名称常量", () => {
  it("包含所有关键操作", () => {
    expect(GOAL_METRIC_NAMES.listActive).toBe("goal.listActive");
    expect(GOAL_METRIC_NAMES.start).toBe("goal.start");
    expect(GOAL_METRIC_NAMES.abort).toBe("goal.abort");
  });
});

describe("GoalModeTelemetry - session 指标", () => {
  it("初始 session 全部为 0", () => {
    const t = new GoalModeTelemetry();
    const m = t.getSessionMetrics();
    expect(m.startCount).toBe(0);
    expect(m.startSuccess).toBe(0);
    expect(m.startFailure).toBe(0);
    expect(m.abortCount).toBe(0);
    expect(m.listCount).toBe(0);
    expect(m.listFailure).toBe(0);
    expect(m.consecutiveListFailures).toBe(0);
    expect(m.activeRunning).toBe(0);
    expect(m.activeAchieved).toBe(0);
    expect(m.activeAborted).toBe(0);
  });

  it("resetSession 后归零", () => {
    const t = new GoalModeTelemetry();
    void t.measure("start", async () => "g1");
    // 这里不 await,只是验证 reset 不报错
    t.resetSession();
    const m = t.getSessionMetrics();
    expect(m.startCount).toBe(0);
  });
});

describe("GoalModeTelemetry - measure 包裹", () => {
  it("成功调用 listActive → listCount++", async () => {
    const t = new GoalModeTelemetry();
    await t.measure("listActive", async () => [{ goal_id: "g1" }]);
    const m = t.getSessionMetrics();
    expect(m.listCount).toBe(1);
    expect(m.listFailure).toBe(0);
  });

  it("listActive 失败 → listFailure++ 且 consecutiveListFailures++", async () => {
    const t = new GoalModeTelemetry();
    await expect(
      t.measure("listActive", async () => {
        throw new Error("net");
      }),
    ).rejects.toThrow("net");
    const m = t.getSessionMetrics();
    expect(m.listCount).toBe(1);
    expect(m.listFailure).toBe(1);
    expect(m.consecutiveListFailures).toBe(1);
  });

  it("listActive 成功 → consecutiveListFailures 归零", async () => {
    const t = new GoalModeTelemetry();
    await expect(
      t.measure("listActive", async () => {
        throw new Error("e1");
      }),
    ).rejects.toThrow();
    await t.measure("listActive", async () => []);
    const m = t.getSessionMetrics();
    expect(m.consecutiveListFailures).toBe(0);
  });

  it("start 成功 → startSuccess++", async () => {
    const t = new GoalModeTelemetry();
    const goalId = await t.measure("start", async () => "goal-xyz");
    expect(goalId).toBe("goal-xyz");
    const m = t.getSessionMetrics();
    expect(m.startCount).toBe(1);
    expect(m.startSuccess).toBe(1);
  });

  it("start 失败 → startFailure++ 且抛出原错误", async () => {
    const t = new GoalModeTelemetry();
    await expect(
      t.measure("start", async () => {
        throw new Error("rpc fail");
      }),
    ).rejects.toThrow("rpc fail");
    const m = t.getSessionMetrics();
    expect(m.startFailure).toBe(1);
  });

  it("abort 成功 / 失败计数", async () => {
    const t = new GoalModeTelemetry();
    await t.measure("abort", async () => undefined);
    await expect(
      t.measure("abort", async () => {
        throw new Error("abort fail");
      }),
    ).rejects.toThrow();
    const m = t.getSessionMetrics();
    expect(m.abortCount).toBe(2);
    expect(m.abortSuccess).toBe(1);
    expect(m.abortFailure).toBe(1);
  });

  it("成功时写入 metricsCollector 的 success=true 记录", async () => {
    const t = new GoalModeTelemetry();
    await t.measure("listActive", async () => []);
    const all = metricsCollector.getAllMetrics();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe("goal.listActive");
    expect(all[0].success).toBe(true);
  });

  it("失败时写入 metricsCollector 的 success=false + error 记录", async () => {
    const t = new GoalModeTelemetry();
    await expect(
      t.measure("listActive", async () => {
        throw new Error("oops");
      }),
    ).rejects.toThrow();
    const all = metricsCollector.getAllMetrics();
    expect(all.length).toBe(1);
    expect(all[0].success).toBe(false);
    expect(all[0].error).toBe("oops");
  });
});

describe("GoalModeTelemetry - updateActiveCounts", () => {
  it("正确更新 running/achieved/aborted 计数", () => {
    const t = new GoalModeTelemetry();
    t.updateActiveCounts({ running: 3, achieved: 1, aborted: 2 });
    const m = t.getSessionMetrics();
    expect(m.activeRunning).toBe(3);
    expect(m.activeAchieved).toBe(1);
    expect(m.activeAborted).toBe(2);
  });

  it("更新会刷新 lastUpdate", async () => {
    const t = new GoalModeTelemetry();
    const before = t.getSessionMetrics().lastUpdate;
    await new Promise((r) => setTimeout(r, 5));
    t.updateActiveCounts({ running: 0, achieved: 0, aborted: 0 });
    const after = t.getSessionMetrics().lastUpdate;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe("GoalModeTelemetry - 降级信号", () => {
  it("连续 listActive 失败 ≥ 阈值时触发 degradation 回调", async () => {
    const t = new GoalModeTelemetry({ consecutiveFailureThreshold: 3 });
    const handler = vi.fn();
    t.onDegradation(handler);

    for (let i = 0; i < 3; i++) {
      await expect(
        t.measure("listActive", async () => {
          throw new Error("e");
        }),
      ).rejects.toThrow();
    }
    expect(handler).toHaveBeenCalledTimes(1);
    const info = handler.mock.calls[0][0];
    expect(info.reason).toBe("consecutive-failures");
    expect(info.message).toContain("3");
  });

  it("成功 listActive 重置连续失败计数,不再触发", async () => {
    const t = new GoalModeTelemetry({ consecutiveFailureThreshold: 2 });
    const handler = vi.fn();
    t.onDegradation(handler);

    // 2 次失败
    for (let i = 0; i < 2; i++) {
      await expect(
        t.measure("listActive", async () => {
          throw new Error("e");
        }),
      ).rejects.toThrow();
    }
    expect(handler).toHaveBeenCalledTimes(1);
    // 1 次成功
    await t.measure("listActive", async () => []);
    // 再 1 次失败(不达阈值)
    await expect(
      t.measure("listActive", async () => {
        throw new Error("e");
      }),
    ).rejects.toThrow();
    // 没有再次触发
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe 后不再接收回调", async () => {
    const t = new GoalModeTelemetry({ consecutiveFailureThreshold: 1 });
    const handler = vi.fn();
    const unsubscribe = t.onDegradation(handler);
    unsubscribe();
    await expect(
      t.measure("listActive", async () => {
        throw new Error("e");
      }),
    ).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("回调抛错不影响主流程", async () => {
    const t = new GoalModeTelemetry({ consecutiveFailureThreshold: 1 });
    t.onDegradation(() => {
      throw new Error("handler crash");
    });
    await expect(
      t.measure("listActive", async () => {
        throw new Error("data fail");
      }),
    ).rejects.toThrow("data fail");
  });
});

describe("GoalModeTelemetry - recordListFailure / recordListSuccess", () => {
  it("recordListFailure 累加连续失败计数,达到阈值触发降级", () => {
    const t = new GoalModeTelemetry({ consecutiveFailureThreshold: 2 });
    const handler = vi.fn();
    t.onDegradation(handler);
    t.recordListFailure("net1");
    t.recordListFailure("net2");
    expect(handler).toHaveBeenCalledTimes(1);
    // 连续失败计数不会因为触发降级而重置(用于持续追踪)
    expect(t.getSessionMetrics().consecutiveListFailures).toBe(2);
    expect(t.getSessionMetrics().listFailure).toBe(2);
  });

  it("recordListSuccess 归零连续失败", () => {
    const t = new GoalModeTelemetry();
    t.recordListFailure("e");
    t.recordListFailure("e");
    expect(t.getSessionMetrics().consecutiveListFailures).toBe(2);
    t.recordListSuccess();
    expect(t.getSessionMetrics().consecutiveListFailures).toBe(0);
  });
});

describe("GoalModeTelemetry - exportSessionReport", () => {
  it("导出合法 JSON,包含 session 快照", async () => {
    const t = new GoalModeTelemetry();
    await t.measure("listActive", async () => []);
    const report = t.exportSessionReport();
    const parsed = JSON.parse(report);
    expect(parsed.session).toBeDefined();
    expect(parsed.session.listCount).toBe(1);
    expect(parsed.generatedAt).toBeGreaterThan(0);
    expect(parsed.duration).toBeGreaterThanOrEqual(0);
  });
});

describe("measureGoalApi - 便捷方法(全局单例)", () => {
  it("复用全局单例的会话计数", async () => {
    goalModeTelemetry.resetSession();
    await measureGoalApi("start", async () => "g-global");
    const m = goalModeTelemetry.getSessionMetrics();
    expect(m.startCount).toBe(1);
  });

  it("错误时抛出", async () => {
    await expect(
      measureGoalApi("start", async () => {
        throw new Error("global fail");
      }),
    ).rejects.toThrow("global fail");
  });
});

describe("recordGoalLifecycle - 独立生命周期记录", () => {
  it("写入 tauri_command 类型的指标,名称带 lifecycle 前缀", () => {
    recordGoalLifecycle({
      event: "start",
      goalId: "g-lifecycle-1",
      success: true,
      durationMs: 12,
    });
    const all = metricsCollector.getAllMetrics();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe("goal.lifecycle.start");
    expect(all[0].success).toBe(true);
    expect(all[0].duration).toBe(12);
    expect(all[0].metadata).toEqual({ goalId: "g-lifecycle-1", event: "start" });
  });

  it("失败时记录 error 字段", () => {
    recordGoalLifecycle({
      event: "abort",
      goalId: "g-fail",
      success: false,
      error: "aborted by user",
    });
    const all = metricsCollector.getAllMetrics();
    expect(all[0].success).toBe(false);
    expect(all[0].error).toBe("aborted by user");
  });
});
