/**
 * E2E-007 ~ E2E-012: 设置页面 & 插件路由冒烟测试
 *
 * 覆盖关键路径：
 * - E2E-007: 设置页所有分区可导航且渲染
 * - E2E-008: 高级设置页 MCP 面板渲染
 * - E2E-009: /plugins 路由可访问
 * - E2E-010: /plugins?tab=skills 可访问
 * - E2E-011: /plugins?tab=extensions 可访问（P1-1 新增）
 * - E2E-012: 设置页 Office 模板库渲染（P1-2 新增）
 *
 * 用例标签：@smoke @p0
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";

test.describe("@smoke 设置页面 & 插件路由", () => {
  test("E2E-007 设置页所有分区可导航且渲染", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");

    // 等待设置页面加载
    const settingsHeader = page.locator("h1").first();
    await expect(settingsHeader).toBeVisible({ timeout: 15_000 });

    // 验证默认 general 分区渲染
    await expect(page.locator("h2, section")).toHaveCount(await page.locator("section").count());

    // 导航到 appearance 分区
    const appearanceNav = page.locator('text=Appearance').first();
    if (await appearanceNav.isVisible()) {
      await appearanceNav.click();
      await page.waitForTimeout(500);
      // 验证页面没有崩溃
      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toHaveCount(0);
    }

    // 导航到 behavior 分区
    const behaviorNav = page.locator('text=Behavior').first();
    if (await behaviorNav.isVisible()) {
      await behaviorNav.click();
      await page.waitForTimeout(500);
      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toHaveCount(0);
    }

    // 导航到 advanced 分区
    const advancedNav = page.locator('text=Advanced').first();
    if (await advancedNav.isVisible()) {
      await advancedNav.click();
      await page.waitForTimeout(500);
      const errorBoundary = page.locator('[data-testid="error-boundary"]');
      await expect(errorBoundary).toHaveCount(0);
    }
  });

  test("E2E-008 高级设置页 MCP 面板渲染", async ({ page }) => {
    await page.goto("/settings?section=advanced");
    await page.waitForLoadState("domcontentloaded");

    const settingsHeader = page.locator("h1").first();
    await expect(settingsHeader).toBeVisible({ timeout: 15_000 });

    // MCP 面板应该可见（在 advanced 分区中）
    const mcpSection = page.locator('text=MCP, text=Model Context Protocol').first();
    await expect(mcpSection).toBeVisible({ timeout: 10_000 });
  });

  test("E2E-009 /plugins 路由可访问", async ({ page }) => {
    await page.goto("/plugins");
    await page.waitForLoadState("domcontentloaded");

    // 验证页面渲染（至少有标题或内容）
    const content = page.locator("h1, h2, [data-testid]").first();
    await expect(content).toBeVisible({ timeout: 15_000 });
  });

  test("E2E-010 /plugins?tab=skills 可访问", async ({ page }) => {
    await page.goto("/plugins?tab=skills");
    await page.waitForLoadState("domcontentloaded");

    const content = page.locator("h1, h2, [data-testid]").first();
    await expect(content).toBeVisible({ timeout: 15_000 });

    // 验证页面没有崩溃
    const errorBoundary = page.locator('[data-testid="error-boundary"]');
    await expect(errorBoundary).toHaveCount(0);
  });

  test("E2E-011 /plugins?tab=extensions 可访问（P1-1）", async ({ page }) => {
    await page.goto("/plugins?tab=extensions");
    await page.waitForLoadState("domcontentloaded");

    // 验证 ExtensionsView 渲染
    const content = page.locator("h1, h2").first();
    await expect(content).toBeVisible({ timeout: 15_000 });

    // 验证页面没有崩溃
    const errorBoundary = page.locator('[data-testid="error-boundary"]');
    await expect(errorBoundary).toHaveCount(0);
  });

  test("E2E-012 设置页 Office 模板库渲染（P1-2）", async ({ page }) => {
    await page.goto("/settings?section=advanced");
    await page.waitForLoadState("domcontentloaded");

    const settingsHeader = page.locator("h1").first();
    await expect(settingsHeader).toBeVisible({ timeout: 15_000 });

    // 滚动到页面底部，查找 Office 模板库
    const officeSection = page.locator('text=Office 模板库').first();
    await expect(officeSection).toBeVisible({ timeout: 10_000 });

    // 验证模板卡片存在（至少有一个模板）
    const templateCards = page.locator('[data-testid^="office-template-"]');
    const cardCount = await templateCards.count();
    expect(cardCount).toBeGreaterThan(0);
  });
});
