/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

/**
 * Vitest 单元测试配置
 *
 * - 默认在 Node 环境运行纯逻辑测试
 * - 对于组件/hook 测试使用 happy-dom
 * - 通过环境变量 REACTIVER_TEST_ENV=jsdom/happy-dom 可在单个测试文件中切换
 */
export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "~": new URL("./src", import.meta.url).pathname,
    },
  },
});
