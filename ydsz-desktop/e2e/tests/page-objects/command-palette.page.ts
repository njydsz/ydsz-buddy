/**
 * 命令面板 Page Object
 *
 * 测试覆盖：
 * - Cmd/Ctrl+K 打开/关闭
 * - 模糊搜索匹配
 * - 选择命令项
 * - 分类分组（导航/Provider/模式/技能/主题/操作）
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class CommandPalettePage {
  constructor(public readonly page: Page) {}

  get palette(): Locator {
    return this.page.locator('[data-testid="command-palette"]');
  }

  get input(): Locator {
    return this.page.locator('[data-testid="command-palette-input"]');
  }

  get list(): Locator {
    return this.page.locator('[data-testid="command-palette-list"]');
  }

  /** 获取所有可见命令项 */
  items(): Locator {
    return this.page.locator('[data-testid^="command-palette-item-"]');
  }

  async open(): Promise<void> {
    const isMac = process.platform === "darwin";
    await this.page.keyboard.press(isMac ? "Meta+k" : "Control+k");
    await expect(this.palette).toBeVisible({ timeout: 5_000 });
  }

  async close(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await expect(this.palette).toBeHidden({ timeout: 5_000 });
  }

  async search(query: string): Promise<void> {
    await this.input.fill(query);
  }

  async selectById(id: string): Promise<void> {
    const item = this.page.locator(`[data-testid="command-palette-item-${id}"]`).first();
    await item.click();
  }

  async selectByIndex(index: number): Promise<void> {
    await this.items().nth(index).click();
  }

  /** 等待匹配项数量满足期望 */
  async waitForItemCount(expected: number, timeout = 5_000): Promise<void> {
    await expect.poll(async () => this.items().count(), { timeout, intervals: [100, 200, 500] }).toBe(
      expected,
    );
  }

  /** 等待至少 1 个匹配项 */
  async waitForAtLeastOneItem(timeout = 5_000): Promise<void> {
    await expect.poll(async () => this.items().count(), { timeout, intervals: [100, 200, 500] }).toBeGreaterThan(
      0,
    );
  }
}
