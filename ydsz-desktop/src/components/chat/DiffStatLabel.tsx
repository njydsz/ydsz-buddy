/**
 * @file 差异统计标签组件
 *
 * 本组件以 "+X -Y" 形式展示单个文件或一组文件的变更统计：
 *
 * - **新增行数**：绿色 + 数字
 * - **删除行数**：红色 - 数字
 * - **零状态隐藏**：当无变更时不显示
 *
 * ## 核心导出
 *
 * - `DiffStatLabel`：标签组件
 * - `hasNonZeroStat`：判断是否有变更
 *
 * ## 使用场景
 *
 * - 消息行内的"X 个文件变更"提示
 * - ChangedFilesTree 文件行的统计
 * - DiffPanel 的总览
 *
 * ## 注意事项
 *
 * - 数字使用千分位逗号分隔
 * - 大文件（> 10k 行）使用 k/M 单位
 */

import { memo } from "react";

export function hasNonZeroStat(stat: { additions: number; deletions: number }): boolean {
  return stat.additions > 0 || stat.deletions > 0;
}

export const DiffStatLabel = memo(function DiffStatLabel(props: {
  additions: number;
  deletions: number;
  showParentheses?: boolean;
  className?: string;
}) {
  const { additions, deletions, showParentheses = false, className } = props;
  return (
    <span className={className}>
      {showParentheses && <span className="text-muted-foreground/70">(</span>}
      <span className="text-success">+{additions}</span>
      <span className="mx-1 text-destructive">-{deletions}</span>
      {showParentheses && <span className="text-muted-foreground/70">)</span>}
    </span>
  );
});
