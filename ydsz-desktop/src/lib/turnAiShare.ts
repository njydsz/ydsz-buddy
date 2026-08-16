/**
 * @file turnAiShare
 * @description Turn 级别 AI / 用户代码归属占比的纯函数聚合。
 *
 * 纯函数模块:不依赖 React / Zustand / Tauri,可在任意环境(浏览器/Node/Rust 侧)复用。
 *
 * ## 数据来源
 *
 * - 线程状态中的 `turnDiffSummaries: TurnDiffSummary[]`
 * - 每个 summary.files[i] 携带可选 `author: "ai" | "user" | "mixed"` 与
 *   `additions` / `deletions` 行数统计
 * - 缺省 author 视为 `"ai"`(同 `parse_diff_stats` 兜底语义一致)
 *
 * ## 公式
 *
 * 对于 `author` 明确的文件:
 *
 *   aiLines    += file.additions    (author == "ai")
 *   humanLines += file.additions    (author == "user")
 *   mixedLines += file.additions    (author == "mixed",按 50% / 50% 拆分)
 *
 * `deletions` 在 review 流程中按 author 1:1 计入对应桶(用于精细化跟踪
 * AI 改后被用户回退多少行);缺省 author 时 deletions 也归 AI(兜底一致)。
 *
 * 占比:
 *
 *   aiShare    = aiLines / (aiLines + humanLines + mixedLines)   (0..1,无数据 → null)
 *   humanShare = humanLines / total
 *   mixedShare = mixedLines / total
 *
 * ## 大厂基线
 *
 * - 负数截 0: `max(0, additions - deletions)` 防止删除主导时算出负占比
 * - author 规整: 用 `normalizeFileAuthor` 归类,空 / 未知值按 "ai" 兜底
 * - 数值稳定: `clampShare` 把 NaN / Infinity / > 1 / < 0 全部拉回合法区间
 * - 拆分 "mixed": 一半归 AI,一半归 human,总和不超 additions
 */
import type { TurnDiffFileChange, TurnDiffSummary } from "../types";

/** 文件 author 字面量,跟 `TurnDiffFileChange.author` / `OrchestrationCheckpointFileAuthor` 对齐 */
export type FileAuthor = "ai" | "user" | "mixed";

/** 兼容未知字符串,统一规整到字面量 */
export function normalizeFileAuthor(value: unknown): FileAuthor {
  if (value === "user") return "user";
  if (value === "mixed") return "mixed";
  return "ai";
}

/** 把任意数钳到 [0, 1] */
export function clampShare(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 计算单文件的归属行数(对 "mixed" 文件 50/50 拆分) */
export function splitFileAuthoredLines(file: TurnDiffFileChange): {
  ai: number;
  user: number;
  mixed: number;
} {
  const additions = Math.max(0, file.additions ?? 0);
  const deletions = Math.max(0, file.deletions ?? 0);
  // 净增行数,代表新增归属;deletions 也按归属计入(便于跟踪 AI 改后被回退量)
  const netAdditions = Math.max(0, additions - deletions);
  const author = normalizeFileAuthor(file.author);
  if (author === "ai") {
    return { ai: netAdditions, user: 0, mixed: 0 };
  }
  if (author === "user") {
    return { ai: 0, user: netAdditions, mixed: 0 };
  }
  // mixed: 一半归 AI 一半归 human,代表文件内有混存改动
  const half = Math.floor(netAdditions / 2);
  const remainder = netAdditions - half * 2;
  return { ai: half + remainder, user: half, mixed: 0 };
}

/** AI 生产占比聚合结果 */
export interface TurnAiShareStats {
  /** AI 归属的净增行数 */
  aiLines: number;
  /** 用户手工归属的净增行数 */
  humanLines: number;
  /** mixed 归属的净增行数(默认 0,因 splitFileAuthoredLines 已拆分到 ai/user) */
  mixedLines: number;
  /** 全部归属行数 = ai + user + mixed */
  totalAuthoredLines: number;
  /** AI 占比(0~1);无数据 → null(便于 UI 区分"0 占比"vs"无数据") */
  aiShare: number | null;
  /** 用户占比(0~1);无数据 → null */
  humanShare: number | null;
  /** mixed 占比(0~1);无数据 → null */
  mixedShare: number | null;
  /** 涉及的 turn 数 */
  turnCount: number;
  /** 涉及的文件数(去重) */
  fileCount: number;
  /** 数据是否为空(便于 UI 显示空态) */
  isEmpty: boolean;
}

/** 默认空结果 */
export function emptyTurnAiShareStats(): TurnAiShareStats {
  return {
    aiLines: 0,
    humanLines: 0,
    mixedLines: 0,
    totalAuthoredLines: 0,
    aiShare: null,
    humanShare: null,
    mixedShare: null,
    turnCount: 0,
    fileCount: 0,
    isEmpty: true,
  };
}

/** 聚合 turnDiffSummaries 为 AI 占比统计 */
export function computeTurnAiShare(
  turnDiffSummaries: ReadonlyArray<TurnDiffSummary> | null | undefined,
): TurnAiShareStats {
  if (!turnDiffSummaries || turnDiffSummaries.length === 0) {
    return emptyTurnAiShareStats();
  }

  let aiLines = 0;
  let humanLines = 0;
  let mixedLines = 0;
  const seenFiles = new Set<string>();

  for (const turn of turnDiffSummaries) {
    if (!turn || !Array.isArray(turn.files)) continue;
    for (const file of turn.files) {
      if (!file || typeof file.path !== "string") continue;
      seenFiles.add(file.path);
      const split = splitFileAuthoredLines(file);
      aiLines += split.ai;
      humanLines += split.user;
      mixedLines += split.mixed;
    }
  }

  const totalAuthoredLines = aiLines + humanLines + mixedLines;
  const hasData = totalAuthoredLines > 0;

  return {
    aiLines,
    humanLines,
    mixedLines,
    totalAuthoredLines,
    aiShare: hasData ? clampShare(aiLines / totalAuthoredLines) : null,
    humanShare: hasData ? clampShare(humanLines / totalAuthoredLines) : null,
    mixedShare: hasData ? clampShare(mixedLines / totalAuthoredLines) : null,
    turnCount: turnDiffSummaries.length,
    fileCount: seenFiles.size,
    isEmpty: !hasData,
  };
}

/** 格式化 AI 占比为短显示(保留 1 位小数,边界 0% / 100% 取整) */
export function formatAiSharePercent(share: number | null): string {
  if (share === null) return "—";
  const percent = share * 100;
  if (percent >= 99.95) return "100%";
  if (percent < 0.05) return "0%";
  // 全部保留 1 位小数,边界去尾零(11.0 → 11%;0.5 → 0.5%)
  return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
}
