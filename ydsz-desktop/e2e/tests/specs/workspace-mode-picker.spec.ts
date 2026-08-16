/**
 * E2E-P2-005: Workspace landing 页面 → 选择文件夹 → 进入 chat
 *
 * 验证 Trae 风格工作区选择器：
 * 1. 进入 /workspace/{id} 后看到 [模式▾] + [选择文件夹] 两个按钮
 * 2. 模式选择器 popover 打开后能看到 local / worktree / cloud 三个选项
 * 3. cloud 选项 disabled(aria-disabled)
 * 4. 文件夹选择器未选时显示 placeholder, 已选后显示文件夹名 + 完整路径
 * 5. 模式 trigger 标签随当前 mode 切换
 *
 * 用例标签：@smoke @p1 @workspace
 *
 * 注意：本用例只覆盖 UI 渲染 + 模式切换。
 * 真实目录选择器(System dialog)在 tauri-driver / playwright 下无法直接交互，
 * 由单元测试(useWorkspaceFolderPicker.test.ts)覆盖 pickFolder 行为。
 *
 * 前置条件：localStorage 中至少存在一个 workspace 页面(由 setWorkspacePages 注入)。
 */
import { test, expect } from "../fixtures/tauri-fixture";

const MODE_PICKER = "[data-testid='workspace-mode-picker']";
const MODE_TRIGGER = "[data-testid='workspace-mode-trigger']";
const FOLDER_PICKER = "[data-testid='workspace-folder-picker']";

test.describe("@smoke Workspace landing 选择器", () => {
  test.beforeEach(async ({ page }) => {
    // 注入一个默认 workspace 到 zustand localStorage,
    // 让 /workspace/{id} 能命中 (workspaceStore 部分已升级到 v3)。
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "ydsz-buddy:workspace-pages:v2",
          JSON.stringify({
            version: 3,
            state: {
              homeDir: null,
              workspacePages: [
                {
                  id: "ws-test",
                  title: "Workspace 1",
                  layoutPresetId: "default",
                  cwd: null,
                  mode: "local",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              activeWorkspaceId: "ws-test",
            },
          }),
        );
      } catch (e) {
        // 忽略 localStorage 不可用
      }
    });
    // 直接访问 workspace 路由
    await page.goto("/workspace/ws-test");
  });

  test("E2E-P2-005 workspace 路由渲染模式 trigger + 文件夹选择器", async ({ page }) => {
    // 等待 picker 渲染
    await page.waitForSelector(MODE_PICKER, { timeout: 30_000 });

    // 1. 模式 trigger 存在
    await expect(page.locator(MODE_TRIGGER)).toBeVisible();

    // 2. 文件夹选择器存在
    await expect(page.locator(FOLDER_PICKER)).toBeVisible();

    // 3. 文件夹选择器默认显示「选择文件夹」placeholder
    await expect(page.locator(FOLDER_PICKER)).toContainText(/选择文件夹|Select folder/);
  });

  test("E2E-P2-006 模式 trigger 打开后能看到 local / worktree / cloud", async ({ page }) => {
    await page.waitForSelector(MODE_PICKER, { timeout: 30_000 });

    // 1. 点击 mode trigger 打开 popover
    await page.locator(MODE_TRIGGER).click();

    // 2. 三个选项可见
    await expect(page.locator("[data-testid='workspace-mode-option-local']")).toBeVisible();
    await expect(page.locator("[data-testid='workspace-mode-option-worktree']")).toBeVisible();
    await expect(page.locator("[data-testid='workspace-mode-option-cloud']")).toBeVisible();

    // 3. cloud 选项 disabled
    const cloudOption = page.locator("[data-testid='workspace-mode-option-cloud']");
    await expect(cloudOption).toHaveAttribute("aria-disabled", "true");
    await expect(cloudOption).toBeDisabled();

    // 4. cloud 选项显示「敬请期待」hint
    await expect(cloudOption).toContainText(/敬请期待|Coming soon/);
  });

  test("E2E-P2-007 切换 worktree 模式后 trigger 文本更新", async ({ page }) => {
    await page.waitForSelector(MODE_PICKER, { timeout: 30_000 });

    // 1. 打开 popover
    await page.locator(MODE_TRIGGER).click();

    // 2. 点击 worktree 选项
    await page.locator("[data-testid='workspace-mode-option-worktree']").click();

    // 3. trigger 标签切换为「工作树」
    // 注意:popover 关闭可能有动画,等 500ms 让 popover unmount
    await page.waitForTimeout(500);
    await expect(page.locator(MODE_TRIGGER)).toContainText(/工作树|Worktree/);
  });

  test("E2E-P2-008 trigger 默认显示「本地」标签", async ({ page }) => {
    await page.waitForSelector(MODE_PICKER, { timeout: 30_000 });
    await expect(page.locator(MODE_TRIGGER)).toContainText(/本地|Local/);
  });

  test("E2E-P2-009 未选目录时显示 v3 migration 引导横幅", async ({ page }) => {
    await page.waitForSelector(MODE_PICKER, { timeout: 30_000 });
    const banner = page.locator("[data-testid='workspace-migration-hint']");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/请选择工作区目录|Pick a folder/);
  });

  test("E2E-P2-010 dismiss 横幅后不再显示", async ({ page }) => {
    await page.waitForSelector(MODE_PICKER, { timeout: 30_000 });
    const banner = page.locator("[data-testid='workspace-migration-hint']");
    await expect(banner).toBeVisible();
    await page.locator("[data-testid='workspace-migration-hint-dismiss']").click();
    await expect(banner).toBeHidden();
  });
});
