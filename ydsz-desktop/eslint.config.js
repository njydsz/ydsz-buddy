/**
 * ESLint Flat Config — ydsz-buddy Desktop
 *
 * 大厂基线配置：
 * - TypeScript 严格类型检查
 * - React Hooks 规则强制
 * - 禁止 any 类型
 * - 禁止未使用变量
 * - import 排序规范
 * - 测试文件放宽规则
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  // ── 基础 JS 规则 ──
  js.configs.recommended,

  // ── TypeScript 严格规则 ──
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ── 全局忽略 ──
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "storybook-static/**",
      "src/contracts/_generated/**",
      "src/routeTree.gen.ts",
      "e2e/**",
      "*.config.ts",
      "*.config.js",
      "*.config.mjs",
    ],
  },

  // ── 主规则集（src 下所有 .ts/.tsx） ──
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLImageElement: "readonly",
        Event: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        DragEvent: "readonly",
        ClipboardEvent: "readonly",
        CustomEvent: "readonly",
        MessageEvent: "readonly",
        WebSocket: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        PerformanceObserver: "readonly",
        AbortController: "readonly",
        File: "readonly",
        Blob: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        ReadableStream: "readonly",
        WritableStream: "readonly",
        TransformStream: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        crypto: "readonly",
        indexedDB: "readonly",
        caches: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
    },
    rules: {
      // ── React Hooks 规则 ──
      ...reactHooks.configs.recommended.rules,

      // ── React Refresh ──
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // ── TypeScript 严格规则 ──
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // ── Import 规范 ──
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-cycle": "warn",
      "import/no-default-export": "off",

      // ── 通用规则 ──
      "no-console": [
        "warn",
        { allow: ["warn", "error"] },
      ],
      "no-debugger": "error",
      "no-unused-vars": "off",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "warn",
      "no-restricted-syntax": [
        "warn",
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message: "Avoid `as any` — use `as unknown` + type guard instead.",
        },
      ],
    },
  },

  // ── 测试文件放宽规则 ──
  {
    files: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.stories.tsx",
      "src/**/*.browser.ts",
      "src/**/*.browser.test.tsx",
      "test/**/*",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
      "react-refresh/only-export-components": "off",
    },
  },
);
