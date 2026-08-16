/**
 * @fileoverview 功能区域组件
 * @description 渲染单个"What's New"功能卡片 …… 包含标题、描述、
 *              可选截图和可选的技术说明。与 IndieDevs 的卡片布局一致,
 *              以便更新后对话框和设置版本历史共享一个视觉词汇。
 * @layer 展示层 …… 无状态、无数据获取、无存储。
 */

import { cn } from "~/lib/utils";

import type { WhatsNewFeature } from "./logic";

/**
 * 功能区域组件属性
 * @description 定义功能卡片的配置选项
 */
export interface FeatureSectionProps {
  /** 功能特性数据 */
  readonly feature: WhatsNewFeature;
  /** 额外的 CSS 类名 */
  readonly className?: string;
}

/**
 * 功能区域组件
 * @description 版本内的单个功能卡片。在对话框的主要视图
 *              和更新日志手风琴的展开面板中渲染。
 *
 * @remarks
 * 布局规则:
 * - 标题和描述始终在顶部可见。
 * - 提供时图片在下方显示;我们用圆角边框包裹它,
 *   让其自然宽高比决定高度(不裁剪)。
 * - 详情文本紧贴在图片下方,作为紧凑的次要文本……
 *   可以把它看作"版本说明脚注",而不是正文。
 * @param props - 组件属性
 * @returns 功能卡片元素
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
