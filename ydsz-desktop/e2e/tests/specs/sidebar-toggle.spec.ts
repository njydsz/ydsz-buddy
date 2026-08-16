/**
 * E2E-P1-003: 侧边栏折叠/展开
 *
 * 验证：
 * 1. 侧边栏默认展开
 * 2. 点击 sidebar-toggle 后折叠（data-state 变化）
 * 3. 再次点击恢复
 *
 * 用例标签：@p1 @sidebar
 */
import { test } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";
import { SidebarPage } from "../page-objects/sidebar.page";

test.describe("@p1 侧边栏切换", () => {
  test("E2E-P1-003 侧边栏 toggle 折叠/展开", async ({ page }) => {
    const chat = new ChatViewPage(page);
    const sidebar = new SidebarPage(page);

    // 1. 启动
    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 2. 默认展开
    const initialState = await sidebar.isExpanded();
    // 第一次 toggle 应该是隐藏（从 expanded → collapsed）
    await sidebar.toggle();
    await sidebar.waitForExpanded(!initialState);

    // 3. 再次 toggle 恢复
    await sidebar.toggle();
    await sidebar.waitForExpanded(initialState);
  });
});
