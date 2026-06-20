/**
 * @file 功能亮点展示卡片组件
 * @description 渲染单个"新增内容"功能卡片——标题、描述、可选截图和可选的技术说明。
 * 与 IndieDevs 卡片布局一致，使更新后弹窗和设置页的发布历史共享同一视觉语言。
 * @layer 展示层——无状态、无数据获取、无存储
 */

import { cn } from "~/lib/utils";

import type { WhatsNewFeature } from "./logic";

/** FeatureSection 组件属性 */
export interface FeatureSectionProps {
  readonly feature: WhatsNewFeature;
  readonly className?: string;
}

/**
 * 功能亮点展示卡片组件
 * @description 渲染发布版本中的单个功能亮点。用于更新弹窗的主视图和更新日志手风琴的展开面板。
 *
 * 布局规则：
 *   - 标题 + 描述始终可见，位于顶部。
 *   - 图片（如有）显示在下方，使用圆角边框包裹，保持原始宽高比（不裁剪）。
 *   - 详细说明文本紧贴图片下方，以紧凑的灰色小字展示——类似"发布说明脚注"。
 */
export function FeatureSection({ feature, className }: FeatureSectionProps) {
  const hasMedia = feature.image !== undefined || feature.details !== undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-base font-semibold leading-snug text-foreground">
          {feature.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
      </div>
      {hasMedia && (
        <div className="flex flex-col gap-1.5">
          {feature.image !== undefined && (
            <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/40">
              <img
                src={feature.image}
                alt={feature.imageAlt ?? ""}
                className="h-auto w-full"
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
          {feature.details !== undefined && (
            <p className="text-xs leading-relaxed text-muted-foreground/85">{feature.details}</p>
          )}
        </div>
      )}
    </div>
  );
}
