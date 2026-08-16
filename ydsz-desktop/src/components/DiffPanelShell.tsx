import type { ReactNode } from "react";

import { isDesktop } from "~/env";
import { cn } from "~/lib/utils";

import { Skeleton } from "./ui/skeleton";

/**
 * @file Diff 面板外壳
 *
 * 为 `DiffPanel` / `BrowserPanel` 等提供统一的外壳：
 *
 * - **模式适配**：`inline` / `sheet` / `sidebar` 不同的尺寸/拖拽区域
 * - **状态壳**：空 / 加载 / 错误三态占位
 * - **桌面拖拽**：桌面端在 inline/sidebar 模式开启 drag region
 *
 * ## 核心导出
 *
 * - `DiffPanelShell`：面板外壳组件
 * - `DiffPanelHeaderSkeleton`：头部骨架屏
 * - `DiffPanelLoadingState`：加载占位
 * - `DiffPanelMode`：模式类型
 *
 * ## 使用场景
 *
 * - DiffPanel 容器
 * - BrowserPanel 容器
 *
 * ## 注意事项
 *
 * - sheet 模式不使用 drag region
 * - 桌面端 inline/sidebar 自动开启 macOS 风格拖拽区
 */
export type DiffPanelMode = "inline" | "sheet" | "sidebar";

function getDiffPanelHeaderRowClassName(mode: DiffPanelMode) {
  const shouldUseDragRegion = isDesktop && mode !== "sheet";
  return cn(
    "flex items-center justify-between gap-2 px-4",
    shouldUseDragRegion ? "drag-region h-[44px] border-b border-border" : "h-12",
  );
}

export function DiffPanelShell(props: {
  mode: DiffPanelMode;
  header: ReactNode;
  children: ReactNode;
}) {
  const shouldUseDragRegion = isDesktop && props.mode !== "sheet";

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col bg-background",
        props.mode === "inline"
          ? "w-[42vw] min-w-[360px] max-w-[560px] shrink-0 border-l border-border"
          : "w-full",
      )}
    >
      {shouldUseDragRegion ? (
        <div className={getDiffPanelHeaderRowClassName(props.mode)}>{props.header}</div>
      ) : (
        <div className="border-b border-border">
          <div className={getDiffPanelHeaderRowClassName(props.mode)}>{props.header}</div>
        </div>
      )}
      {props.children}
    </div>
  );
}

export function DiffPanelHeaderSkeleton() {
  return (
    <>
      <div className="relative min-w-0 flex-1">
        <Skeleton className="absolute left-0 top-1/2 size-6 -translate-y-1/2 rounded-md border border-border/50" />
        <Skeleton className="absolute right-0 top-1/2 size-6 -translate-y-1/2 rounded-md border border-border/50" />
        <div className="flex gap-1 overflow-hidden px-8 py-0.5">
          <Skeleton className="h-6 w-16 shrink-0 rounded-md" />
          <Skeleton className="h-6 w-24 shrink-0 rounded-md" />
          <Skeleton className="h-6 w-24 shrink-0 rounded-md max-sm:hidden" />
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
      </div>
    </>
  );
}

export function DiffPanelLoadingState(props: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-2">
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/60 bg-card/25"
        role="status"
        aria-live="polite"
        aria-label={props.label}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="ml-auto h-4 w-20 rounded-full" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-10/12 rounded-full" />
            <Skeleton className="h-3 w-11/12 rounded-full" />
            <Skeleton className="h-3 w-9/12 rounded-full" />
          </div>
          <span className="sr-only">{props.label}</span>
        </div>
      </div>
    </div>
  );
}
