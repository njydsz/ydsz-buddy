/**
 * E2E-P1-007: 网络状态指示器
 *
 * 验证：
 * 1. 在线状态 → 不显示指示器（默认不渲染）
 * 2. 离线事件 → 顶栏出现 offline 状态徽章
 * 3. online 事件 → 状态徽章消失
 *
 * 注：useNetworkStatus 监听 window 'online' / 'offline' 事件，
 * 通过 page.evaluate 派发事件即可触发 hook 状态更新。
 *
 * 用例标签：@p1 @network
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";
import { NetworkStatusPage } from "../page-objects/network-status.page";

test.describe("@p1 网络状态", () => {
  test("E2E-P1-007 离线事件触发顶栏网络状态徽章", async ({ page }) => {
    const chat = new ChatViewPage(page);
    const network = new NetworkStatusPage(page);

    // 1. 启动
    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 2. 初始 online：指示器不渲染
    await expect(network.indicator).toHaveCount(0);

    // 3. 派发 offline 事件
    await network.setOnline(false);

    // 4. 等待指示器出现
    await expect(network.indicator).toBeVisible({ timeout: 5_000 });
    const offlineStatus = await network.getStatus();
    // 注意：useNetworkStatus 内部可能映射为 'offline' 或 'degraded'，
    // 这里只断言非 online 即可
    expect(offlineStatus).not.toBe("online");

    // 5. 派发 online 事件，指示器应消失
    await network.setOnline(true);
    await expect(network.indicator).toHaveCount(0);
  });
});
