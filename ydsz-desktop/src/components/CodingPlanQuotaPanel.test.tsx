/**
 * @file CodingPlanQuotaPanel 组件单元测试
 *
 * 覆盖目标：
 * - 默认 4 家 Provider（glm / deepseek / moonshot / qwen）渲染
 * - 未绑定状态显示 "未绑定" 徽标
 * - 已绑定 + 有剩余百分比时显示进度条
 * - remainingPercent=null 时显示 "未返回额度" 徽标
 * - fetching=true 时显示 "正在获取额度" 徽标
 * - errorMessage 非空时显示错误徽标
 * - resetsAt 格式化（24h 内显示 HH:mm）
 * - 进度条颜色根据 remainingPercent 切换
 * - 点击 "open usage console" 触发 window.open
 * - 点击 "bind" 触发 onBind
 * - 点击 "refresh" 触发 onRefresh
 * - showHeader=false 时不显示整段标题
 * - snapshots 为空时仍渲染 4 个空快照
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { I18nProvider } from "~/i18n";
import {
  CodingPlanQuotaPanel,
  type CodingPlanProviderId,
  type CodingPlanQuotaSnapshot,
} from "./CodingPlanQuotaPanel";

function makeSnapshot(
  provider: CodingPlanProviderId,
  overrides: Partial<CodingPlanQuotaSnapshot> = {},
): CodingPlanQuotaSnapshot {
  return {
    provider,
    bound: false,
    fetching: false,
    remainingPercent: null,
    resetsAt: null,
    errorMessage: null,
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * 用 4 家全占位 Provider 填充 snapshots，避免「找到多个元素」类断言失败。
 */
function fillAll(target: Partial<Record<CodingPlanProviderId, CodingPlanQuotaSnapshot>>): CodingPlanQuotaSnapshot[] {
  const ids: CodingPlanProviderId[] = ["glm", "deepseek", "moonshot", "qwen"];
  return ids.map((id) => target[id] ?? makeSnapshot(id));
}

function wrap(ui: React.ReactNode) {
  return <I18nProvider>{ui}</I18nProvider>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CodingPlanQuotaPanel", () => {
  beforeEach(() => {
    // happy-dom 下 window.open 是 noop
    if (typeof window !== "undefined") {
      vi.spyOn(window, "open").mockImplementation(() => null);
    }
  });

  it("默认渲染 4 家 Provider 卡片", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={[
            makeSnapshot("glm", { bound: true, remainingPercent: 60 }),
            makeSnapshot("deepseek", { bound: true, remainingPercent: 30 }),
            makeSnapshot("moonshot"),
            makeSnapshot("qwen", { bound: true, remainingPercent: 10 }),
          ]}
        />,
      ),
    );
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    expect(cards.length).toBe(4);
    expect(cards[0]?.getAttribute("data-provider")).toBe("glm");
    expect(cards[1]?.getAttribute("data-provider")).toBe("deepseek");
    expect(cards[2]?.getAttribute("data-provider")).toBe("moonshot");
    expect(cards[3]?.getAttribute("data-provider")).toBe("qwen");
  });

  it("空 snapshots 时仍渲染 4 个空快照", () => {
    render(wrap(<CodingPlanQuotaPanel snapshots={[]} />));
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    expect(cards.length).toBe(4);
    for (const card of cards) {
      expect(card.getAttribute("data-bound")).toBe("false");
    }
  });

  it("未绑定时显示「未绑定」徽标，不显示进度条", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({ glm: makeSnapshot("glm", { bound: false }) })}
        />,
      ),
    );
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    const glmCard = cards.find((c) => c.getAttribute("data-provider") === "glm")!;
    expect(within(glmCard).getByTestId("coding-plan-status-not-bound")).toBeDefined();
    expect(within(glmCard).queryByTestId("coding-plan-progress")).toBeNull();
  });

  it("已绑定 + 有 remainingPercent 时显示进度条", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            glm: makeSnapshot("glm", { bound: true, remainingPercent: 65 }),
          })}
        />,
      ),
    );
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    const glmCard = cards.find((c) => c.getAttribute("data-provider") === "glm")!;
    expect(within(glmCard).getByTestId("coding-plan-status-bound")).toBeDefined();
    const progress = within(glmCard).getByTestId("coding-plan-progress");
    expect(progress.getAttribute("aria-valuenow")).toBe("65");
    // 剩余文本
    expect(within(glmCard).getByTestId("coding-plan-quota-remaining").textContent).toContain(
      "65",
    );
  });

  it("remainingPercent=null 时显示「未返回额度」徽标", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            deepseek: makeSnapshot("deepseek", { bound: true, remainingPercent: null }),
          })}
        />,
      ),
    );
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    const dsCard = cards.find((c) => c.getAttribute("data-provider") === "deepseek")!;
    expect(within(dsCard).getByTestId("coding-plan-status-quota-unknown")).toBeDefined();
    expect(within(dsCard).getByTestId("coding-plan-quota-remaining").textContent).toContain(
      "Unlimited",
    );
  });

  it("fetching=true 时显示「正在获取额度」徽标", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            moonshot: makeSnapshot("moonshot", { bound: true, fetching: true, remainingPercent: 50 }),
          })}
        />,
      ),
    );
    expect(screen.getByTestId("coding-plan-status-fetching")).toBeDefined();
  });

  it("errorMessage 非空时显示错误徽标", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            qwen: makeSnapshot("qwen", { errorMessage: "Network down", bound: false }),
          })}
        />,
      ),
    );
    expect(screen.getByTestId("coding-plan-status-error")).toBeDefined();
    expect(screen.getByTestId("coding-plan-quota-error").textContent).toContain(
      "Network down",
    );
  });

  it("resetsAt 在 24h 内显示 HH:mm 格式", () => {
    const futureIso = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            glm: makeSnapshot("glm", { bound: true, remainingPercent: 80, resetsAt: futureIso }),
          })}
        />,
      ),
    );
    expect(screen.getByTestId("coding-plan-quota-resets")).toBeDefined();
  });

  it("点击 open usage console 触发 window.open", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            glm: makeSnapshot("glm", { bound: true, remainingPercent: 50 }),
          })}
        />,
      ),
    );
    const btn = screen.getByTestId("coding-plan-open-console");
    fireEvent.click(btn);
    expect(window.open).toHaveBeenCalled();
    const callArgs = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs?.[0]).toContain("bigmodel.cn");
  });

  it("点击 bind 按钮触发 onBind 并传入 provider id", () => {
    const onBind = vi.fn();
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({ deepseek: makeSnapshot("deepseek", { bound: false }) })}
          onBind={onBind}
        />,
      ),
    );
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    const dsCard = cards.find((c) => c.getAttribute("data-provider") === "deepseek")!;
    const btn = within(dsCard).getByTestId("coding-plan-bind");
    fireEvent.click(btn);
    expect(onBind).toHaveBeenCalledWith("deepseek");
  });

  it("点击 refresh 按钮触发 onRefresh 并传入 provider id", () => {
    const onRefresh = vi.fn();
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            qwen: makeSnapshot("qwen", { bound: true, remainingPercent: 50 }),
          })}
          onRefresh={onRefresh}
        />,
      ),
    );
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    const qwenCard = cards.find((c) => c.getAttribute("data-provider") === "qwen")!;
    const btn = within(qwenCard).getByTestId("coding-plan-refresh");
    fireEvent.click(btn);
    expect(onRefresh).toHaveBeenCalledWith("qwen");
  });

  it("fetching=true 时 refresh 按钮被禁用", () => {
    render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={fillAll({
            glm: makeSnapshot("glm", { bound: true, remainingPercent: 50, fetching: true }),
          })}
          onRefresh={vi.fn()}
        />,
      ),
    );
    const cards = screen.getAllByTestId("coding-plan-quota-card");
    const glmCard = cards.find((c) => c.getAttribute("data-provider") === "glm")!;
    const btn = within(glmCard).getByTestId("coding-plan-refresh") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("showHeader=false 时不显示整段标题", () => {
    render(
      wrap(<CodingPlanQuotaPanel snapshots={[]} showHeader={false} />),
    );
    expect(screen.queryByTestId("coding-plan-section-title")).toBeNull();
  });

  it("showHeader=true 时显示整段标题和描述", () => {
    render(
      wrap(<CodingPlanQuotaPanel snapshots={[]} showHeader={true} />),
    );
    expect(screen.getByTestId("coding-plan-section-title")).toBeDefined();
    expect(screen.getByTestId("coding-plan-section-description")).toBeDefined();
  });

  it("进度条颜色根据 remainingPercent 切换（高分位 → destructive）", () => {
    const { container } = render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={[
            makeSnapshot("glm", { bound: true, remainingPercent: 10 }),
          ]}
        />,
      ),
    );
    // remainingPercent 10 < 50, tone=success
    const progress = container.querySelector('[data-testid="coding-plan-progress"] > div');
    expect(progress?.className).toContain("bg-(--color-success)");
  });

  it("进度条颜色根据 remainingPercent 切换（中等 → warning）", () => {
    const { container } = render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={[
            makeSnapshot("glm", { bound: true, remainingPercent: 70 }),
          ]}
        />,
      ),
    );
    const progress = container.querySelector('[data-testid="coding-plan-progress"] > div');
    expect(progress?.className).toContain("bg-(--color-warning)");
  });

  it("进度条颜色根据 remainingPercent 切换（高分位 → destructive）", () => {
    const { container } = render(
      wrap(
        <CodingPlanQuotaPanel
          snapshots={[
            makeSnapshot("glm", { bound: true, remainingPercent: 95 }),
          ]}
        />,
      ),
    );
    const progress = container.querySelector('[data-testid="coding-plan-progress"] > div');
    expect(progress?.className).toContain("bg-(--color-destructive)");
  });
});
