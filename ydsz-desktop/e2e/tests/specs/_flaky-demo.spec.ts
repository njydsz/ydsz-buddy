/**
 * @flaky Quarantine Demo
 *
 * 此文件演示如何将不稳定用例标记为 @flaky，
 * 它会从 stable project 中排除（CI 主线不阻塞），
 * 通过 .github/workflows/e2e-flaky.yml 单独跑（nightly / 手动）。
 *
 * 解封流程：
 *   1. 修复 flaky 用例
 *   2. 移除 @flaky 标签
 *   3. PR 触发 stable project 验证
 *   4. 3 天连续无 flaky 即可解封
 */
import { test, expect } from "../fixtures/tauri-fixture";
import { ChatViewPage } from "../page-objects/chat-view.page";

test.describe("@p1 @flaky 网络降级状态切换", () => {
  /**
   * 演示用例：模拟 Provider 降级 → 顶栏出现 Degraded 徽章
   *
   * 当前为占位用例（always pass），用于：
   *   1. 验证 quarantine 机制（用例确实从 stable 排除）
   *   2. 留作后续真正 flaky 场景的模板
   *
   * 真正的不稳定场景包括：
   *   - 大消息流式响应（依赖 Provider 真实响应）
   *   - 断网重连（依赖 happy-dom / jsdom 事件传播一致性）
   *   - 高频 useFrameRateMonitor（依赖 rAF 时序）
   */
  test("E2E-P2-FLAKY-001 @flaky Provider 降级 → 顶栏 Degraded 徽章", async ({ page }) => {
    const chat = new ChatViewPage(page);

    await chat.goto();
    await chat.waitForReady();
    await chat.waitForEmptyState();

    // 真实场景需要 mock provider 降级事件
    // 当前占位实现只验证基础能力
    expect(true).toBe(true);
  });
});
