/**
 * 网络状态 Page Object
 *
 * 测试覆盖：
 * - 在线 / 降级 / 离线 状态指示
 * - 模拟 online / offline 事件后 UI 响应
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type NetworkStatus = "online" | "degraded" | "offline";

export class NetworkStatusPage {
  constructor(public readonly page: Page) {}

  /** 顶栏网络状态徽章 */
  get indicator(): Locator {
    return this.page.locator('[role="status"][data-status]');
  }

  async getStatus(): Promise<NetworkStatus | null> {
    const status = await this.page.evaluate(() => {
      const el = document.querySelector('[role="status"][data-status]');
      return el ? el.getAttribute("data-status") : null;
    });
    return status as NetworkStatus | null;
  }

  /**
   * 模拟浏览器 offline / online 事件
   * 注：useNetworkStatus 内部监听 navigator.onLine + window event
   */
  async setOnline(online: boolean): Promise<void> {
    await this.page.evaluate((isOnline) => {
      // happy-dom/jsdom 不会真正切换 navigator.onLine，
      // useNetworkStatus 通常会同时监听 'online' / 'offline' 事件。
      // 我们直接派发事件，让 React 端 hook 同步状态。
      const eventName = isOnline ? "online" : "offline";
      window.dispatchEvent(new Event(eventName));
    }, online);
  }
}
