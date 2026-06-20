/**
 * @file "新增内容"浮窗卡片组件
 * @description 更新后显示在应用左下角的浮窗卡片。点击卡片主体打开发布说明弹窗；
 * 点击 ✕ 静默关闭更新提示。参照 IndieDevs `UpdateCard` 模式，
 * 但针对深色优先界面进行了主题适配。
 * @layer 浮层——从根路由渲染一次，与弹窗并列
 */

import { type KeyboardEvent } from "react";

import { XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import type { WhatsNewEntry } from "./logic";

/** WhatsNewPopoutCard 组件属性 */
export interface WhatsNewPopoutCardProps {
  readonly entry: WhatsNewEntry;
  readonly currentVersion: string;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
  readonly className?: string;
}

/**
 * "新增内容"浮窗卡片组件
 * @description 小型注意力引导卡片。点击主体作为"打开发布说明"的操作入口；
 * 角落的 ✕ 是明确的"不感兴趣"——两条路径均标记版本为已读，卡片不会重复提示。
 *
 * 卡片支持键盘访问（Tab 停靠，Enter/Space 激活），与鼠标操作保持一致，
 * 因为 base-ui 的 Dialog 在 IndieDevs 实现中通常拥有唯一的触发器
 * （他们的 `<DialogTrigger>` 包裹整个卡片）。
 */
export function WhatsNewPopoutCard({
  entry,
  currentVersion,
  onOpen,
  onDismiss,
  className,
}: WhatsNewPopoutCardProps) {
  const heroAlt = entry.heroImageAlt ?? `What's new in v${currentVersion}`;
  const primaryFeatureTitle = entry.features[0]?.title;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-3 left-3 z-50 w-56 max-w-[calc(100vw-1.5rem)] select-none",
        "animate-[popout-in_200ms_ease-out]",
        className,
      )}
      style={{
        // 内联 @keyframes，使浮窗无需 tailwind 插件或全局样式表
        // 即可实现 200ms 的淡入效果
        animationName: "whats-new-popout-in",
      }}
    >
      <style>{`@keyframes whats-new-popout-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}`}</style>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open What's new in v${currentVersion}`}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        className={cn(
          "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl",
          "border border-white/[0.08] bg-popover/90 text-popover-foreground shadow-xl backdrop-blur-xl",
          "transition-[transform,box-shadow,border-color] duration-150",
          "hover:border-primary/40 hover:shadow-2xl hover:[transform:translateY(-1px)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {/* 关闭按钮。`stopPropagation` 使关闭操作不触发卡片的 onOpen 处理器 */}
        <button
          type="button"
          aria-label="Dismiss What's new"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          className={cn(
            "absolute end-1.5 top-1.5 z-10 inline-flex size-6 items-center justify-center rounded-full",
            "text-muted-foreground/80 transition-colors",
            "hover:bg-[var(--sidebar-accent)] hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          )}
        >
          <XIcon className="size-3.5" />
        </button>

        {/* 宣传图区域：条目提供截图时使用截图，否则使用品牌渐变 + 图标，
            确保每个版本仍能获得精致的视觉效果 */}
        <div className="relative h-24 w-full overflow-hidden">
          {entry.heroImage !== undefined ? (
            <img
              src={entry.heroImage}
              alt={heroAlt}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_140%_at_10%_0%,color-mix(in_srgb,var(--color-primary)_38%,transparent)_0%,transparent_60%),radial-gradient(100%_120%_at_100%_100%,color-mix(in_srgb,var(--color-primary)_22%,transparent)_0%,transparent_70%)]"
            >
              <img
                src="/favicon-32x32.png"
                alt=""
                aria-hidden="true"
                className="size-9 rounded-[8px] shadow-sm"
                loading="eager"
                decoding="async"
              />
            </div>
          )}
          {/* 底部渐变，确保下方文字始终可读 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-popover/90"
          />
        </div>

        <div className="flex flex-col gap-0.5 px-3 pb-3 pt-2">
          <p className="text-[11px] font-medium tracking-wide text-primary uppercase">
            New · v{currentVersion}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {primaryFeatureTitle ?? `What's new in v${currentVersion}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Find out what&rsquo;s new <span aria-hidden="true">→</span>
          </p>
        </div>
      </div>
    </div>
  );
}
