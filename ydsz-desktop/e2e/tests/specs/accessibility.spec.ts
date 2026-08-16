/**
 * @file 可访问性 E2E 套件
 *
 * 互联网大厂基线：核心页面必须满足 WCAG 2.1 Level A/AA。
 * 本套件使用 @axe-core/playwright 自动化扫描关键视图，
 * 任何 critical / serious 级别违规都会阻塞 CI。
 *
 * 覆盖范围：
 * - 聊天视图（chat-view）
 * - 主题切换（dark/light）
 * - 路由视图（skills / wiki / automations）
 * - 命令面板（command-palette）
 *
 * 标签：@p1 @a11y
 */
import {
  runAccessibilityScan,
  expectNoSeriousViolations,
  test,
} from "../helpers/axe-helper";
import { ChatViewPage } from "../page-objects/chat-view.page";
import { SidebarPage } from "../page-objects/sidebar.page";
import { ThemePage } from "../page-objects/theme.page";
import { RoutesPage } from "../page-objects/routes.page";
import { CommandPalettePage } from "../page-objects/command-palette.page";

test.describe("@p1 @a11y 可访问性扫描", () => {
  test("A11Y-001 聊天视图：critical/serious 违规 = 0", async ({ page }) => {
    const chat = new ChatViewPage(page);
    await chat.goto();
    await chat.waitForReady();

    const results = await runAccessibilityScan(page, "chat-view", {
      // Tauri WebView 下 color-contrast 偶发误报（GPU 渲染 + high-DPI 缩放）
      // 实际主题已通过 design token 校验，这里仅记录非严重违规
      disableRules: [],
    });
    expectNoSeriousViolations(results);
  });

  test("A11Y-002 侧边栏展开态：critical/serious 违规 = 0", async ({ page }) => {
    const sidebar = new SidebarPage(page);
    // 确保侧边栏展开
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // 等待侧边栏可见
    await sidebar.sidebar.waitFor({ state: "visible", timeout: 10_000 });

    const results = await runAccessibilityScan(page, "sidebar-expanded");
    expectNoSeriousViolations(results);
  });

  test("A11Y-003 浅色主题：critical/serious 违规 = 0", async ({ page }) => {
    const theme = new ThemePage(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await theme.setModeViaStorage("light");
    await theme.waitForMode("light", 5_000);

    const results = await runAccessibilityScan(page, "theme-light");
    expectNoSeriousViolations(results);
  });

  test("A11Y-004 深色主题：critical/serious 违规 = 0", async ({ page }) => {
    const theme = new ThemePage(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await theme.setModeViaStorage("dark");
    await theme.waitForMode("dark", 5_000);
    await theme.waitForDarkClass(true, 5_000);

    const results = await runAccessibilityScan(page, "theme-dark");
    expectNoSeriousViolations(results);
  });

  test("A11Y-005 Skills 路由：critical/serious 违规 = 0", async ({ page }) => {
    const routes = new RoutesPage(page);
    await routes.gotoSkills();
    await routes.skillsView.waitFor({ state: "visible", timeout: 10_000 });

    const results = await runAccessibilityScan(page, "skills-view");
    expectNoSeriousViolations(results);
  });

  test("A11Y-006 Wiki 路由：critical/serious 违规 = 0", async ({ page }) => {
    const routes = new RoutesPage(page);
    await routes.gotoWiki();
    await routes.wikiView.waitFor({ state: "visible", timeout: 10_000 });

    const results = await runAccessibilityScan(page, "wiki-view");
    expectNoSeriousViolations(results);
  });

  test("A11Y-007 Automations 路由：critical/serious 违规 = 0", async ({ page }) => {
    const routes = new RoutesPage(page);
    await routes.gotoAutomations();
    // 等待页面渲染（具体 testid 不固定，给个宽容超时）
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1_000);

    const results = await runAccessibilityScan(page, "automations-view");
    expectNoSeriousViolations(results);
  });

  test("A11Y-008 命令面板打开态：critical/serious 违规 = 0", async ({ page }) => {
    const palette = new CommandPalettePage(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await palette.open();
    await palette.input.waitFor({ state: "visible", timeout: 5_000 });

    const results = await runAccessibilityScan(page, "command-palette-open");
    expectNoSeriousViolations(results);
  });
});
