/**
 * @file formatTokenCount
 * @description 把 token / 行数等纯数字按 "1.2K / 1.5M" 形式短显示的纯函数。
 *
 * 大厂基线:
 * - 保留 1 位小数,> 1000 显示 K,> 1_000_000 显示 M
 * - 负数 / NaN / Infinity 兜底为原始数字字符串(不抛错)
 */
export function formatTokenCount(count: number): string {
  if (!Number.isFinite(count)) return "0";
  if (count < 0) return `${count}`;
  if (count >= 1_000_000) {
    const v = count / 1_000_000;
    // 避免显示 "1.0M" 之类的尾零;保留 ≤ 2 位小数
    return `${parseFloat(v.toFixed(1))}M`;
  }
  if (count >= 1_000) {
    const v = count / 1_000;
    return `${parseFloat(v.toFixed(1))}K`;
  }
  return count.toString();
}
