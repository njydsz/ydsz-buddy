/**
 * @file 更新日志手风琴组件
 * @description 可折叠的发布历史手风琴，用于设置页的"更新历史"界面和更新弹窗的
 * "完整更新日志"二级视图。每行展示一个版本的摘要，展开后显示该版本的
 * FeatureSection 卡片列表。
 * @layer 展示层——假设调用方已按最新优先排序（参见 `sortEntriesByVersionDesc`）
 */

import { useState } from "react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { cn } from "~/lib/utils";

import { FeatureSection } from "./FeatureSection";
import type { WhatsNewEntry } from "./logic";

/** ChangelogAccordion 组件属性 */
export interface ChangelogAccordionProps {
  readonly entries: readonly WhatsNewEntry[];
  /**
   * 默认展开的版本号。设置后，匹配的行在挂载时展开，其余行默认折叠。
   * 适用于弹窗场景，希望已安装版本的说明居中展示，即使在日志视图中也是如此。
   */
  readonly defaultExpandedVersion?: string | null;
  readonly className?: string;
}

/**
 * 更新日志手风琴组件
 * @description 渲染可折叠的发布版本列表。每个版本为一行，展开后显示该版本的功能亮点卡片。
 * 无条目时显示空状态提示。
 */
export function ChangelogAccordion({
  entries,
  defaultExpandedVersion = null,
  className,
}: ChangelogAccordionProps) {
  if (entries.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        暂无更新说明——下次更新后再来看看。
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => (
        <ChangelogAccordionRow
          key={entry.version}
          entry={entry}
          defaultOpen={entry.version === defaultExpandedVersion}
          isLast={index === entries.length - 1}
        />
      ))}
    </ul>
  );
}

/**
 * 更新日志手风琴行组件
 * @description 渲染单个版本的可折叠行，包含版本信息和功能列表
 */
function ChangelogAccordionRow({
  entry,
  defaultOpen,
  isLast,
}: {
  /** 版本条目 */
  readonly entry: WhatsNewEntry;
  /** 是否默认展开 */
  readonly defaultOpen: boolean;
  /** 是否为最后一行 */
  readonly isLast: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const featureCount = entry.features.length;
  const featureLabel = featureCount === 1 ? "1 个更新" : `${featureCount} 个更新`;

  return (
    <li className={cn(!isLast && "border-b border-border/40")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 py-3 text-left">
          <DisclosureChevron open={open} />
          <span className="flex flex-1 items-baseline gap-2">
            <span className="text-xs text-muted-foreground">{entry.date}</span>
            <span className="text-sm font-semibold text-foreground">版本 {entry.version}</span>
            <span className="text-xs text-muted-foreground/70">({featureLabel})</span>
          </span>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="flex flex-col gap-6 pb-4 pl-6 pr-1">
            {entry.features.map((feature) => (
              <FeatureSection key={feature.id} feature={feature} />
            ))}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </li>
  );
}
