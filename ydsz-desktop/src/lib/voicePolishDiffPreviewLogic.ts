/**
 * @file voicePolishDiffPreviewLogic.ts
 * @description Voice polish diff preview 的纯逻辑层。
 *
 * 提供：
 * - 裁剪展示文本(过长时省略中间,保留头尾关键变更)
 * - 解析统计数字(变更字符数 / 变更率) → 友好标签
 * - 计算倒计时窗口
 * - 计算"自动接受"剩余秒数对应的进度(0..1)
 *
 * 纯函数 + 不可变数据结构,便于单元测试。
 */

import type { PolishDiffSegment, PolishDiffStats } from "./voicePolishDiff";

/** Preview 展示窗口(毫秒): 30s 后自动接受,用户无需操作 */
export const VOICE_POLISH_PREVIEW_WINDOW_MS = 30_000;

/** 单行最大展示字符数(避免在 banner 中展示超长文本) */
export const VOICE_POLISH_PREVIEW_MAX_LINE_CHARS = 80;

/** Preview 单侧最多展示的 token 数(超长则裁剪) */
export const VOICE_POLISH_PREVIEW_MAX_TOKENS = 64;

/** 裁剪后的展示段: 表示"前段 + 省略 + 后段" */
export interface PolishDiffDisplaySegment {
  kind: PolishDiffSegment["kind"];
  text: string;
}

/** 完整裁剪结果 */
export interface PolishDiffDisplayPlan {
  /** 裁剪后的展示段(可被 added/removed 标记) */
  segments: ReadonlyArray<PolishDiffDisplaySegment>;
  /** 是否被裁剪 */
  truncated: boolean;
  /** 跳过的段数量(用于 tooltip) */
  skippedSegmentCount: number;
}

/**
 * 裁剪 diff 段用于 banner 展示。
 *
 * 策略:
 * 1. 仅展示发生变更的段(added/removed) + 前后各 4 个 kept 段作为上下文
 * 2. 变更段总文本超过 MAX_LINE_CHARS 时,省略中间、保留头尾各 MAX_LINE_CHARS/2
 * 3. 段数超过 MAX_TOKENS 时,保留前 MAX_TOKENS/2 + 后 MAX_TOKENS/2,中间用 skippedSegmentCount 计数
 */
export function planPolishDiffDisplay(
  segments: ReadonlyArray<PolishDiffSegment>,
  options: { maxTokens?: number; maxLineChars?: number } = {},
): PolishDiffDisplayPlan {
  const maxTokens = options.maxTokens ?? VOICE_POLISH_PREVIEW_MAX_TOKENS;
  const maxLineChars = options.maxLineChars ?? VOICE_POLISH_PREVIEW_MAX_LINE_CHARS;

  if (segments.length === 0) {
    return { segments: [], truncated: false, skippedSegmentCount: 0 };
  }

  // 优先策略: 先裁段数,再裁每段字符数
  let working: ReadonlyArray<PolishDiffSegment> = segments;
  let truncated = false;
  let skippedSegmentCount = 0;

  if (working.length > maxTokens) {
    const half = Math.floor(maxTokens / 2);
    const head = working.slice(0, half);
    const tail = working.slice(working.length - half);
    skippedSegmentCount = working.length - head.length - tail.length;
    working = [...head, ...tail];
    truncated = true;
  }

  // 裁剪每个变更段超长文本
  const displaySegments: PolishDiffDisplaySegment[] = working.map((segment) => {
    if (segment.kind === "kept") {
      return { kind: segment.kind, text: segment.text };
    }
    if (segment.text.length <= maxLineChars) {
      return { kind: segment.kind, text: segment.text };
    }
    const half = Math.floor(maxLineChars / 2);
    const head = segment.text.slice(0, half);
    const tail = segment.text.slice(segment.text.length - half);
    return {
      kind: segment.kind,
      text: `${head}…${tail}`,
    };
  });

  if (displaySegments.length < segments.length) {
    truncated = true;
  }

  return {
    segments: displaySegments,
    truncated,
    skippedSegmentCount,
  };
}

/** 倒计时状态 */
export interface PolishDiffCountdown {
  /** 剩余毫秒数(非负) */
  remainingMs: number;
  /** 0..1 进度: 0=刚开始,1=即将超时 */
  progress: number;
  /** 是否已超时 */
  expired: boolean;
}

/**
 * 计算倒计时窗口状态。
 *
 * @param startedAt 启动时间戳(performance.now() 或 Date.now())
 * @param now 当前时间戳
 * @param windowMs 窗口总毫秒
 */
export function computePolishDiffCountdown(
  startedAt: number,
  now: number,
  windowMs: number = VOICE_POLISH_PREVIEW_WINDOW_MS,
): PolishDiffCountdown {
  const elapsed = Math.max(0, now - startedAt);
  const remainingMs = Math.max(0, windowMs - elapsed);
  return {
    remainingMs,
    progress: windowMs > 0 ? Math.min(1, elapsed / windowMs) : 1,
    expired: remainingMs === 0,
  };
}

/** 友好化统计摘要(用于 banner 副标题) */
export interface PolishDiffSummary {
  /** 主标签: e.g. "3 changes" / "12 处修改" / "无变化" */
  label: string;
  /** 变更字符数(包含 added + removed) */
  changedChars: number;
  /** 变更率 0..1,保留 2 位小数 */
  changeRatio: number;
  /** 是否有真实变更 */
  hasChanges: boolean;
}

interface SummarizePolishDiffInput {
  stats: PolishDiffStats;
  locale: "zh" | "en";
}

/**
 * 将 stats 转为友好摘要。
 *
 * - locale=zh: "3 处修改 · 变更率 24%"
 * - locale=en: "3 changes · 24% modified"
 */
export function summarizePolishDiff({ stats, locale }: SummarizePolishDiffInput): PolishDiffSummary {
  const percent = Math.round(stats.changeRatio * 100);
  if (stats.changedChars === 0) {
    return {
      label: locale === "zh" ? "未检测到需要润色的差异" : "No changes detected",
      changedChars: 0,
      changeRatio: 0,
      hasChanges: false,
    };
  }
  const changeCount = locale === "zh" ? `${stats.segmentCount} 处修改` : `${stats.segmentCount} change${stats.segmentCount === 1 ? "" : "s"}`;
  const ratioText = locale === "zh" ? `变更率 ${percent}%` : `${percent}% modified`;
  return {
    label: `${changeCount} · ${ratioText}`,
    changedChars: stats.changedChars,
    changeRatio: stats.changeRatio,
    hasChanges: true,
  };
}
