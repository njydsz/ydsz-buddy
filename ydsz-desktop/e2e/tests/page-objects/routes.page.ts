/**
 * 路由 Page Object（Skills / Wiki / Plugins / Automations）
 *
 * 测试覆盖：
 * - 直接通过 URL 跳转到目标路由
 * - 验证目标视图的 data-testid 渲染
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class RoutesPage {
  constructor(public readonly page: Page) {}

  get skillsView(): Locator {
    return this.page.locator('[data-testid="skills-view"]');
  }

  get wikiView(): Locator {
    return this.page.locator('[data-testid="wiki-view"]');
  }

  async gotoSkills(): Promise<void> {
    await this.page.goto("/plugins?tab=skills");
    await expect(this.skillsView).toBeVisible({ timeout: 15_000 });
  }

  async gotoPlugins(): Promise<void> {
    await this.page.goto("/plugins?tab=plugins");
  }

  async gotoWiki(): Promise<void> {
    await this.page.goto("/wiki");
  }

  async gotoAutomations(): Promise<void> {
    await this.page.goto("/automations");
  }
}
