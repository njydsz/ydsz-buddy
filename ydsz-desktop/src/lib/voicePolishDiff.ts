/**
 * @file voicePolishDiff.ts
 * @description 语音润色前/后文本对比工具。
 *
 * 用途：
 * - 用户在 Composer 中拿到润色结果时,需要看到"哪里被改了"
 * - 此模块提供轻量级 diff (基于 LCS 公共子序列)
 * - 输出结构化的 word-level diff 段,用于在 UI 中高亮新增/删除/保留部分
 *
 * 注意：
 * - 不引入重量级 diff 库 (jsdiff 等),保持 lib 体积小
 * - 处理中文/英文混合输入
 * - 对超长文本 (>10KB) 自动降级为整段替换
 */

export type PolishDiffSegmentKind = "kept" | "added" | "removed";

export interface PolishDiffSegment {
  kind: PolishDiffSegmentKind;
  /** 该段的文本内容 */
  text: string;
}

/** 极简 token 切分:中英文按词/字切分,空白作为独立 token 保留 */
function tokenize(text: string): string[] {
  if (text.length === 0) return [];
  const tokens: string[] = [];
  const regex = /[\u4e00-\u9fff]|[A-Za-z0-9_]+|\s+|[^\u4e00-\u9fff\w\s]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/**
 * 计算两个 token 序列的最长公共子序列长度表
 */
function buildLcsTable(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): number[][] {
  const m = left.length;
  const n = right.length;
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const a = left[i - 1];
      const b = right[j - 1];
      if (a === b) {
        const prev = table[i - 1]?.[j - 1] ?? 0;
        const row = table[i];
        if (row) row[j] = prev + 1;
      } else {
        const rowAbove = table[i - 1];
        const row = table[i];
        const leftVal = rowAbove?.[j] ?? 0;
        const topVal = row?.[j - 1] ?? 0;
        if (row) row[j] = Math.max(leftVal, topVal);
      }
    }
  }
  return table;
}

/**
 * 回溯 LCS 表,生成 diff 段
 */
function backtrack(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
  table: ReadonlyArray<ReadonlyArray<number>>,
): PolishDiffSegment[] {
  const segments: PolishDiffSegment[] = [];
  let i = left.length;
  let j = right.length;

  const push = (kind: PolishDiffSegmentKind, text: string) => {
    if (text.length === 0) return;
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) {
      last.text = `${last.text}${kind === "kept" ? "" : ""}${text}`;
      // 简单合并：直接拼接到上一段
      segments[segments.length - 1] = { ...last, text: last.text };
    } else {
      segments.push({ kind, text });
    }
  };

  while (i > 0 && j > 0) {
    const a = left[i - 1];
    const b = right[j - 1];
    if (a === b) {
      push("kept", a ?? "");
      i -= 1;
      j -= 1;
    } else {
      const up = table[i - 1]?.[j] ?? 0;
      const left2 = table[i]?.[j - 1] ?? 0;
      if (up >= left2) {
        push("removed", a ?? "");
        i -= 1;
      } else {
        push("added", b ?? "");
        j -= 1;
      }
    }
  }
  while (i > 0) {
    push("removed", left[i - 1] ?? "");
    i -= 1;
  }
  while (j > 0) {
    push("added", right[j - 1] ?? "");
    j -= 1;
  }
  return segments.reverse();
}

/**
 * 计算两个文本的 word-level diff 段
 * @param original 原始文本(润色前)
 * @param polished 润色后文本
 * @returns diff 段数组,顺序与原文本流一致
 */
export function diffPolishResult(original: string, polished: string): PolishDiffSegment[] {
  if (original === polished) {
    return original.length > 0 ? [{ kind: "kept", text: original }] : [];
  }
  const left = tokenize(original);
  const right = tokenize(polished);
  // 极端输入保护:超过 2000 token 时直接整段对比
  if (left.length > 2000 || right.length > 2000) {
    if (original.length === 0) return [{ kind: "added", text: polished }];
    if (polished.length === 0) return [{ kind: "removed", text: original }];
    return [
      { kind: "removed", text: original },
      { kind: "added", text: polished },
    ];
  }
  const table = buildLcsTable(left, right);
  return backtrack(left, right, table);
}

/** 简化 diff 统计 */
export interface PolishDiffStats {
  addedChars: number;
  removedChars: number;
  keptChars: number;
  /** diff 段数 */
  segmentCount: number;
  /** 实际变更的字符数(added + removed) */
  changedChars: number;
  /** 变更率:changedChars / (changedChars + keptChars) */
  changeRatio: number;
}

/**
 * 计算 diff 统计信息(添加/删除/保留字符数 + 变更率)
 */
export function summarizePolishDiff(segments: ReadonlyArray<PolishDiffSegment>): PolishDiffStats {
  let addedChars = 0;
  let removedChars = 0;
  let keptChars = 0;
  for (const segment of segments) {
    if (segment.kind === "added") addedChars += segment.text.length;
    else if (segment.kind === "removed") removedChars += segment.text.length;
    else keptChars += segment.text.length;
  }
  const totalChars = addedChars + removedChars + keptChars;
  const changedChars = addedChars + removedChars;
  const changeRatio = totalChars > 0 ? changedChars / totalChars : 0;
  return {
    addedChars,
    removedChars,
    keptChars,
    segmentCount: segments.length,
    changedChars,
    changeRatio,
  };
}

/**
 * 紧凑展示 diff 段(用于 tooltip)
 * @example compactDiff([{kind:'kept',text:'Hello '},{kind:'added',text:'World'}]) => "Hello [+World]"
 */
export function compactDiff(segments: ReadonlyArray<PolishDiffSegment>): string {
  if (segments.length === 0) return "(empty)";
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.kind === "kept") {
      parts.push(segment.text);
    } else if (segment.kind === "added") {
      parts.push(`[+${segment.text}]`);
    } else {
      parts.push(`[-${segment.text}]`);
    }
  }
  return parts.join("");
}
