/**
 * E2E-P1-004: Composer 输入 + 消息渲染
 *
 * 验证：
 * 1. composer-editor 可输入文本
 * 2. send 按钮在有内容时可点击
 * 3. 用户消息以 data-testid="chat-message-user" 渲染
 *
 * 注：本用例只覆盖「本地状态投影」——即用户消息立刻显示在消息列表里。
 * 不依赖任何真实 Provider/网络，纯前端状态流。
 *
 * 用例标签：@p1 @composer
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";

test.describe("@p1 Composer 输入", () => {
  test("E2E-P1-004 在 composer 输入文本后看到 user message", async ({ page }) => {
    const chat = new ChatViewPage(page);

    // 1. 启动
    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    const message = "E2E 测试 hello world";

    // 2. 点击 composer 获得焦点，逐字键入
    //    对 Lexical contentEditable 必须用 keyboard.type 才能触发内部 state 更新
    await chat.composerInput.click();
    await page.keyboard.type(message);

    // 3. 验证 send 按钮变为可用
    await expect(chat.sendButton).toBeEnabled({ timeout: 5_000 });

    // 4. 点击 send
    await chat.sendButton.click();

    // 5. 验证 user message 出现
    await chat.assertUserMessage(message);

    // 6. 验证消息列表非空
    await expect(chat.messageList).toBeVisible();
    await expect(chat.userMessages).toHaveCount(1);
  });
});
