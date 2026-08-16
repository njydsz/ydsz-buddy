/**
 * E2E-A5: 崩溃恢复 E2E（kill -9 回归）
 *
 * 互联网大厂基线：
 * - 使用 Playwright + addInitScript 在导航前注入 Tauri mock，模拟"上次会话
 *   异常退出后再次启动"的真实场景。
 * - 用 page.reload() 模拟"重新启动"，验证状态是否在重启后被重新加载。
 * - 完整覆盖"检测 → 弹窗 → 操作 → 关闭"全链路。
 *
 * 用例标签：@p0 @crash-recovery @a5
 *
 * ## 实现说明
 *
 * Tauri 在 WebView init 时注入 `window.__TAURI_INTERNALS__.invoke`。
 * 本测试通过 addInitScript 在 page navigation 时 **monkey-patch**
 * `__TAURI_INTERNALS__.invoke`,使其优先走我们的 mock handler。
 * 这是因为 Tauri 的注入脚本在 init 之后才生效,我们的 script 也注入在
 * 同一 init 阶段，但通过保存原始引用 + 包装,可以无缝拦截。
 *
 * 真实场景:
 *   __TAURI_INTERNALS__.invoke = (cmd, params) => {
 *     if (MOCK_HANDLERS[cmd]) return MOCK_HANDLERS[cmd](params);
 *     return REAL_INVOKE(cmd, params);  // fallback
 *   };
 *
 * 通过 monkey-patch 我们可以:
 *   - 预设待恢复任务列表(模拟上次未完成)
 *   - 验证用户操作触发的命令和参数
 *   - 在 reload 后维持状态(模拟"上次中断"被检测到)
 */

import { test, expect, type Page } from "@playwright/test";
import { ChatViewPage } from "../page-objects/chat-view.page";

/** window 上挂载的 mock 状态对象名 */
const TauriMockState = "__ydszE2ECrashRecoveryMock" as const;

/**
 * Init script: monkey-patch __TAURI_INTERNALS__.invoke 并挂载 mock store。
 *
 * 该脚本在 page 每次 navigation 时都会重新执行（包括 reload）,
 * 但 mock store 状态会重置（因为 window 重新初始化）。
 * 这是符合预期的：每次"启动"应该读取一次持久化状态。
 */
const TAURI_MOCK_INIT_SCRIPT = `
  (() => {
    const state = {
      pendingCheckpoints: [],
      calls: [],
    };
    window.${TauriMockState} = state;

    const handlers = {
      checkpoint_list_pending: () => {
        state.calls.push({ cmd: "checkpoint_list_pending" });
        return state.pendingCheckpoints;
      },
      checkpoint_resume: (params) => {
        state.calls.push({ cmd: "checkpoint_resume", params });
        state.pendingCheckpoints = state.pendingCheckpoints.filter(
          (c) => !(c.threadId === params.threadId && c.turnId === params.turnId),
        );
        return {
          threadId: params.threadId,
          turnId: params.turnId,
          status: "resuming",
        };
      },
      checkpoint_cancel: (params) => {
        state.calls.push({ cmd: "checkpoint_cancel", params });
        state.pendingCheckpoints = state.pendingCheckpoints.filter(
          (c) => !(c.threadId === params.threadId && c.turnId === params.turnId),
        );
        return {
          threadId: params.threadId,
          turnId: params.turnId,
          status: "cancelled",
        };
      },
      checkpoint_inspect: (params) => {
        state.calls.push({ cmd: "checkpoint_inspect", params });
        return (
          state.pendingCheckpoints.find(
            (c) => c.threadId === params.threadId && c.turnId === params.turnId,
          ) || { threadId: params.threadId, turnId: params.turnId, status: "unknown" }
        );
      },
      checkpoint_cleanup_old: (params) => {
        state.calls.push({ cmd: "checkpoint_cleanup_old", params });
        return 0;
      },
      checkpoint_save: (params) => {
        state.calls.push({ cmd: "checkpoint_save", params });
        return {
          threadId: params.threadId,
          turnId: params.turnId,
          status: params.status || "running",
        };
      },
      checkpoint_update: (params) => {
        state.calls.push({ cmd: "checkpoint_update", params });
        return {
          threadId: params.threadId,
          turnId: params.turnId,
          status: "running",
        };
      },
      checkpoint_complete: (params) => {
        state.calls.push({ cmd: "checkpoint_complete", params });
        return {
          threadId: params.threadId,
          turnId: params.turnId,
          status: "completed",
        };
      },
      // get_server_ws_url 在 Tauri 中真实存在,我们 mock 成 null 走 fallback
      get_server_ws_url: () => {
        state.calls.push({ cmd: "get_server_ws_url" });
        return null;
      },
    };

    const defaultHandler = (cmd, params) => {
      state.calls.push({ cmd, params, kind: "default" });
      return null;
    };

    // 等待 __TAURI_INTERNALS__ 可用(Tauri 自身 init 可能稍晚)
    const installMock = () => {
      window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
      if (window.__TAURI_INTERNALS__.__ydszMocked) return;
      const realInvoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = (cmd, params) => {
        const handler = handlers[cmd] || defaultHandler;
        try {
          return Promise.resolve(handler(cmd, params));
        } catch (e) {
          return Promise.reject(e);
        }
      };
      window.__TAURI_INTERNALS__.transformCallback = window.__TAURI_INTERNALS__.transformCallback
        || ((cb) => {
          const id = Math.floor(Math.random() * 1e9);
          window.__TAURI_EVENT_CALLBACKS__ = window.__TAURI_EVENT_CALLBACKS__ || {};
          window.__TAURI_EVENT_CALLBACKS__[id] = cb;
          return id;
        });
      window.__TAURI_INTERNALS__.__ydszMocked = true;
    };

    // 立即尝试安装一次
    installMock();

    // 如果 Tauri 稍后才注入 __TAURI_INTERNALS__,在 DOMContentLoaded 时再装一次
    document.addEventListener("DOMContentLoaded", installMock);
    // 保险起见,再延迟一次
    setTimeout(installMock, 50);
    setTimeout(installMock, 250);
  })();
`;

/**
 * 在已加载的页面上设置 pending checkpoints
 */
async function setPendingCheckpoints(
  page: Page,
  checkpoints: ReadonlyArray<{
    threadId: string;
    turnId: string;
    summary: string;
    status?: "running" | "paused" | "failed";
    updatedAt?: string;
  }>,
): Promise<void> {
  await page.evaluate(
    ({ stateName, items }) => {
      const state = (window as any)[stateName];
      if (!state) {
        throw new Error("Tauri mock state not found. Did the init script run?");
      }
      state.pendingCheckpoints = items.map((item: any) => ({
        threadId: item.threadId,
        turnId: item.turnId,
        createdAt: item.updatedAt || "2026-06-25T00:00:00.000Z",
        updatedAt: item.updatedAt || "2026-06-25T00:00:01.000Z",
        status: item.status || "running",
        summary: item.summary,
      }));
    },
    { stateName: TauriMockState, items: checkpoints },
  );
}

interface RecordedCall {
  cmd: string;
  params?: unknown;
  kind?: string;
}

async function getCalls(page: Page): Promise<RecordedCall[]> {
  return page.evaluate((stateName) => {
    const state = (window as any)[stateName];
    return state ? state.calls : [];
  }, TauriMockState);
}

test.describe("@p0 崩溃恢复 (kill -9 回归)", () => {
  test.beforeEach(async ({ page }) => {
    // 必须在导航前注入,否则 React 在 first paint 期间已发起 invoke
    await page.addInitScript(TAURI_MOCK_INIT_SCRIPT);
  });

  test("E2E-A5-001 启动后检测到 pending checkpoint → 自动弹窗", async ({ page }) => {
    const chat = new ChatViewPage(page);

    // 预设 pending(模拟上次崩溃留下的状态)
    await page.addInitScript(
      ({ stateName, items }) => {
        const apply = () => {
          const state = (window as any)[stateName];
          if (state) {
            state.pendingCheckpoints = items;
          }
        };
        // 在 mock 安装后再注入
        document.addEventListener("DOMContentLoaded", apply);
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      },
      {
        stateName: TauriMockState,
        items: [
          {
            threadId: "thread-1",
            turnId: "turn-1",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "running",
            summary: "上次中断的代码生成任务",
          },
        ],
      },
    );

    await chat.goto();
    await chat.waitForReady();

    const dialog = page.locator('[data-testid="crash-recovery-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("上次中断的代码生成任务");
    await expect(dialog).toContainText("检测到未完成的任务");
  });

  test("E2E-A5-002 多个 pending checkpoint 同时展示", async ({ page }) => {
    const chat = new ChatViewPage(page);
    await page.addInitScript(
      ({ stateName, items }) => {
        const apply = () => {
          const state = (window as any)[stateName];
          if (state) state.pendingCheckpoints = items;
        };
        document.addEventListener("DOMContentLoaded", apply);
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      },
      {
        stateName: TauriMockState,
        items: [
          {
            threadId: "thread-1",
            turnId: "turn-1",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "running",
            summary: "代码生成任务",
          },
          {
            threadId: "thread-1",
            turnId: "turn-2",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "paused",
            summary: "测试运行任务",
          },
          {
            threadId: "thread-2",
            turnId: "turn-3",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "failed",
            summary: "文档同步任务",
          },
        ],
      },
    );

    await chat.goto();
    await chat.waitForReady();

    const dialog = page.locator('[data-testid="crash-recovery-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("代码生成任务");
    await expect(dialog).toContainText("测试运行任务");
    await expect(dialog).toContainText("文档同步任务");
    await expect(dialog).toContainText("3 个任务中断");
  });

  test("E2E-A5-003 点击「继续」触发 checkpoint_resume 并关闭弹窗", async ({
    page,
  }) => {
    const chat = new ChatViewPage(page);
    await page.addInitScript(
      ({ stateName, items }) => {
        const apply = () => {
          const state = (window as any)[stateName];
          if (state) state.pendingCheckpoints = items;
        };
        document.addEventListener("DOMContentLoaded", apply);
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      },
      {
        stateName: TauriMockState,
        items: [
          {
            threadId: "thread-1",
            turnId: "turn-1",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "running",
            summary: "继续任务",
          },
        ],
      },
    );

    await chat.goto();
    await chat.waitForReady();

    const dialog = page.locator('[data-testid="crash-recovery-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const resumeBtn = dialog.locator('button:has-text("继续")').first();
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();

    await expect(dialog).toBeHidden({ timeout: 5_000 });

    const calls = await getCalls(page);
    const resumeCall = calls.find((c) => c.cmd === "checkpoint_resume");
    expect(resumeCall).toBeTruthy();
    expect(
      (resumeCall as { params?: { threadId?: string; turnId?: string } }).params,
    ).toMatchObject({
      threadId: "thread-1",
      turnId: "turn-1",
    });
  });

  test("E2E-A5-004 点击「取消」触发 checkpoint_cancel 并关闭弹窗", async ({
    page,
  }) => {
    const chat = new ChatViewPage(page);
    await page.addInitScript(
      ({ stateName, items }) => {
        const apply = () => {
          const state = (window as any)[stateName];
          if (state) state.pendingCheckpoints = items;
        };
        document.addEventListener("DOMContentLoaded", apply);
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      },
      {
        stateName: TauriMockState,
        items: [
          {
            threadId: "thread-1",
            turnId: "turn-1",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "failed",
            summary: "要取消的任务",
          },
        ],
      },
    );

    await chat.goto();
    await chat.waitForReady();

    const dialog = page.locator('[data-testid="crash-recovery-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // 弹窗内"取消"按钮:任务级别的取消（"稍后处理"是底部按钮）
    const cancelBtn = dialog.locator('button:has-text("取消")').first();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await expect(dialog).toBeHidden({ timeout: 5_000 });

    const calls = await getCalls(page);
    const cancelCall = calls.find((c) => c.cmd === "checkpoint_cancel");
    expect(cancelCall).toBeTruthy();
    expect(
      (cancelCall as { params?: { threadId?: string; turnId?: string } }).params,
    ).toMatchObject({
      threadId: "thread-1",
      turnId: "turn-1",
    });
  });

  test("E2E-A5-005 点击「关闭」后本次会话不再自动弹", async ({ page }) => {
    const chat = new ChatViewPage(page);
    await page.addInitScript(
      ({ stateName, items }) => {
        const apply = () => {
          const state = (window as any)[stateName];
          if (state) state.pendingCheckpoints = items;
        };
        document.addEventListener("DOMContentLoaded", apply);
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      },
      {
        stateName: TauriMockState,
        items: [
          {
            threadId: "thread-1",
            turnId: "turn-1",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "running",
            summary: "稍后处理",
          },
        ],
      },
    );

    await chat.goto();
    await chat.waitForReady();

    const dialog = page.locator('[data-testid="crash-recovery-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const closeBtn = dialog.locator('button[aria-label="关闭"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // 关闭后,即使再往 mock 写入新 checkpoint,弹窗不应再自动弹出
    // (因为本会话内 dismissedRef = true)
    await setPendingCheckpoints(page, [
      {
        threadId: "thread-2",
        turnId: "turn-2",
        summary: "新任务",
        status: "running",
      },
    ]);
    await page.waitForTimeout(500);
    // dialog 仍应保持 hidden（已关闭且本会话不重弹）
    await expect(
      page.locator('[data-testid="crash-recovery-dialog"]'),
    ).toHaveCount(0);
  });

  test("E2E-A5-006 kill -9 回归:重启后从 mock 状态恢复", async ({ page }) => {
    /**
     * 模拟完整 kill -9 流程:
     * 1. 第一次启动: 设置 pending checkpoints(模拟上次崩溃)
     * 2. 应用启动后弹出对话框(确认检测机制有效)
     * 3. 不点关闭,直接 reload 模拟 "杀进程 + 重启"
     * 4. 重启后对话框再次出现(因为 dismissedRef 在新会话重置)
     * 5. 这次点击「继续」,验证从 mock 状态恢复成功
     */
    const chat = new ChatViewPage(page);
    const pendingItem = {
      threadId: "thread-recovery",
      turnId: "turn-recovery",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:01.000Z",
      status: "running",
      summary: "kill -9 回归任务",
    };

    // addInitScript 在 reload 后会自动重新执行,
    // 但 mock state 会被清空。所以我们需要再注入一次 pending。
    await page.addInitScript(
      ({ stateName, item }) => {
        const apply = () => {
          const state = (window as any)[stateName];
          if (state) state.pendingCheckpoints = [item];
        };
        document.addEventListener("DOMContentLoaded", apply);
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      },
      { stateName: TauriMockState, item: pendingItem },
    );

    // 步骤 1+2: 启动 + 弹窗
    await chat.goto();
    await chat.waitForReady();

    const dialog = page.locator('[data-testid="crash-recovery-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("kill -9 回归任务");

    // 步骤 3: 模拟 kill -9 + 重启(reload)
    // 重新预设 pending(因为 init script 会重新跑,state 也会被重建;
    // 我们已在 addInitScript 中加了自动注入逻辑)
    await page.reload();
    await chat.waitForReady();

    // 步骤 4: 重启后弹窗应再次出现
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("kill -9 回归任务");

    // 步骤 5: 点击「继续」,验证恢复成功
    const resumeBtn = dialog.locator('button:has-text("继续")').first();
    await resumeBtn.click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // 验证 checkpoint_resume 被调用(至少一次,reload 前的初次不点继续)
    const calls = await getCalls(page);
    const resumeCalls = calls.filter((c) => c.cmd === "checkpoint_resume");
    expect(resumeCalls.length).toBeGreaterThan(0);
    const lastResume = resumeCalls[resumeCalls.length - 1] as {
      params?: { threadId?: string; turnId?: string };
    };
    expect(lastResume.params).toMatchObject({
      threadId: "thread-recovery",
      turnId: "turn-recovery",
    });
  });

  test("E2E-A5-007 无 pending checkpoint 时不弹弹窗(负向)", async ({ page }) => {
    const chat = new ChatViewPage(page);

    await chat.goto();
    await chat.waitForReady();

    // 等几秒确保 useEffect 已跑完
    await page.waitForTimeout(1_500);

    await expect(
      page.locator('[data-testid="crash-recovery-dialog"]'),
    ).toHaveCount(0);

    // 验证 checkpoint_list_pending 已被调用(load 阶段)
    const calls = await getCalls(page);
    expect(calls.some((c) => c.cmd === "checkpoint_list_pending")).toBe(true);
  });

  test("E2E-A5-008 多次「继续」:逐个处理多个任务", async ({ page }) => {
    const chat = new ChatViewPage(page);
    await page.addInitScript(
      ({ stateName, items }) => {
        const apply = () => {
          const state = (window as any)[stateName];
          if (state) state.pendingCheckpoints = items;
        };
        document.addEventListener("DOMContentLoaded", apply);
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      },
      {
        stateName: TauriMockState,
        items: [
          {
            threadId: "thread-1",
            turnId: "turn-1",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "running",
            summary: "任务 A",
          },
          {
            threadId: "thread-1",
            turnId: "turn-2",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z",
            status: "paused",
            summary: "任务 B",
          },
        ],
      },
    );

    await chat.goto();
    await chat.waitForReady();

    const dialog = page.locator('[data-testid="crash-recovery-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("任务 A");
    await expect(dialog).toContainText("任务 B");

    // 第一个「继续」:处理任务 A
    const firstResume = dialog.locator('button:has-text("继续")').first();
    await firstResume.click();
    // mock 移除任务 A 后,弹窗内只剩任务 B
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText("任务 A");
    await expect(dialog).toContainText("任务 B");

    // 第二个「继续」:处理任务 B,弹窗应完全关闭
    const secondResume = dialog.locator('button:has-text("继续")').first();
    await secondResume.click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // 验证两次 resume 调用
    const calls = await getCalls(page);
    const resumeCalls = calls.filter((c) => c.cmd === "checkpoint_resume");
    expect(resumeCalls.length).toBe(2);
  });
});
