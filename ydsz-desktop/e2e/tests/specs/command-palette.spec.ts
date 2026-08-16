/**
 * E2E-P1-002: 命令面板（Cmd/Ctrl+K）打开/搜索/关闭
 *
 * 验证：
 * 1. Cmd+K（mac）或 Ctrl+K（其它）打开命令面板
 * 2. 输入查询触发模糊搜索
 * 3. Esc 关闭命令面板
 *
 * 用例标签：@p1 @command-palette
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";
import { CommandPalettePage } from "../page-objects/command-palette.page";

test.describe("@p1 命令面板", () => {
  test("E2E-P1-002 Cmd/Ctrl+K 打开 → 输入查询 → Esc 关闭", async ({ page }) => {
    const chat = new ChatViewPage(page);
    const palette = new CommandPalettePage(page);

    // 1. 启动
    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 2. 打开命令面板
    await palette.open();

    // 3. 输入模糊搜索 query
    await palette.search("新");

    // 4. 等待至少一个匹配项
    await palette.waitForAtLeastOneItem();

    // 5. 关闭命令面板
    await palette.close();

    // 6. 再次打开仍可用（防止上次输入残留）
    await palette.open();
    // 关闭后应清空 query
    const inputValue = await palette.input.inputValue();
    expect(inputValue).toBe("");
  });
});
