/**
 * 主题 Page Object
 *
 * 测试覆盖：
 * - 浅色 / 深色 / 跟随系统 三种模式
 * - 模式切换后 `<html data-theme-mode>` 同步
 * - 模式切换后 `<html class="dark">` 同步
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type ThemeMode = "light" | "dark" | "system";

export class ThemePage {
  constructor(public readonly page: Page) {}

  /**
   * 读取当前主题模式（从 <html data-theme-mode> 读取）
   */
  async getCurrentMode(): Promise<ThemeMode | null> {
    const mode = await this.page.evaluate(() => {
      return document.documentElement.getAttribute("data-theme-mode");
    });
    return (mode as ThemeMode | null) ?? null;
  }

  /**
   * 读取当前深色 class（dark / not dark）
   */
  async isDarkActive(): Promise<boolean> {
    return this.page.evaluate(() => {
      return document.documentElement.classList.contains("dark");
    });
  }

  /**
   * 通过 localStorage 直接设置主题模式（不依赖任何 UI 控件）
   * 这在 P1 E2E 中用于稳定地验证 theme 切换的副作用
   *
   * 实现原理：触发与 useTheme 相同的 localStorage 写路径
   * useTheme 会读取 `ydsz-buddy:theme` 并重新投影
   */
  async setModeViaStorage(mode: ThemeMode): Promise<void> {
    await this.page.evaluate((m) => {
      // 写入 localStorage 触发 useTheme 的 storage event 监听
      const key = "ydsz-buddy:theme";
      const existing = localStorage.getItem(key);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = existing ? JSON.parse(existing) : {};
      } catch {
        parsed = {};
      }
      parsed.mode = m;
      // 保留 chromeThemes / codeThemeIds
      localStorage.setItem(key, JSON.stringify(parsed));
      // 手动派发 storage event，让 useTheme 立即同步
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: JSON.stringify(parsed),
          storageArea: localStorage,
        }),
      );
    }, mode);
  }

  /**
   * 等待 <html data-theme-mode> 变为期望值
   */
  async waitForMode(mode: ThemeMode, timeout = 5_000): Promise<void> {
    await expect
      .poll(async () => this.getCurrentMode(), { timeout, intervals: [100, 200, 500] })
      .toBe(mode);
  }

  /**
   * 等待 dark class 与期望一致
   */
  async waitForDarkClass(expected: boolean, timeout = 5_000): Promise<void> {
    await expect
      .poll(async () => this.isDarkActive(), { timeout, intervals: [100, 200, 500] })
      .toBe(expected);
  }
}
