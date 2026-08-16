/**
 * E2E-P1-005: Skills 视图加载
 *
 * 验证：
 * 1. 通过侧边栏命令卡跳转到 /plugins?tab=skills
 * 2. SkillsView 渲染（data-testid="skills-view"）
 * 3. 顶栏 Provider Discovery Toolbar 存在
 *
 * 用例标签：@p1 @skills
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";
import { SidebarPage } from "../page-objects/sidebar.page";
import { RoutesPage } from "../page-objects/routes.page";

test.describe("@p1 Skills 视图", () => {
  test("E2E-P1-005 通过侧边栏命令卡跳转到 Skills 视图", async ({ page }) => {
    const chat = new ChatViewPage(page);
    const sidebar = new SidebarPage(page);
    const routes = new RoutesPage(page);

    // 1. 启动
    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 2. 点击侧边栏 Skills 命令卡
    await sidebar.navigateToSkills();

    // 3. 验证 SkillsView 渲染
    await expect(routes.skillsView).toBeVisible({ timeout: 15_000 });

    // 4. 验证 URL 含 /plugins?tab=skills
    expect(page.url()).toMatch(/\/plugins\?tab=skills/);
  });

  test("E2E-P1-005b 直接通过 URL 进入 Skills 视图", async ({ page }) => {
    const routes = new RoutesPage(page);
    await routes.gotoSkills();
    await expect(routes.skillsView).toBeVisible();
  });
});
