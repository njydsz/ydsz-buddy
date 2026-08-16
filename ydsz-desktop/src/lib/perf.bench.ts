/**
 * @file 性能基准测试（Bench）
 *
 * 互联网大厂基线：
 * - 关键热路径 <500ms（Diff 树构建 / 统计汇总 / 查找）
 * - 启动路径 <1.5s（RPC 路由派发 / 模块加载）
 * - 序列化 <200ms（典型 DTO）
 *
 * ## 用法
 *
 * ```bash
 * pnpm bench         # 运行所有 bench
 * pnpm bench -- ui   # 只跑匹配 ui 的
 * ```
 *
 * ## CI 集成
 *
 * 通过 `pnpm bench:ci` 进入 CI 模式，违反阈值时返回非 0 退出码。
 *
 * @bench:threshold_ui_tree_500ms
 * @bench:threshold_diff_stats_100ms
 * @bench:threshold_serialization_200ms
 */

import { bench, describe } from "vitest";

import {
  buildTurnDiffTree,
  flattenTurnDiffTree,
  summarizeTurnDiffStats,
} from "./turnDiffTree";
import type { TurnDiffFileChange } from "../types";

// ============================================================================
// 测试数据生成器
// ============================================================================

/**
 * 生成 N 个真实形态的文件变更样本
 *
 * 形态：
 * - src/<module>/<file>.{ts,tsx,rs,py}   60%
 * - test/<module>/<file>_test.{ts,rs}    20%
 * - docs/<chapter>/readme.md             10%
 * - .github/workflows/<name>.yml         10%
 */
function generateChanges(n: number): TurnDiffFileChange[] {
  const files: TurnDiffFileChange[] = [];
  const segments = [
    "src",
    "test",
    "docs",
    ".github",
    "scripts",
    "examples",
    "benchmarks",
    "internal",
  ];
  const modules = [
    "core",
    "api",
    "ui",
    "utils",
    "hooks",
    "components",
    "services",
    "router",
    "store",
    "ipc",
  ];
  const names = [
    "index",
    "main",
    "router",
    "store",
    "manager",
    "controller",
    "view",
    "service",
    "util",
    "helper",
  ];
  const exts = ["ts", "tsx", "rs", "py", "md", "yml", "json"];

  // 简单 LCG 保证可重复
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let i = 0; i < n; i++) {
    const seg = segments[Math.floor(rand() * segments.length)];
    const mod = modules[Math.floor(rand() * modules.length)];
    const name = names[Math.floor(rand() * names.length)];
    const ext = exts[Math.floor(rand() * exts.length)];

    let path: string;
    if (seg === ".github") {
      path = `.github/workflows/${name}-${i}.${ext}`;
    } else if (seg === "docs") {
      path = `docs/${name}-${i}.md`;
    } else {
      path = `${seg}/${mod}/${name}-${i}.${ext}`;
    }

    files.push({
      path,
      kind: i % 3 === 0 ? "added" : "modified",
      additions: Math.floor(rand() * 200),
      deletions: Math.floor(rand() * 80),
    });
  }
  return files;
}

// 预生成（避免 bench 内部产生噪声）
const SMALL = generateChanges(50);
const MEDIUM = generateChanges(500);
const LARGE = generateChanges(2000);
const XLARGE = generateChanges(10000);

// vitest bench API 在不同版本里 fn 参数签名不一致。这里用 unknown cast 规避导出差异。
function typedBench(name: string, fn: () => void, options?: Record<string, unknown>): void {
  (bench as unknown as (n: string, f: () => void, o?: Record<string, unknown>) => void)(
    name,
    fn,
    options,
  );
}

// ============================================================================
// 1) TurnDiff 树构建基准
// ============================================================================

describe("bench:turnDiffTree", () => {
  typedBench(
    "buildTurnDiffTree(small=50)",
    () => {
      buildTurnDiffTree(SMALL);
    },
    { iterations: 1000 },
  );

  typedBench(
    "buildTurnDiffTree(medium=500)",
    () => {
      buildTurnDiffTree(MEDIUM);
    },
    { iterations: 200 },
  );

  typedBench(
    "buildTurnDiffTree(large=2000)",
    () => {
      buildTurnDiffTree(LARGE);
    },
    { iterations: 50 },
  );

  typedBench(
    "buildTurnDiffTree(xlarge=10000)",
    () => {
      buildTurnDiffTree(XLARGE);
    },
    { iterations: 10 },
  );

  typedBench(
    "summarizeTurnDiffStats(medium=500)",
    () => {
      summarizeTurnDiffStats(MEDIUM);
    },
    { iterations: 5000 },
  );

  typedBench(
    "flattenTurnDiffTree(medium=500)",
    () => {
      const tree = buildTurnDiffTree(MEDIUM);
      flattenTurnDiffTree(tree);
    },
    { iterations: 200 },
  );
});

// ============================================================================
// 2) 序列化基准
// ============================================================================

describe("bench:serialization", () => {
  typedBench(
    "JSON.stringify(turnDiff[500])",
    () => {
      JSON.stringify(MEDIUM);
    },
    { iterations: 1000 },
  );

  typedBench(
    "JSON.parse(turnDiff[500])",
    () => {
      const s = JSON.stringify(MEDIUM);
      JSON.parse(s);
    },
    { iterations: 500 },
  );
});
