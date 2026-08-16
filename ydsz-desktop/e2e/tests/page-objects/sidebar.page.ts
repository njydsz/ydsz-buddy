/**
 * 侧边栏 Page Object
 *
 * 测试覆盖：
 * - 侧边栏折叠/展开
 * - 侧边栏导航命令（Skills / Plugins / Automations / Wiki）
 * - 侧边栏 new thread 按钮
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class SidebarPage {
  constructor(public readonly page: Page) {}

  get sidebar(): Locator {
    return this.page.locator('[data-slot="sidebar"]').first();
  }

  get sidebarWrapper(): Locator {
    return this.page.locator('[data-slot="sidebar-wrapper"]').first();
  }

  get sidebarToggle(): Locator {
    return this.page.locator('[data-testid="sidebar-toggle"]').first();
  }

  get newThreadButton(): Locator {
    return this.page.locator('[data-testid="new-thread-button"]').first();
  }

  get skillsNavButton(): Locator {
    return this.page.locator('[data-testid="sidebar-command-skills"]');
  }

  get pluginsNavButton(): Locator {
    return this.page.locator('[data-testid="sidebar-command-plugins"]');
  }

  get automationsNavButton(): Locator {
    return this.page.locator('[data-testid="sidebar-command-automations"]');
  }

  get wikiNavButton(): Locator {
    return this.page.locator('[data-testid="sidebar-command-wiki"]');
  }

  /**
   * 通过 data-state 属性读取侧边栏 open 状态
   * base-ui Sidebar 内部使用 data-state="expanded" / "collapsed"
   */
  async isExpanded(): Promise<boolean> {
    return this.page.evaluate(() => {
      const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
      if (!wrapper) return false;
      const state = wrapper.getAttribute("data-state");
      return state === "expanded" || state === null;
    });
  }

  async waitForExpanded(expected: boolean, timeout = 5_000): Promise<void> {
    await expect
      .poll(async () => this.isExpanded(), { timeout, intervals: [100, 200, 500] })
      .toBe(expected);
  }

  async toggle(): Promise<void> {
    await this.sidebarToggle.click();
  }

  async navigateToSkills(): Promise<void> {
    await this.skillsNavButton.click();
  }

  async navigateToPlugins(): Promise<void> {
    await this.pluginsNavButton.click();
  }

  async navigateToAutomations(): Promise<void> {
    await this.automationsNavButton.click();
  }

  async navigateToWiki(): Promise<void> {
    await this.wikiNavButton.click();
  }
}
