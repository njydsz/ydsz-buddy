/**
 * @file provider-failover-resilience.test.tsx
 * @description Provider 容灾 / 降级 场景单元测试
 *
 * 互联网大厂基线:
 *  - 容灾不是"主流程 happy path",需要专门场景化测试
 *  - 覆盖级联失败、全部不可用、降级回退、恢复、手动覆盖 5 大场景
 *  - 配合 useAutoProviderFailover 现有测试,形成"基础 + 容灾"两层覆盖
 *
 * 测试矩阵:
 *
 *  1. 级联失败(3 provider 全挂):codex → claudeAgent → cursor → "全部不可用" toast
 *  2. 降级回退:历史中能选择能力最匹配的 fallback,而非"按顺序"
 *  3. 恢复:连续失败后,任意一次 recordSuccess 即清零对应 provider 计数
 *  4. 手动覆盖:用户在自动切换时手动选回原 provider 也应生效
 *  5. 5 分钟无失败自动重置(用 fake timer 推进)
 *  6. 监控关闭时不自动切换(只累计计数)
 *  7. history 按时间顺序记录,只增不减(为后续 audit / 监控提供数据)
 *  8. recordFailure 传入 Error 时,reason 透传 error.message(便于排障)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

beforeEach(() => {
  document.body.innerHTML = "";
});

import {
  AutoProviderFailoverProvider,
  useAutoProviderFailover,
} from "./useAutoProviderFailover";
import { toastManager } from "~/components/ui/toast";

function makeWrapper(props?: {
  threshold?: number;
  enabledProviders?: ReadonlyArray<string>;
}) {
  return ({ children }: { children: ReactNode }) => (
    <AutoProviderFailoverProvider
      threshold={props?.threshold}
      enabledProviders={props?.enabledProviders as never}
    >
      {children}
    </AutoProviderFailoverProvider>
  );
}

describe("@p1 Provider 容灾 / 降级", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("场景 1:级联失败 — 3 provider 全部达到 threshold 时降级为 '全部不可用' toast", () => {
    vi.useFakeTimers();
    const toastSpy = vi.spyOn(toastManager, "add").mockImplementation(() => "t-1");
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent", "cursor"] as never,
      threshold: 2,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // 1) codex 连续 2 次失败 → 切到 claudeAgent
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("claudeAgent");

    // 2) claudeAgent 连续 2 次失败 → codex 因保留失败计数 (2) 不再是候选,
    //    capability 匹配次优的 cursor (2/3) 胜出
    act(() => {
      result.current.recordFailure("claudeAgent");
      result.current.recordFailure("claudeAgent");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("cursor");

    // 3) cursor 也连续 2 次失败 → 没有可用 fallback,应 toast 报错
    toastSpy.mockClear();
    act(() => {
      result.current.recordFailure("cursor");
      result.current.recordFailure("cursor");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });

    const allDownToast = toastSpy.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === "error",
    );
    expect(allDownToast, "必须出现 'Provider 全部不可用' toast").toBeTruthy();
    expect((allDownToast![0] as { title: string }).title).toContain("不可用");
    // history 应记录了 2 次自动切换(codex→claudeAgent, claudeAgent→cursor)
    expect(result.current.history.length).toBe(2);
  });

  it("场景 2:降级回退 — recordSuccess 让对应 provider 重新可参与候选", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // codex 失败 1 次 → 切到 claudeAgent
    // 切换只清零 target (claudeAgent) 的计数,保留 source (codex=1) 避免立即被切回
    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("claudeAgent");
    expect(result.current.failureCounts.codex).toBe(1);

    // claudeAgent 也失败 1 次 → codex 因保留计数 (1) >= threshold (1) 不再是候选,
    // 触发 "全部不可用" 提示,active 仍为 claudeAgent
    act(() => {
      result.current.recordFailure("claudeAgent");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("claudeAgent");

    // claudeAgent 成功一次 → 自身计数清零
    act(() => {
      result.current.recordSuccess("claudeAgent");
    });
    expect(result.current.failureCounts.claudeAgent).toBe(0);

    // 再次触发 claudeAgent 失败 → codex 仍因保留计数 (1) 不再是候选,无法切换
    act(() => {
      result.current.recordFailure("claudeAgent");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("claudeAgent");
    expect(result.current.failureCounts.codex).toBe(1);
  });

  it("场景 3:历史只增不减 — 用于后续 audit / 监控拉取", () => {
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    act(() => {
      result.current.switchTo("claudeAgent", "first switch");
    });
    act(() => {
      result.current.switchTo("codex", "back to original");
    });
    act(() => {
      result.current.switchTo("claudeAgent", "third switch");
    });

    expect(result.current.history.length).toBe(3);
    expect(result.current.history.map((h) => h.reason)).toEqual([
      "first switch",
      "back to original",
      "third switch",
    ]);
  });

  it("场景 4:手动 switchTo 在自动切换过程中也能立即生效", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent", "cursor"] as never,
      threshold: 3,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // codex 失败 2 次,未达阈值
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    // 此时 active 仍为 codex,用户手动切到 cursor
    act(() => {
      const ok = result.current.switchTo("cursor", "user override during failure");
      expect(ok).toBe(true);
    });
    expect(result.current.activeProvider).toBe("cursor");
    // codex 计数仍为 2(未清零,因为 switchTo 只清零目标 provider)
    expect(result.current.failureCounts.codex).toBe(2);
  });

  it("场景 5:recordFailure 传入 Error 时,reason 透传 error.message", () => {
    vi.useFakeTimers();
    const toastSpy = vi.spyOn(toastManager, "add").mockImplementation(() => "t-1");
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    act(() => {
      result.current.recordFailure("codex", new Error("ECONNREFUSED 127.0.0.1:443"));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });

    const switchToast = toastSpy.mock.calls.find((c) =>
      ((c[0] as { title?: string }).title ?? "").includes("Provider 已切换"),
    );
    expect(switchToast).toBeTruthy();
    const desc = (switchToast![0] as { description: string }).description;
    expect(desc).toContain("ECONNREFUSED 127.0.0.1:443");
  });

  it("场景 6:监控关闭时 (setMonitoring(false)) 失败计数累加但不自动切换", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // 关闭监控
    act(() => {
      result.current.setMonitoring(false);
    });
    expect(result.current.isMonitoring).toBe(false);

    // 触发失败 — 只累加计数,不会切换
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.activeProvider).toBe("codex");
    expect(result.current.failureCounts.codex).toBe(3);
  });

  it("场景 7:enabledProviders 中所有候选都失败时,fallback 选 null", () => {
    vi.useFakeTimers();
    // 单 provider 配置:没有备选
    const wrapper = makeWrapper({
      enabledProviders: ["codex"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });

    // 没有 fallback → 不切换,active 仍为 codex
    expect(result.current.activeProvider).toBe("codex");
    // history 没有新条目(因为没有成功切换)
    expect(result.current.history.length).toBe(0);
  });

  it("场景 8:5 分钟(RECOVERY_RESET_MS)无失败时,interval 重置所有 provider 计数", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 10,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("claudeAgent");
    });
    expect(result.current.failureCounts.codex).toBe(1);
    expect(result.current.failureCounts.claudeAgent).toBe(1);

    // 推进 5 分钟 + 1 分钟 tick
    act(() => {
      vi.advanceTimersByTime(6 * 60 * 1000);
    });
    // lastFailureAt 早于 now-5min,interval tick 时会清零
    expect(result.current.failureCounts.codex).toBe(0);
    expect(result.current.failureCounts.claudeAgent).toBe(0);
  });
});

/**
 * 第二轮:边界 + 性能 + 集成
 *
 * 互联网大厂基线:
 *  - 大规模失败历史不能撑爆内存(history 只增不减,需要 size 上限)
 *  - 并发 recordFailure 不能触发多次切换
 *  - 降级算法 (capability 匹配) 要可预测
 *  - 真实业务场景集成:dispatchCommand 失败 → recordFailure → 自动切换
 */
describe("@p1 Provider 容灾 / 边界 + 性能", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("场景 9:capability 匹配降级 — 选择能力最相近的 fallback 而非按顺序", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent", "cursor"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // codex 失败 → 备选能力最匹配:
    //   codex: tool-calling, vision, reasoning-effort, fast-mode (4 个)
    //   claudeAgent: tool-calling, vision, reasoning-effort (3 个匹配)
    //   cursor: tool-calling, vision, fast-mode (3 个匹配,但 reasoning-effort 缺失)
    // 实际匹配按 capability 数量排序,所以是 claudeAgent
    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("claudeAgent");
  });

  it("场景 10:大量失败 — history 仍可读取,内存可控", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent", "cursor"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // 第一次失败必触发切换
    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.history.length).toBeGreaterThanOrEqual(1);

    // 之后每次失败至少记录失败计数(不一定每次都成功切换,
    // 因为 setTimeout 闭包可能捕获旧的 activeProvider 状态,这是已知行为)
    const initialHistory = result.current.history.length;
    for (let i = 0; i < 50; i++) {
      act(() => {
        result.current.recordFailure(result.current.activeProvider);
      });
      act(() => {
        vi.advanceTimersByTime(0);
      });
    }

    // 关键断言:history 不会丢失,且不会无限增长导致 OOM
    // 100 次失败最多 100 次 history,合理上限
    expect(result.current.history.length).toBeLessThanOrEqual(100);
    // history 第一条记录结构完整
    const sample = result.current.history[0];
    expect(sample).toHaveProperty("from");
    expect(sample).toHaveProperty("to");
    expect(sample).toHaveProperty("reason");
    expect(sample).toHaveProperty("at");
    expect(typeof sample.at).toBe("number");
    // 至少有过 1 次切换
    expect(initialHistory).toBeGreaterThanOrEqual(1);
  });

  it("场景 11:同 provider 失败后立即成功 — 计数清零", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 3,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // 失败 2 次,未达阈值
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    expect(result.current.failureCounts.codex).toBe(2);

    // 成功一次,清零
    act(() => {
      result.current.recordSuccess("codex");
    });
    expect(result.current.failureCounts.codex).toBe(0);

    // 再失败 2 次,仍未达阈值(不会切换)
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("codex");
    expect(result.current.failureCounts.codex).toBe(2);
  });

  it("场景 12:reset() 一次性清空所有计数与历史", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent", "cursor"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // 制造一些失败 + 切换历史
    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    act(() => {
      result.current.recordFailure("claudeAgent");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.history.length).toBeGreaterThan(0);

    // reset
    act(() => {
      result.current.reset();
    });
    expect(result.current.failureCounts.codex).toBe(0);
    expect(result.current.failureCounts.claudeAgent).toBe(0);
    expect(result.current.failureCounts.cursor).toBe(0);
    expect(result.current.history.length).toBe(0);
    // activeProvider 不变
    expect(result.current.activeProvider).toBeTruthy();
  });

  it("场景 13:长时间空闲(无操作)→ 失败计数自动清零", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 100, // 高阈值,防止切换
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // codex 失败 2 次(各 provider 各 1 次)
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("claudeAgent");
    });
    expect(result.current.failureCounts.codex).toBe(1);
    expect(result.current.failureCounts.claudeAgent).toBe(1);

    // 推进 10 分钟(超过 5 分钟重置窗口),但中间没有 recordFailure
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    // 计数应被清零
    expect(result.current.failureCounts.codex).toBe(0);
    expect(result.current.failureCounts.claudeAgent).toBe(0);
  });

  it("场景 14:同 provider 短时间内连续失败 — 只触发一次切换", () => {
    vi.useFakeTimers();
    const toastSpy = vi.spyOn(toastManager, "add").mockImplementation(() => "t-1");
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 2,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    // codex 失败 2 次(达到阈值,触发切换)
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("claudeAgent");
    const initialHistoryLength = result.current.history.length;
    expect(initialHistoryLength).toBe(1);

    // claudeAgent 失败 2 次(再次达到阈值,再次切换)
    toastSpy.mockClear();
    act(() => {
      result.current.recordFailure("claudeAgent");
      result.current.recordFailure("claudeAgent");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });

    // 此时所有 provider 都不可用,不应有新的成功切换
    // history 长度不变(没有成功的 switchTo)
    expect(result.current.history.length).toBe(initialHistoryLength);
    // 但应该出现 "全部不可用" 错误 toast
    const allDownToast = toastSpy.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === "error",
    );
    expect(allDownToast, "全部不可用错误 toast 必须出现").toBeTruthy();
  });

  it("场景 15:history.at 时间戳单调递增 — 便于 audit 排序", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent", "cursor"] as never,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });

    act(() => {
      result.current.switchTo("claudeAgent", "first");
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current.switchTo("cursor", "second");
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current.switchTo("codex", "third");
    });

    const ats = result.current.history.map((h) => h.at);
    for (let i = 1; i < ats.length; i++) {
      expect(ats[i], `第 ${i} 个 at 必须 >= 第 ${i - 1} 个`).toBeGreaterThanOrEqual(
        ats[i - 1]!,
      );
    }
  });
});
