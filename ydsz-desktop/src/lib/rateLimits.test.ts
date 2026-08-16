/**
 * @file rateLimits 单元测试
 *
 * 覆盖 Provider 速率限制解析、归一化、合并、格式化核心逻辑。
 *
 * 关键覆盖:
 *
 * 1. normalizeRateLimitLabel - 标签归一化
 * 2. deriveAccountRateLimits - 从线程活动推导账户速率限制(支持 4 种 payload 格式)
 * 3. deriveVisibleRateLimitRows - 推导可见速率限制行
 * 4. formatRateLimitRemainingPercent - 剩余百分比格式化
 * 5. formatRateLimitResetTime - 重置时间格式化
 * 6. deriveProviderUsageLearnMoreHref / deriveRateLimitLearnMoreHref - 链接推导
 * 7. mergeProviderRateLimits - 多 Provider 速率限制合并
 *
 * ## 数据构造策略
 *
 * 速率限制模块对 OrchestrationThread 仅有 `activities` 字段的访问,
 * 所以测试用 Pick<OrchestrationThread, "activities"> 即可,无需
 * 构造完整 Thread 对象。
 */

import { describe, expect, it } from "vitest";

import type { OrchestrationThread } from "@ydsz-buddy/contracts";
import {
  deriveAccountRateLimits,
  deriveProviderUsageLearnMoreHref,
  deriveRateLimitLearnMoreHref,
  deriveVisibleRateLimitRows,
  formatRateLimitRemainingPercent,
  formatRateLimitResetTime,
  mergeProviderRateLimits,
  normalizeRateLimitLabel,
  type ProviderRateLimit,
} from "./rateLimits";

/**
 * 构造一个最小可用的线程活动,只关心 rateLimits 模块会读到的字段。
 */
function makeActivity(options: {
  kind: "account.rate-limits.updated" | "account.rate-limited" | string;
  createdAt: string;
  payload: unknown;
}): OrchestrationThread["activities"][number] {
  return {
    id: `activity-${options.kind}-${options.createdAt}` as never,
    tone: "info",
    kind: options.kind,
    summary: "",
    payload: options.payload,
    turnId: null,
    createdAt: options.createdAt,
  };
}

describe("rateLimits", () => {
  describe("normalizeRateLimitLabel", () => {
    it("未传 label 时按 windowDurationMins 推断", () => {
      expect(normalizeRateLimitLabel(undefined, 300)).toBe("5h");
      expect(normalizeRateLimitLabel(undefined, 10_080)).toBe("Weekly");
    });

    it("windowDurationMins 优先于 label", () => {
      expect(normalizeRateLimitLabel("random", 300)).toBe("5h");
      expect(normalizeRateLimitLabel("random", 10_080)).toBe("Weekly");
    });

    it("识别 5h 变体", () => {
      expect(normalizeRateLimitLabel("5h")).toBe("5h");
      expect(normalizeRateLimitLabel("session")).toBe("5h");
      expect(normalizeRateLimitLabel("SESSion")).toBe("5h");
      expect(normalizeRateLimitLabel("five_hour")).toBe("5h");
      expect(normalizeRateLimitLabel("five hour")).toBe("5h");
      expect(normalizeRateLimitLabel("five-hour")).toBe("5h");
    });

    it("识别 Weekly 变体", () => {
      expect(normalizeRateLimitLabel("weekly")).toBe("Weekly");
      expect(normalizeRateLimitLabel("seven_day")).toBe("Weekly");
      expect(normalizeRateLimitLabel("7d")).toBe("Weekly");
    });

    it("识别 Sonnet 变体", () => {
      expect(normalizeRateLimitLabel("sonnet")).toBe("Sonnet");
      expect(normalizeRateLimitLabel("weekly_sonnet")).toBe("Sonnet");
      expect(normalizeRateLimitLabel("seven_day_sonnet")).toBe("Sonnet");
    });

    it("未 trim 的未知 label 直接返回原值", () => {
      // 实现对未知 label 不 trim(只 trim 后做归一化匹配,未匹配则原样返回)
      expect(normalizeRateLimitLabel("Custom Window")).toBe("Custom Window");
      expect(normalizeRateLimitLabel("  Custom  ")).toBe("  Custom  ");
    });
  });

  describe("formatRateLimitRemainingPercent", () => {
    it("undefined 返回破折号", () => {
      expect(formatRateLimitRemainingPercent(undefined)).toBe("—");
    });

    it("正常百分比四舍五入", () => {
      expect(formatRateLimitRemainingPercent(75.4)).toBe("75%");
      expect(formatRateLimitRemainingPercent(75.6)).toBe("76%");
    });

    it("越界值被裁剪到 0-100", () => {
      expect(formatRateLimitRemainingPercent(150)).toBe("100%");
      expect(formatRateLimitRemainingPercent(-10)).toBe("0%");
    });
  });

  describe("formatRateLimitResetTime", () => {
    it("非法 ISO 返回空字符串", () => {
      expect(formatRateLimitResetTime("not-a-date")).toBe("");
    });

    it("24h 内的重置时间显示为 时:分", () => {
      // 1 小时后
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const formatted = formatRateLimitResetTime(future);
      // 格式:HH:MM(可能包含 AM/PM 取决于 locale)
      expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    });

    it("超过 24h 的重置时间显示为 月 日", () => {
      // 48 小时后
      const future = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const formatted = formatRateLimitResetTime(future.toISOString());
      // 至少包含一个数字(月+日)
      expect(formatted).toMatch(/\d+/);
    });
  });

  describe("deriveAccountRateLimits", () => {
    it("空线程列表返回空数组", () => {
      expect(deriveAccountRateLimits([])).toEqual([]);
    });

    it("非速率限制活动被忽略", () => {
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "thread.message.added",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: { provider: "codex", usedPercent: 50 },
            }),
          ],
        },
      ];
      expect(deriveAccountRateLimits(threads)).toEqual([]);
    });

    it("非对象 payload 被忽略", () => {
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: "raw string",
            }),
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:01.000Z",
              payload: null,
            }),
          ],
        },
      ];
      expect(deriveAccountRateLimits(threads)).toEqual([]);
    });

    it("解析 rateLimitsByLimitId 格式 (Codex 风格)", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                rateLimitsByLimitId: {
                  session: { label: "5h", primary: { usedPercent: 30, resetsAt: future } },
                  weekly: { label: "Weekly", primary: { usedPercent: 10, resetsAt: future } },
                },
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("codex");
      expect(result[0].limits).toHaveLength(2);
      // 排序: 5h 在前
      expect(result[0].limits![0].window).toBe("5h");
      expect(result[0].limits![0].usedPercent).toBe(30);
      expect(result[0].limits![1].window).toBe("Weekly");
    });

    it("解析 limits[] 数组格式", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                limits: [
                  { window: "5h", usedPercent: 50, resetsAt: future },
                  { window: "Weekly", usedPercent: 20, resetsAt: future },
                ],
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      expect(result[0].limits).toHaveLength(2);
    });

    it("解析 Codex 嵌套 rateLimits 格式", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                rateLimits: {
                  rateLimits: {
                    primary: { usedPercent: 40, resetsAt: future },
                    secondary: { usedPercent: 15, resetsAt: future },
                  },
                },
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      // Session 归一化为 5h
      expect(result[0].limits![0].window).toBe("5h");
      // Weekly 保持
      expect(result[0].limits![1].window).toBe("Weekly");
    });

    it("解析 Claude rate_limit_info 格式", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "claudeAgent",
                rate_limit_info: {
                  rateLimitType: "five_hour",
                  utilization: 0.6,
                  resetsAt: future,
                  status: "active",
                },
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("claudeAgent");
      expect(result[0].status).toBe("active");
      // utilization 0.6 转换为 60%
      expect(result[0].limits![0].usedPercent).toBe(60);
      expect(result[0].limits![0].window).toBe("5h");
    });

    it("回退到顶层 usedPercent 字段", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                usedPercent: 50,
                resetsAt: future,
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      expect(result[0].limits).toBeDefined();
    });

    it("同一 Provider 的旧事件被新事件覆盖", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                limits: [{ window: "5h", usedPercent: 80, resetsAt: future }],
              },
            }),
            // 同一 Provider 的更新版本(更晚的 createdAt)
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:01:00.000Z",
              payload: {
                provider: "codex",
                limits: [{ window: "5h", usedPercent: 30, resetsAt: future }],
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      expect(result[0].limits![0].usedPercent).toBe(30);
      expect(result[0].updatedAt).toBe("2026-06-24T00:01:00.000Z");
    });

    it("已过期的重置时间被过滤", () => {
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                limits: [{ window: "5h", usedPercent: 50, resetsAt: past }],
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toEqual([]);
    });

    it("无 resetsAt 字段的活动也保留", () => {
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                limits: [{ window: "5h", usedPercent: 50 }],
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      expect(result[0].limits![0].usedPercent).toBe(50);
    });

    it("provider 字段缺失时默认为 unknown", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                limits: [{ window: "5h", usedPercent: 50, resetsAt: future }],
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("unknown");
    });

    it("多 Provider 时各自分组", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const threads = [
        {
          activities: [
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "codex",
                limits: [{ window: "5h", usedPercent: 30, resetsAt: future }],
              },
            }),
            makeActivity({
              kind: "account.rate-limits.updated",
              createdAt: "2026-06-24T00:00:00.000Z",
              payload: {
                provider: "claudeAgent",
                rate_limit_info: {
                  rateLimitType: "five_hour",
                  utilization: 0.4,
                  resetsAt: future,
                },
              },
            }),
          ],
        },
      ];
      const result = deriveAccountRateLimits(threads);
      expect(result).toHaveLength(2);
      const providers = result.map((r) => r.provider).sort();
      expect(providers).toEqual(["claudeAgent", "codex"]);
    });
  });

  describe("deriveVisibleRateLimitRows", () => {
    it("空输入返回空数组", () => {
      expect(deriveVisibleRateLimitRows([])).toEqual([]);
    });

    it("从 Provider 速率限制推导可见行", () => {
      const result = deriveVisibleRateLimitRows([
        {
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [{ window: "5h", usedPercent: 25 }],
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("5h");
      expect(result[0].remainingPercent).toBe(75);
      expect(result[0].id).toBe("codex-5h");
    });

    it("排序按 WINDOW_ORDER: 5h < Weekly < Sonnet < Current", () => {
      const result = deriveVisibleRateLimitRows([
        {
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [
            { window: "Current", usedPercent: 50 },
            { window: "Weekly", usedPercent: 30 },
            { window: "5h", usedPercent: 20 },
          ],
        },
      ]);
      expect(result.map((r) => r.label)).toEqual(["5h", "Weekly", "Current"]);
    });

    it("同 label 多个 Provider 时取 usedPercent 最大的", () => {
      const result = deriveVisibleRateLimitRows([
        {
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [{ window: "5h", usedPercent: 30 }],
        },
        {
          provider: "claudeAgent",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [{ window: "5h", usedPercent: 70 }],
        },
      ]);
      expect(result).toHaveLength(1);
      // 70% 使用率 → 30% 剩余
      expect(result[0].remainingPercent).toBe(30);
    });

    it("usedPercent 缺失时被跳过", () => {
      const result = deriveVisibleRateLimitRows([
        {
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [{ window: "5h" }], // 没有 usedPercent
        },
      ]);
      expect(result).toEqual([]);
    });

    it("limits 为空时回退到 Provider 顶层字段", () => {
      const result = deriveVisibleRateLimitRows([
        {
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [],
          usedPercent: 40,
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].remainingPercent).toBe(60);
    });

    it("保留 resetsAt 与 windowDurationMins 字段", () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const result = deriveVisibleRateLimitRows([
        {
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [
            { window: "5h", usedPercent: 30, resetsAt: future, windowDurationMins: 300 },
          ],
        },
      ]);
      expect(result[0].resetsAt).toBe(future);
      expect(result[0].windowDurationMins).toBe(300);
    });
  });

  describe("deriveProviderUsageLearnMoreHref", () => {
    it("codex 返回 OpenAI 文档", () => {
      expect(deriveProviderUsageLearnMoreHref("codex")).toBe(
        "https://platform.openai.com/usage",
      );
    });

    it("claudeAgent 返回 Anthropic 文档", () => {
      expect(deriveProviderUsageLearnMoreHref("claudeAgent")).toBe(
        "https://docs.anthropic.com/en/docs/about-claude/models#rate-limits",
      );
    });

    it("gemini 返回 Google AI 文档", () => {
      expect(deriveProviderUsageLearnMoreHref("gemini")).toBe(
        "https://ai.google.dev/gemini-api/docs/quota",
      );
    });

    it("未知 provider 返回 null", () => {
      expect(deriveProviderUsageLearnMoreHref("foo")).toBeNull();
    });

    it("null/undefined 返回 null", () => {
      expect(deriveProviderUsageLearnMoreHref(null)).toBeNull();
      expect(deriveProviderUsageLearnMoreHref(undefined)).toBeNull();
    });
  });

  describe("deriveRateLimitLearnMoreHref", () => {
    it("单 Provider 时返回其链接", () => {
      expect(
        deriveRateLimitLearnMoreHref([
          { provider: "codex", updatedAt: "2026-06-24T00:00:00.000Z" },
        ]),
      ).toBe("https://platform.openai.com/usage");
    });

    it("多 Provider 时返回 null", () => {
      expect(
        deriveRateLimitLearnMoreHref([
          { provider: "codex", updatedAt: "2026-06-24T00:00:00.000Z" },
          { provider: "claudeAgent", updatedAt: "2026-06-24T00:00:00.000Z" },
        ]),
      ).toBeNull();
    });

    it("空列表返回 null", () => {
      expect(deriveRateLimitLearnMoreHref([])).toBeNull();
    });
  });

  describe("mergeProviderRateLimits", () => {
    it("空 + 空 = 空", () => {
      expect(mergeProviderRateLimits([], [])).toEqual([]);
    });

    it("只 preferred 存在", () => {
      const preferred: ProviderRateLimit[] = [
        { provider: "codex", updatedAt: "2026-06-24T00:00:00.000Z" },
      ];
      expect(mergeProviderRateLimits(preferred, [])).toEqual(preferred);
    });

    it("只 fallback 存在", () => {
      const fallback: ProviderRateLimit[] = [
        { provider: "codex", updatedAt: "2026-06-24T00:00:00.000Z" },
      ];
      expect(mergeProviderRateLimits([], fallback)).toEqual(fallback);
    });

    it("同 Provider 合并时 preferred 覆盖 fallback 字段", () => {
      const result = mergeProviderRateLimits(
        [
          {
            provider: "codex",
            updatedAt: "2026-06-24T00:01:00.000Z",
            status: "active",
          },
        ],
        [
          {
            provider: "codex",
            updatedAt: "2026-06-24T00:00:00.000Z",
            status: "inactive",
            limits: [{ window: "5h", usedPercent: 80 }],
          },
        ],
      );
      expect(result).toHaveLength(1);
      expect(result[0].updatedAt).toBe("2026-06-24T00:01:00.000Z");
      expect(result[0].status).toBe("active");
      // fallback 的 limits 通过 mergeRateLimitWindowSets 保留
      expect(result[0].limits).toEqual([{ window: "5h", usedPercent: 80 }]);
    });

    it("limits 数组中同 label 合并时 preferred 覆盖", () => {
      const result = mergeProviderRateLimits(
        [
          {
            provider: "codex",
            updatedAt: "2026-06-24T00:00:00.000Z",
            limits: [{ window: "5h", usedPercent: 30, windowDurationMins: 300 }],
          },
        ],
        [
          {
            provider: "codex",
            updatedAt: "2026-06-24T00:00:00.000Z",
            limits: [
              { window: "5h", usedPercent: 80, windowDurationMins: 300 },
              { window: "Weekly", usedPercent: 50, windowDurationMins: 10_080 },
            ],
          },
        ],
      );
      expect(result[0].limits).toHaveLength(2);
      const limit5h = result[0].limits!.find((l) => l.window === "5h");
      expect(limit5h!.usedPercent).toBe(30);
      const limitWeekly = result[0].limits!.find((l) => l.window === "Weekly");
      expect(limitWeekly!.usedPercent).toBe(50);
    });

    it("limits 数组中 limits 在合并时排序: 5h < Weekly", () => {
      // 需要 fallback 也有 limits 才会触发 mergeProviderRateLimit 内部的排序逻辑
      const result = mergeProviderRateLimits(
        [
          {
            provider: "codex",
            updatedAt: "2026-06-24T00:00:00.000Z",
            limits: [{ window: "Weekly", usedPercent: 50 }],
          },
        ],
        [
          {
            provider: "codex",
            updatedAt: "2026-06-24T00:00:00.000Z",
            limits: [{ window: "5h", usedPercent: 30 }],
          },
        ],
      );
      expect(result[0].limits!.map((l) => l.window)).toEqual(["5h", "Weekly"]);
    });

    it("多 Provider 时合并入同一个数组", () => {
      const result = mergeProviderRateLimits(
        [{ provider: "codex", updatedAt: "2026-06-24T00:00:00.000Z" }],
        [{ provider: "claudeAgent", updatedAt: "2026-06-24T00:00:00.000Z" }],
      );
      expect(result).toHaveLength(2);
    });
  });
});
