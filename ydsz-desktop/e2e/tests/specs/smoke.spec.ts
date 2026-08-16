/**
 * E2E-001：启动 → 进入 ChatView → 看见空态
 *
 * 这是真桌面 E2E 的"冒烟用例"，验证：
 * 1. Tauri 窗口能正常启动
 * 2. Vite 主入口能加载
 * 3. Router 进入 /chat
 * 4. ChatEmptyState 渲染
 *
 * 用例标签：@smoke @p0
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";

test.describe("@smoke 桌面端到端冒烟", () => {
  test("E2E-001 启动 → 进入 ChatView → 看见空态", async ({ page }) => {
    const chat = new ChatViewPage(page);

    // 1. 打开应用首页
    await chat.goto();
    await chat.waitForReady();

    // 2. 验证空态出现
    await chat.waitForEmptyState();

    // 3. 验证空态有引导文案（不是白屏）
    const emptyStateText = await chat.emptyState.textContent();
    expect(emptyStateText?.length ?? 0).toBeGreaterThan(10);
  });

  test("E2E-002 启动 → 点击 New Thread → 仍为空态", async ({ page }) => {
    const chat = new ChatViewPage(page);

    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 触发 new thread
    await chat.newThread();

    // 验证 URL 变化
    expect(page.url()).toMatch(/\/chat\/[a-z0-9-]+/i);
  });
});
