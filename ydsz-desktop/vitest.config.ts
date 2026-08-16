import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// vitest 配置：与 vite.config.ts 共享 alias，启用 happy-dom + 覆盖率。
// 覆盖范围按"核心 lib + 关键 hooks + 关键组件"分层收敛，
// 不对 UI 组件全集做卡点（UI 走 Storybook，见 P1-2）。
//
// Projects 定义在 `vitest.workspace.ts`，此处保留单 project 默认行为以兼容
// `vitest run` 不带 --project 的场景。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
      "@ydsz-buddy/contracts": path.resolve(__dirname, "./src/contracts/index.ts"),
      "@njydsz/shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  test: {
    name: "default",
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // 真实 API E2E 测试需要外部 API Key 与 @tauri-apps/plugin-http，
    // 默认 CI 跑不到（也不应该跑），通过 YDSZ_E2E_REAL_API=1 显式开启。
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/providerE2ETurnReal.test.ts",
      "**/providerE2EDomestic.test.ts",
      "**/providerE2ECodexOpenCode.test.ts",
    ],
    // 配置 React act 环境,避免 @testing-library/react 16 警告
    setupFiles: ["./test/setup/react-act-env.ts"],
    // bench 单独声明，pnpm bench 调用
    bench: {
      include: ["src/**/*.bench.{ts,tsx}"],
      outputJson: "target/bench-ts.json",
    },
    // happy-dom 在 vitest 4 下需要显式指定
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: false,
        },
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**/*.ts",
        "src/shared/**/*.ts",
        "src/hooks/**/*.ts",
        "src/contracts/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.browser.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/main.tsx",
        "src/routeTree.gen.ts",
        "src/lib/_write_terminalContext.{cjs,mjs}",
      ],
      // 互联网大厂基线：核心 lib 卡高门槛，UI 走视觉回归
      // 当前基线（2026-06，48 test files / 723 tests 通过）：
      //   - statements/lines: 37.2% / functions: 63.6% / branches: 79.5%
      // P1-10：按 module 细分(见 scripts/check-coverage-by-module.mjs)
      //   - src/lib:    lines≥70% / funcs≥75% / branches≥70% / stmts≥70%
      //   - src/shared: lines≥65% / funcs≥70% / branches≥65% / stmts≥65%
      //   - src/hooks:  lines≥60% / funcs≥65% / branches≥60% / stmts≥60%
      //   - src/contracts: lines≥50% / funcs≥60% / branches≥55% / stmts≥50%
      //   - patch 模式(更严,对应 codecov.yml patch 80%): 见脚本 --strict
      //
      // perFile 设为 true 避免单文件 0 覆盖(基本盘);
      // 详细按 module 的细分通过 `pnpm coverage:check-modules` 走自定义脚本。
      thresholds: {
        lines: 35,
        functions: 60,
        branches: 60,
        statements: 35,
        perFile: true,
      },
    },
  },
});
