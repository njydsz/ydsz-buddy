// vitest workspace 配置
//
// 定义多个 project：
// - default: happy-dom 单元 / 集成测试（CI 必跑）
// - browser: @vitest/browser 真实浏览器测试（CI 必跑，pnpm test:browser）
//
// ## 使用方式
//
// ```sh
// pnpm test                    # 仅 default project
// pnpm test --project browser  # 仅 browser project
// pnpm test:browser            # 等价于 vitest run --project browser
// ```
//
// 详细配置（plugins/alias/coverage 等）从 `vitest.config.ts` 通过 `extends: true` 继承。

import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "default",
      // vitest.config.ts 已经设置了 include / environment / coverage
      // 此处只覆盖 name 字段
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "browser",
      // 浏览器测试：*.browser.test.{ts,tsx}
      include: ["src/**/*.browser.test.{ts,tsx}"],
      // 排除 happy-dom（与 browser 互斥）
      environment: undefined,
      environmentOptions: {},
      // 关闭 default 项目的 coverage（browser 单独采集）
      coverage: {
        enabled: false,
      },
      // @vitest/browser 配置
      browser: {
        enabled: true,
        provider: "playwright",
        // 浏览器二进制：playwright/chromium
        // CI 中通过 `pnpm test:browser:install` 安装
        name: "chromium",
        headless: true,
        // 多个 spec 共享同一浏览器实例，加快 CI 速度
        isolate: false,
        ui: false,
      },
    },
  },
]);
