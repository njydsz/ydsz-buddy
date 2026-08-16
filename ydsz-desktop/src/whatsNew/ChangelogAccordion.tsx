/**
 * @fileoverview 更新日志手风琴组件
 * @description 可折叠的版本历史手风琴组件,用于设置中的"版本历史"和
 *              `WhatsNewDialog`的"完整更新日志"次级视图。每行显示一个版本的摘要;
 *              展开后显示该版本的功能卡片列表。
 * @layer 展示层 —— 假设调用方已按版本降序排列条目(参见 `sortEntriesByVersionDesc`)。
 */

import { useState } from "react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { cn } from "~/lib/utils";

import { FeatureSection } from "./FeatureSection";
import type { WhatsNewEntry } from "./logic";

/**
 * 更新日志手风琴组件属性
 * @description 定义手风琴组件的配置选项
 */
export interface ChangelogAccordionProps {
  /** 更新日志条目列表 */
  readonly entries: readonly WhatsNewEntry[];
  /**
   * 默认展开的版本号。当设置时,匹配的行在挂载时展开;
   * 其他所有行初始折叠。在对话框中有用,
   * 因为我们希望安装版本的说明即使在更新日志视图中也突出显示。
   */
  readonly defaultExpandedVersion?: string | null;
  /** 额外的 CSS 类名 */
  readonly className?: string;
}

/**
 * 更新日志手风琴组件
 * @description 渲染可折叠的版本历史列表,支持默认展开指定版本
 * @param props - 组件属性
 * @returns 手风琴组件或空状态提示
 */
export function ChangelogAccordion({
  entries,
  defaultExpandedVersion = null,
  className,
}: ChangelogAccordionProps) {
  if (entries.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No release notes yet —check back after the next update.
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
 * @description 渲染单个版本的可折叠行,包含版本信息和功能列表
 * @param props - 组件属性
 * @returns 手风琴行组件
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
