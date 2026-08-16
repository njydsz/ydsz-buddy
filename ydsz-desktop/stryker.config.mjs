/**
 * @file stryker.config.mjs
 * @description Stryker mutation testing 配置
 *
 * 互联网大厂基线:
 *  - 覆盖率 80% 不等于"测试强";Stryker 在源码上做 N 种变异,
 *    验证每个变异都被至少一个测试"杀死"
 *  - 关键模块(状态机 / Provider 容灾 / 安全)必须达到 mutation score ≥ 70%
 *  - 不在 PR 跑(太慢,变异数 N × 测试套件运行时间),只在 nightly + dispatch
 *
 * 用法:
 *  - 安装: pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner
 *  - 跑全量:   pnpm dlx stryker run
 *  - 跑指定文件: pnpm dlx stryker run --mutate "src/lib/monitor.ts"
 *  - CI 触发:  .github/workflows/mutation-tests.yml (nightly)
 *
 * 配套:Rust 端用 cargo-mutants,在 .github/workflows/rust-mutation.yml
 *       (见 .github/scripts/run-cargo-mutants.sh)
 *
 * @type {import('@stryker-mutator/api/core').StrykerOptions}
 */
export default {
  // 变异范围:核心 lib + i18n + provider
  mutate: [
    "src/lib/monitor.ts",
    "src/lib/providerAvailability.ts",
    "src/lib/rateLimits.ts",
    "src/lib/performanceMetrics.ts",
    "src/lib/performanceBaseline.ts",
    "src/lib/webVitals.ts",
    "src/lib/storage.ts",
    "src/hooks/useAutoProviderFailover.tsx",
    "src/hooks/useProviderFailover.ts",
    "src/i18n/messages.ts",
    "src/i18n/language.ts",
  ],

  // 变异器类型
  mutator: {
    name: "typescript",
    plugins: ["@stryker-mutator/typescript-checker"],
  },

  // 用 vitest 跑测试
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },

  // TypeScript 类型检查作为轻量前置(若类型错误则跳过)
  typeCheck: {
    enabled: true,
  },

  // 报告:html + json + dashboard
  reporters: ["html", "json", "dashboard", "clear-text"],

  // dashboard reporter 推到 stryker dashboard(可选,需要 token)
  // dashboard: {
  //   project: "github.com/ydsz-org/modules-2. 环境变量 YDSZ_BOOTSTRAP_TOKEN",
  //   version: "main",
  //   // token: process.env.STRYKER_DASHBOARD_API_KEY,
  // },

  // 阈值:大厂基线 mutation score ≥ 70%
  thresholds: {
    high: 80,
    low: 70,
    break: 60,
  },

  // 性能优化
  concurrency: 4,
  concurrencyFactor: 2,

  // 超时:变异 × 测试可能很久
  timeoutMS: 60_000,
  timeoutFactor: 1.5,

  // 增量:只测变更文件
  incremental: true,
  incrementalFile: "stryker-incremental.json",

  // 排除:不要变异类型定义 / 测试文件
  ignorePatterns: ["**/*.test.{ts,tsx}", "**/*.d.ts", "**/__tests__/**"],

  // 日志
  logLevel: "info",

  // 不在 CI 必跑(单独 workflow 触发)
  // CI 环境需要:
  //   - YDSZ_RUN_MUTATION=1
  //   - 单独 workflow 触发(dispatch / nightly)
};
