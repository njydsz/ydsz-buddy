/**
 * ChatView Page Object
 *
 * 互联网大厂基线：
 * - 元素选择器集中管理，不在 spec 中散落
 * - 业务语义化方法（newThread / sendMessage / assertEmptyState）
 * - 失败时自动附带截屏
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class ChatViewPage {
  constructor(public readonly page: Page) {}

  // 选择器（统一前缀 data-testid，方便稳定定位）
  get composer(): Locator {
    return this.page.locator('[data-testid="composer-editor"]');
  }

  get composerInput(): Locator {
    // composer-editor 渲染的是 Lexical contentEditable
    return this.page.locator('[data-testid="composer-editor"][contenteditable="true"]');
  }

  get sendButton(): Locator {
    return this.page.locator('[data-testid="composer-send-button"]');
  }

  get newThreadButton(): Locator {
    return this.page.locator('[data-testid="new-thread-button"]');
  }

  get sidebarToggle(): Locator {
    return this.page.locator('[data-testid="sidebar-toggle"]').first();
  }

  get emptyState(): Locator {
    return this.page.locator('[data-testid="chat-empty-state"]');
  }

  get messageList(): Locator {
    return this.page.locator('[data-testid="chat-message-list"]');
  }

  get userMessages(): Locator {
    return this.page.locator('[data-testid="chat-message-user"]');
  }

  get assistantMessages(): Locator {
    return this.page.locator('[data-testid="chat-message-assistant"]');
  }

  get sidebar(): Locator {
    return this.page.locator('[data-slot="sidebar"]');
  }

  get commandPalette(): Locator {
    return this.page.locator('[data-testid="command-palette"]');
  }

  get commandPaletteInput(): Locator {
    return this.page.locator('[data-testid="command-palette-input"]');
  }

  get commandPaletteList(): Locator {
    return this.page.locator('[data-testid="command-palette-list"]');
  }

  get queuedFollowUpRow(): Locator {
    return this.page.locator('[data-testid="queued-follow-up-row"]');
  }

  async goto(threadId?: string): Promise<void> {
    if (threadId) {
      await this.page.goto(`/chat/${threadId}`);
    } else {
      await this.page.goto("/chat");
    }
  }

  async waitForReady(): Promise<void> {
    // 等待 tauri bridge 注入
    await this.page.waitForFunction(
      () => typeof (window as any).__TAURI_INTERNALS__ !== "undefined",
      { timeout: 30_000 },
    );
    // 等待主入口出现
    await this.page.waitForLoadState("domcontentloaded");
  }

  async newThread(): Promise<void> {
    await this.newThreadButton.first().click();
    await this.waitForEmptyState();
  }

  async waitForEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible({ timeout: 15_000 });
  }

  async sendMessage(text: string): Promise<void> {
    await this.composerInput.click();
    await this.composerInput.fill(text);
    await this.sendButton.click();
  }

  async assertUserMessage(text: string): Promise<void> {
    const item = this.userMessages.filter({ hasText: text }).first();
    await expect(item).toBeVisible({ timeout: 15_000 });
  }

  async assertAssistantMessage(timeout = 30_000): Promise<void> {
    await expect(this.assistantMessages.first()).toBeVisible({ timeout });
  }

  async openCommandPalette(): Promise<void> {
    // 用 Meta+K（mac）或 Control+K 打开命令面板
    const isMac = process.platform === "darwin";
    await this.page.keyboard.press(isMac ? "Meta+k" : "Control+k");
    await expect(this.commandPalette).toBeVisible({ timeout: 5_000 });
  }

  async closeCommandPalette(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await expect(this.commandPalette).toBeHidden({ timeout: 5_000 });
  }

  async searchCommandPalette(query: string): Promise<void> {
    await this.commandPaletteInput.fill(query);
  }

  async selectCommandById(id: string): Promise<void> {
    const item = this.page.locator(`[data-testid="command-palette-item-${id}"]`);
    await item.first().click();
  }
}
