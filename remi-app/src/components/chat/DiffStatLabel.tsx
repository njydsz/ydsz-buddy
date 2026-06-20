/**
 * @file DiffStatLabel.tsx
 * @description 差异统计标签组件，显示新增和删除行数，用于变更文件树和头部差异徽章。
 */

import { memo } from "react";

/**
 * 检查差异统计是否有非零值
 * @param stat - 差异统计对象
 * @returns 是否有新增或删除行
 */
export function hasNonZeroStat(stat: { additions: number; deletions: number }): boolean {
  return stat.additions > 0 || stat.deletions > 0;
}

/**
 * DiffStatLabel 组件
 * @description 差异统计标签，显示新增和删除行数
 * @param props.additions - 新增行数
 * @param props.deletions - 删除行数
 * @param props.showParentheses - 是否显示括号
 */
export const DiffStatLabel = memo(function DiffStatLabel(props: {
  additions: number;
  deletions: number;
  showParentheses?: boolean;
}) {
  const { additions, deletions, showParentheses = false } = props;
  return (
    <>
      {showParentheses && <span className="text-muted-foreground/70">(</span>}
      <span className="text-success">+{additions}</span>
      <span className="mx-1 text-destructive">-{deletions}</span>
      {showParentheses && <span className="text-muted-foreground/70">)</span>}
    </>
  );
});
