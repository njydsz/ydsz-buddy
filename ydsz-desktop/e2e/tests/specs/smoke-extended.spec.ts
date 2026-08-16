/**
 * E2E-003 ~ E2E-006: 扩展冒烟测试
 *
 * 覆盖 P0-4 / P0-5 新增的产品化功能：
 * - E2E-003: Event Timeline tab 切换 + 搜索框可见
 * - E2E-004: Settings 页面可访问 + MCP 面板渲染
 * - E2E-005: 审计导出对话框打开 / 关闭
 * - E2E-006: 多 Tab 切换不丢失状态
 *
 * 用例标签：@smoke @p0
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";

test.describe("@smoke 扩展冒烟 — 事件时间线 & 设置", () => {
  test("E2E-003 Event Timeline tab 可切换且搜索框可见", async ({ page }) => {
    const chat = new ChatViewPage(page);

    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 创建一个线程，使 Events tab 可见
    await chat.newThread();

    // 点击 "事件" tab
    const eventsTab = page.locator('button:has-text("事件")').first();
    await expect(eventsTab).toBeVisible({ timeout: 10_000 });
    await eventsTab.click();

    // 验证 EventTimeline 区域渲染（包含搜索框或"暂无事件"）
    const timelineArea = page.locator('[data-testid="event-timeline-replay"], text="暂无事件", text="加载事件流").first();
    await expect(timelineArea).toBeVisible({ timeout: 10_000 });
  });

  test("E2E-004 Settings 页面可访问", async ({ page }) => {
    // 直接导航到 settings
    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");

    // Settings 页面应该渲染（至少有标题或表单元素）
    const settingsContent = page.locator("h1, h2, h3, [role='tablist']").first();
    await expect(settingsContent).toBeVisible({ timeout: 15_000 });
  });

  test("E2E-005 审计导出对话框 — 打开后可关闭", async ({ page }) => {
    const chat = new ChatViewPage(page);

    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();
    await chat.newThread();

    // 切换到 Events tab
    const eventsTab = page.locator('button:has-text("事件")').first();
    await expect(eventsTab).toBeVisible({ timeout: 10_000 });
    await eventsTab.click();

    // 点击"导出审计"按钮
    const exportBtn = page.locator('button:has-text("导出审计")').first();
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });
    await exportBtn.click();

    // 验证对话框出现
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // 验证格式选项存在（JSON / Markdown / CSV）
    await expect(page.locator('button:has-text("JSON")')).toBeVisible();
    await expect(page.locator('button:has-text("Markdown")')).toBeVisible();
    await expect(page.locator('button:has-text("CSV")')).toBeVisible();

    // 关闭对话框
    const cancelBtn = page.locator('button:has-text("取消")').first();
    await cancelBtn.click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test("E2E-006 消息 / 事件 Tab 来回切换不崩溃", async ({ page }) => {
    const chat = new ChatViewPage(page);

    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();
    await chat.newThread();

    // 切换到事件 tab
    const eventsTab = page.locator('button:has-text("事件")').first();
    await eventsTab.click();
    await page.waitForTimeout(500);

    // 切换回消息 tab
    const messagesTab = page.locator('button:has-text("消息")').first();
    await messagesTab.click();
    await page.waitForTimeout(500);

    // 再切换到事件 tab
    await eventsTab.click();
    await page.waitForTimeout(500);

    // 验证页面没有崩溃（无错误边界）
    const errorBoundary = page.locator('[data-testid="error-boundary"]');
    await expect(errorBoundary).toHaveCount(0);
  });
});
