/**
 * 通用 fixture：Tauri 桌面会话
 *
 * 互联网大厂基线：
 * - 每次测试独立窗口/上下文，互不污染
 * - 自动注入截屏、trace 留档
 * - 提供 firstSend/apiMock 钩子
 */
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export type TauriFixture = {
  /**
   * Tauri 桌面 WebView Page。
   * WebDriver 协议下，address 栏为 tauri://localhost
   */
  page: Page;
  /**
   * 等待 Tauri bridge 就绪（__TAURI_INTERNALS__ 注入）
   */
  waitForTauriReady: () => Promise<void>;
};

export const test = base.extend<TauriFixture>({
  page: async ({ page }, use) => {
    // 启动时记录 console 供失败回溯
    page.on("console", (msg) => {
      if (process.env.DEBUG_E2E) {
        console.log(`[browser ${msg.type()}] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      console.error("[browser pageerror]", err);
    });
    await use(page);
  },

  waitForTauriReady: async ({ page }, use) => {
    await use(async () => {
      // 等待 tauri 注入桥
      await page.waitForFunction(
        () => typeof (window as any).__TAURI_INTERNALS__ !== "undefined",
        { timeout: 30_000 },
      );
    });
  },
});

export { expect };
