/**
 * @fileoverview "What's New" 弹出卡片组件
 * @description 升级后在应用左下角显示的更新提示卡片。点击卡片主体打开版本说明对话框;
 *              点击 ✕ 则静默关闭。与 IndieDevs 的 `UpdateCard` 模式一致,
 *              但为深色优先的界面做了主题适配。
 * @layer 悬浮层 —— 从根路由渲染一次,与对话框一起显示。
 */

import { type KeyboardEvent } from "react";

import { XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import type { WhatsNewEntry } from "./logic";

/**
 * "What's New" 弹出卡片属性
 * @description 定义弹出卡片的配置选项
 */
export interface WhatsNewPopoutCardProps {
  /** 当前版本的更新日志条目 */
  readonly entry: WhatsNewEntry;
  /** 当前应用版本号 */
  readonly currentVersion: string;
  /** 点击卡片主体时触发的回调,用于打开对话框 */
  readonly onOpen: () => void;
  /** 点击关闭按钮时触发的回调,用于关闭卡片 */
  readonly onDismiss: () => void;
  /** 额外的 CSS 类名 */
  readonly className?: string;
}

/**
 * "What's New" 弹出卡片组件
 * @description 小型吸引注意力的卡片。点击卡片主体作为"打开版本说明"的交互;
 *              右上角的 ✕ 是"不感兴趣" —— 两条路径都标记为已读,
 *              所以卡片不会重复提示。
 *
 *              卡片可通过键盘访问(Tab 键聚焦,Enter/Space 激活),
 *              以匹配鼠标交互,因为 base-ui 的 Dialog 否则只拥有 IndieDevs
 *              实现中的唯一触发器(他们的 `<DialogTrigger>` 包裹整个卡片)。
 * @param props - 组件属性
 * @returns 弹出卡片元素
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
        // Inline @keyframes so the popout doesn't need a tailwind plugin or
        // global stylesheet just for one 200ms fade-in.
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
          "border border-white/8 bg-popover/90 text-popover-foreground shadow-xl backdrop-blur-xl",
          "transition-[transform,box-shadow,border-color] duration-150",
          "hover:border-primary/40 hover:shadow-2xl hover:transform-[translateY(-1px)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {/* Close button. `stopPropagation` so dismissing doesn't also fire
            the card's onOpen handler. */}
        <button
          type="button"
          aria-label="Dismiss What's new"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          className={cn(
            "absolute inset-e-1.5 top-1.5 z-10 inline-flex size-6 items-center justify-center rounded-full",
            "text-muted-foreground/80 transition-colors",
            "hover:bg-(--sidebar-accent) hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          )}
        >
          <XIcon className="size-3.5" />
        </button>

        {/* Hero band: screenshot when the entry supplies one, otherwise a
            branded gradient + icon so every release still gets a polished
            visual. */}
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
          {/* Subtle bottom gradient so text below the band always reads. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b from-transparent to-popover/90"
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
