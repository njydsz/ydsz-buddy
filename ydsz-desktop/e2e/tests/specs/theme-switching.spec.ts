/**
 * E2E-P1-001: 主题模式切换
 *
 * 验证 <html data-theme-mode> / .dark class 同步，
 * 确保 useTheme Hook 真的把状态投影到 DOM。
 *
 * 用例标签：@p1 @theme
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";
import { ThemePage } from "../page-objects/theme.page";

test.describe("@p1 主题模式切换", () => {
  test("E2E-P1-001 浅色/深色/系统模式切换同步到 <html>", async ({ page }) => {
    const chat = new ChatViewPage(page);
    const theme = new ThemePage(page);

    // 1. 启动 → 加载 ChatView
    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 2. 初始状态：默认 system 模式，data-theme-mode 应为 "system"
    await expect.poll(async () => theme.getCurrentMode()).toBe("system");

    // 3. 切到 light
    await theme.setModeViaStorage("light");
    await theme.waitForMode("light");
    // light 模式不应用 dark class
    await theme.waitForDarkClass(false);

    // 4. 切到 dark
    await theme.setModeViaStorage("dark");
    await theme.waitForMode("dark");
    // dark 模式必须应用 .dark class
    await theme.waitForDarkClass(true);

    // 5. 切回 system
    await theme.setModeViaStorage("system");
    await theme.waitForMode("system");
  });
});
