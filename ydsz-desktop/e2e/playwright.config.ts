import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 配置 - 互联网大厂基线：
 * - 多项目分片（稳定用例 vs 不稳定用例隔离）
 * - 自动重试 + 严格超时 + trace 留档
 * - 多 worker 隔离
 * - JUnit XML 报告供 CI 集成
 * - @flaky 标签用例自动 quarantine，不阻塞主线
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  // 集成测试允许跨规范命名
  testMatch: /.*\.spec\.ts/,
  // 全局超时 60s
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // CI 跑 2 次，本地 0 次
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  // reporter 列表
  reporter: [
    ["list"],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["github"],
  ],
  // 全局 setup
  use: {
    // Tauri Driver 通过 WebDriver 协议暴露 http://localhost:4444
    baseURL: process.env.TAURI_WEBDRIVER_URL ?? "http://localhost:4444",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  /**
   * 多项目分片：
   * - `stable`：默认主项目，承载所有 P0/P1 用例，CI 必跑
   *   - 用 `grepInvert` 排除 @flaky 标签的用例
   * - `flaky-quarantine`：承载 @flaky 标签的不稳定用例，CI 默认不跑
   *
   * 用法：
   *   pnpm test                                       # 跑 stable
   *   pnpm test -- --project=flaky-quarantine         # 单独跑 flaky
   *   PLAYWRIGHT_GREP=@flaky pnpm test                # 通过 grep 临时跑 flaky
   */
  projects: [
    {
      name: "stable",
      testMatch: /.*\.spec\.ts/,
      // grepInvert 排除 @flaky 标签用例，stable 永远不阻塞
      grepInvert: /@flaky/,
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: {
          ignoreHTTPSErrors: true,
        },
      },
    },
    {
      name: "flaky-quarantine",
      testMatch: /.*\.spec\.ts/,
      // 仅匹配 @flaky 标签的用例
      grep: /@flaky/,
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: {
          ignoreHTTPSErrors: true,
        },
      },
    },
  ],
  // 本地启动 Tauri Driver 时的命令
  webServer: {
    command: "pnpm test:e2e:driver",
    url: "http://localhost:4444/status",
    timeout: 60_000,
    reuseExistingServer: !isCI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
