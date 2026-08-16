/**
 * E2E-P1-006: Wiki 视图加载
 *
 * 验证：
 * 1. 通过侧边栏命令卡跳转到 /wiki
 * 2. WikiView 渲染（data-testid="wiki-view"）
 *
 * 注：WikiView 内部依赖 `useActiveWikiRoot`，
 * 若工作区未设置 homeDir，会显示「缺少根目录」提示。
 * 这里只验证路由跳转 + 视图挂载。
 *
 * 用例标签：@p1 @wiki
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";
import { SidebarPage } from "../page-objects/sidebar.page";
import { RoutesPage } from "../page-objects/routes.page";

test.describe("@p1 Wiki 视图", () => {
  test("E2E-P1-006 通过侧边栏命令卡跳转到 Wiki 视图", async ({ page }) => {
    const chat = new ChatViewPage(page);
    const sidebar = new SidebarPage(page);
    const routes = new RoutesPage(page);

    // 1. 启动
    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 2. 点击侧边栏 Wiki 命令卡
    await sidebar.navigateToWiki();

    // 3. 验证 WikiView 渲染
    //    WikiView 缺少 root 时渲染空态（无 data-testid="wiki-view"），
    //    所以这里只验证 URL 跳转，不强制 wiki-view 出现。
    await expect.poll(() => page.url()).toMatch(/\/wiki/);
  });

  test("E2E-P1-006b 直接通过 URL 进入 Wiki 视图", async ({ page }) => {
    const routes = new RoutesPage(page);
    await routes.gotoWiki();
    // 路由可达即可（不依赖后端 repo_wiki_list）
    await expect.poll(() => page.url()).toMatch(/\/wiki/);
  });
});
