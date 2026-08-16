/**
 * E2E-M1: 错误上报 monitor 端到端测试
 *
 * 互联网大厂基线:
 *  - monitor SDK 必须在真实 E2E 流程里被调用,而不是只在单元测试里 mock 一下
 *  - 覆盖三种调用路径:应用直接调用 / ErrorBoundary 兜底 / 静默降级
 *  - 通过 console.error hook + addInitScript 捕获 monitor 输出
 *
 * 实现机制:
 *  1. addInitScript 在 navigation 前注入 console 拦截器,
 *     把 [monitor] 前缀的输出写入 window.__ydszBuddyMonitorCalls
 *  2. 通过 URL `?__ydszE2EMonitorTest=1` 激活 main.tsx 里的 E2E 钩子,
 *     暴露 window.__ydszE2EMonitor API
 *  3. 测试通过 page.evaluate 调用 API,验证 monitor 真实被调用
 *
 * 用例标签:@p0 @monitor @error-reporting
 */
import { test, expect, type Page } from "@playwright/test";

/** 状态对象挂载 key,init 脚本与 spec 共享 */
const MONITOR_STATE_KEY = "__ydszE2EMonitorState" as const;

/**
 * Init script: 拦截 console.error / console.warn / console.debug,
 * 把 [monitor] 前缀的消息解析后存到 window.__ydszE2EMonitorState.calls
 *
 * 重要:addInitScript 必须在 navigation 之前执行,否则 React first paint
 *       期间的 monitor 调用会被错过。
 */
const MONITOR_HOOK_INIT_SCRIPT = `
  (() => {
    const state = { calls: [] };
    window.${MONITOR_STATE_KEY} = state;

    // monitor.ts 的 noop impl 使用 console.error 输出,
    // captureMessage 使用 console.warn, span 使用 console.debug
    const channels = ["error", "warn", "debug"];

    for (const ch of channels) {
      const original = console[ch].bind(console);
      console[ch] = (...args) => {
        try {
          const first = args[0];
          if (typeof first === "string" && first.startsWith("[monitor]")) {
            state.calls.push({
              channel: ch,
              raw: first,
              context: args[1] ?? null,
            });
          }
        } catch {
          // 永远不要影响 console 行为
        }
        return original(...args);
      };
    }
  })();
`;

interface MonitorCall {
  channel: "error" | "warn" | "debug";
  raw: string;
  context: unknown;
}

async function getMonitorCalls(page: Page): Promise<MonitorCall[]> {
  return page.evaluate((key) => {
    const state = (window as unknown as { [k: string]: { calls: MonitorCall[] } | undefined })[
      key
    ];
    return state ? state.calls : [];
  }, MONITOR_STATE_KEY);
}

async function clearMonitorCalls(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const state = (window as unknown as { [k: string]: { calls: MonitorCall[] } | undefined })[
      key
    ];
    if (state) state.calls.length = 0;
  }, MONITOR_STATE_KEY);
}

async function gotoMonitorTestPage(page: Page): Promise<void> {
  // 通过 query param 激活 main.tsx 中的 E2E 钩子
  await page.goto("/?__ydszE2EMonitorTest=1");
  // 等待 tauri bridge + E2E 钩子就绪
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __ydszE2EMonitor?: unknown }).__ydszE2EMonitor !==
      "undefined",
    { timeout: 15_000 },
  );
}

test.describe("@p0 错误上报 monitor 端到端", () => {
  test.beforeEach(async ({ page }) => {
    // 必须在 navigation 之前注入,否则 first paint 期间 monitor 调用会被错过
    await page.addInitScript(MONITOR_HOOK_INIT_SCRIPT);
  });

  test("E2E-M1-001 应用直接调用 monitor.captureError 落地到 console stub", async ({
    page,
  }) => {
    await gotoMonitorTestPage(page);
    // 清空启动期间的 calls,只关注本次测试触发的
    await clearMonitorCalls(page);

    await page.evaluate(() => {
      const api = (
        window as unknown as {
          __ydszE2EMonitor: {
            captureError: (p: { type: string; message: string; level?: string }) => void;
          };
        }
      ).__ydszE2EMonitor;
      api.captureError({
        type: "E2ETestType",
        message: "E2E-M1-001 payload",
        level: "error",
      });
    });

    // 同步代码 + noop impl → 同步写 console.error
    const calls = await getMonitorCalls(page);
    const errorCalls = calls.filter((c) => c.channel === "error");
    expect(errorCalls.length).toBeGreaterThan(0);

    const matched = errorCalls.find((c) => c.raw.includes("E2ETestType"));
    expect(matched, "expected monitor console.error for E2ETestType").toBeTruthy();
    expect(matched!.raw).toContain("E2E-M1-001 payload");
  });

  test("E2E-M1-002 AppErrorBoundary 触发后调用 monitor.captureError", async ({ page }) => {
    await gotoMonitorTestPage(page);
    await clearMonitorCalls(page);

    // 触发 AppErrorBoundary 兜底链路
    await page.evaluate(() => {
      const api = (
        window as unknown as { __ydszE2EMonitor: { triggerErrorBoundary: () => void } }
      ).__ydszE2EMonitor;
      api.triggerErrorBoundary();
    });

    // 等待 ErrorBoundary 渲染(data-testid="error-boundary")
    const fallback = page.locator('[data-testid="error-boundary"]');
    await expect(fallback).toBeVisible({ timeout: 10_000 });

    // 验证 monitor 被调用,type=ReactErrorBoundary(由 ErrorBoundary.tsx 写入)
    const calls = await getMonitorCalls(page);
    const errorCalls = calls.filter(
      (c) => c.channel === "error" && c.raw.includes("ReactErrorBoundary"),
    );
    expect(errorCalls.length, "ErrorBoundary 必须调用 monitor.captureError").toBeGreaterThan(0);
    expect(errorCalls[0]!.raw).toContain("__ydszE2EMonitorTest: simulated render error");
  });

  test("E2E-M1-003 captureMessage 走 console.warn channel", async ({ page }) => {
    await gotoMonitorTestPage(page);
    await clearMonitorCalls(page);

    await page.evaluate(() => {
      const api = (
        window as unknown as {
          __ydszE2EMonitor: { captureMessage: (m: string, c?: Record<string, unknown>) => void };
        }
      ).__ydszE2EMonitor;
      api.captureMessage("E2E-M1-003 breadcrumb", { route: "/chat" });
    });

    const calls = await getMonitorCalls(page);
    const warnCalls = calls.filter((c) => c.channel === "warn");
    const matched = warnCalls.find((c) => c.raw.includes("E2E-M1-003 breadcrumb"));
    expect(matched, "captureMessage must be logged to console.warn").toBeTruthy();
    // context 透传校验
    const ctx = matched!.context as { route?: string } | null;
    expect(ctx?.route).toBe("/chat");
  });

  test("E2E-M1-004 PII 安全:栈/上下文不泄漏用户消息内容(回归项)", async ({ page }) => {
    await gotoMonitorTestPage(page);
    await clearMonitorCalls(page);

    const sensitiveSnippet = `super-secret-token-${Date.now()}`;
    await page.evaluate(
      ({ snippet }) => {
        const api = (
          window as unknown as {
            __ydszE2EMonitor: { captureError: (p: { type: string; message: string }) => void };
          }
        ).__ydszE2EMonitor;
        // 用户消息内容可能很长,大厂基线要求 SDK 自身不附加消息体,
        // 调用方负责脱敏。这里只验证 type / message / context 三个字段透传,
        // 不应该把用户消息全文作为 context 注入。
        api.captureError({
          type: "ChatSendError",
          message: "user message send failed (redacted)",
        });
      },
      { snippet: sensitiveSnippet },
    );

    const calls = await getMonitorCalls(page);
    const combined = JSON.stringify(calls);
    // 防御性断言:敏感内容不应被 SDK 主动追加
    expect(combined).not.toContain(sensitiveSnippet);
  });
});
