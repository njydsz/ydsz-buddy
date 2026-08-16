/**
 * @file AxeBuilder 辅助函数
 *
 * 互联网大厂基线：
 * - 提供基于 @axe-core/playwright 的统一可访问性扫描入口
 * - 关键页面（侧边栏/聊天/命令面板）必须满足 WCAG 2.1 AA
 * - 严重级别（critical / serious）必须 0 违规
 * - moderate / minor 级别可作为可改进项记录
 *
 * 使用方式：
 * ```ts
 * import { runAccessibilityScan, expectNoSeriousViolations } from "../helpers/axe-helper";
 *
 * test("页面的可访问性扫描", async ({ page }) => {
 *   const results = await runAccessibilityScan(page, "chat-view");
 *   expectNoSeriousViolations(results);
 * });
 * ```
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "../fixtures/tauri-fixture";

/**
 * 严重级别阈值
 *
 * - critical：必须修复，CI 阻塞
 * - serious：必须修复，CI 阻塞
 * - moderate：建议修复，CI 警告
 * - minor：可选优化
 */
export type SeverityLevel = "critical" | "serious" | "moderate" | "minor";

export interface AccessibilityScanResult {
  /** 扫描的页面/上下文标识 */
  context: string;
  /** 违规总数（按严重级别） */
  violationCounts: Record<SeverityLevel, number>;
  /** 违规详情（按 ruleId 聚合） */
  violations: Array<{
    id: string;
    impact: SeverityLevel | null;
    description: string;
    helpUrl: string;
    nodeCount: number;
  }>;
  /** 原始 axe 结果（用于调试） */
  raw: Awaited<ReturnType<AxeBuilder["analyze"]>>;
}

/**
 * 执行可访问性扫描
 *
 * @param page - Playwright Page
 * @param context - 上下文标识（仅用于日志）
 * @param options - 扫描选项
 * @returns 扫描结果
 */
export async function runAccessibilityScan(
  page: Page,
  context: string,
  options: {
    /**
     * 禁用的 axe 规则 ID 列表（用于环境限制，如 Tauri WebView 下的 color-contrast 误报）
     */
    disableRules?: string[];
    /**
     * 自定义扫描范围选择器（默认整页）
     */
    includeSelector?: string;
  } = {},
): Promise<AccessibilityScanResult> {
  let builder = new AxeBuilder({ page })
    // WCAG 2.1 Level A + AA 标签
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

  if (options.includeSelector) {
    builder = builder.include(options.includeSelector);
  }

  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }

  const results = await builder.analyze();

  const violationCounts: Record<SeverityLevel, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };

  const violations = results.violations.map((v) => {
    const impact = (v.impact as SeverityLevel | null) ?? null;
    if (impact) {
      violationCounts[impact] += v.nodes.length;
    }
    return {
      id: v.id,
      impact,
      description: v.description,
      helpUrl: v.helpUrl,
      nodeCount: v.nodes.length,
    };
  });

  return {
    context,
    violationCounts,
    violations,
    raw: results,
  };
}

/**
 * 断言：无 critical / serious 级别违规
 *
 * moderate / minor 级别违规仅记录到测试报告（不阻塞）。
 */
export function expectNoSeriousViolations(
  results: AccessibilityScanResult,
  options: { allowImpact?: SeverityLevel[] } = {},
): void {
  const allowedImpact = new Set<SeverityLevel>(options.allowImpact ?? []);
  const critical = results.violationCounts.critical;
  const serious = results.violationCounts.serious;
  const moderate = results.violationCounts.moderate;
  const minor = results.violationCounts.minor;

  // 记录所有违规供 CI 日志查看
  if (results.violations.length > 0) {
    const lines = results.violations.map(
      (v) =>
        `  - [${v.impact ?? "unknown"}] ${v.id} (${v.nodeCount} nodes): ${v.description}`,
    );
    console.warn(
      `[a11y] ${results.context} violations:\n${lines.join("\n")}`,
    );
  }

  expect(
    critical,
    `Expected 0 critical violations, got ${critical} in ${results.context}`,
  ).toBe(0);
  expect(
    serious,
    `Expected 0 serious violations, got ${serious} in ${results.context}`,
  ).toBe(0);
  // moderate / minor 仅警告，不阻塞 CI
  if (moderate > 0) {
    console.warn(
      `[a11y] ${results.context} has ${moderate} moderate violations (non-blocking)`,
    );
  }
  if (minor > 0) {
    console.warn(
      `[a11y] ${results.context} has ${minor} minor violations (non-blocking)`,
    );
  }
  // Suppress unused variable warning
  void allowedImpact;
}

/**
 * 装饰器风格：将扫描附加到现有测试
 *
 * 用法：
 * ```ts
 * test("侧边栏可访问性", async ({ page }) => {
 *   await withA11yScan(page, "sidebar", async () => {
 *     // 你的测试代码
 *   });
 * });
 * ```
 */
export async function withA11yScan(
  page: Page,
  context: string,
  fn: () => Promise<void>,
  options: { disableRules?: string[]; includeSelector?: string } = {},
): Promise<void> {
  await fn();
  const results = await runAccessibilityScan(page, context, options);
  expectNoSeriousViolations(results);
}

/**
 * 测试钩子：把扫描结果附加到 test info 报告
 */
export function attachScanReport(
  testInfo: TestInfo,
  results: AccessibilityScanResult,
): void {
  testInfo.attachments.push({
    name: `a11y-${results.context}.json`,
    body: JSON.stringify(
      {
        context: results.context,
        violationCounts: results.violationCounts,
        violations: results.violations,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
}

// Re-export test & expect so consumers can use a single import
export { test, expect };
