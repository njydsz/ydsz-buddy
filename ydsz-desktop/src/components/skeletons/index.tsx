/**
 * @file 骨架屏组件库
 *
 * 提供 5 类加载骨架屏组件，用于改善加载体验：
 *
 * - MessageSkeleton: 消息列表骨架
 * - DiffSkeleton: 差异面板骨架
 * - BrowserSkeleton: 浏览器面板骨架
 * - LspSkeleton: LSP 状态骨架
 * - FileTreeSkeleton: 文件树骨架
 *
 * ## 设计原则
 *
 * - 形状贴合真实内容
 * - 显示时长 > 200ms 才出现（避免闪烁）
 * - 暗色模式适配
 * - 动画流畅不阻塞主线程
 *
 * ## 使用场景
 *
 * - 数据加载中
 * - 首次渲染前
 * - 网络请求中
 */

import { memo } from "react";
import { cn } from "~/lib/utils";

interface SkeletonProps {
  /** 自定义类名 */
  className?: string;
  /** 是否显示动画 */
  animated?: boolean;
  /** 自定义样式(如 width/height) */
  style?: React.CSSProperties;
}

/**
 * 基础骨架块
 */
function SkeletonBlock({ className, animated = true, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded bg-muted",
        animated && "animate-pulse",
        className,
      )}
      style={style}
    />
  );
}

/**
 * 消息列表骨架
 */
export const MessageSkeleton = memo(function MessageSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 p-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {/* 头像 */}
          <SkeletonBlock className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            {/* 名称行 */}
            <SkeletonBlock className="h-4 w-24" />
            {/* 内容行 */}
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
});

/**
 * 差异面板骨架
 */
export const DiffSkeleton = memo(function DiffSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {/* 文件头 */}
      <div className="flex items-center gap-2">
        <SkeletonBlock className="size-4" />
        <SkeletonBlock className="h-5 w-48" />
      </div>
      {/* 代码行 */}
      <div className="space-y-1.5 font-mono text-xs">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <SkeletonBlock className="h-4 w-8 bg-muted/50" />
            <SkeletonBlock
              className={cn(
                "h-4 flex-1",
                i % 3 === 0 ? "bg-red-500/10" : i % 3 === 1 ? "bg-green-500/10" : "bg-muted",
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * 浏览器面板骨架
 */
export const BrowserSkeleton = memo(function BrowserSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* 地址栏 */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <SkeletonBlock className="size-4" />
        <SkeletonBlock className="h-8 flex-1 rounded-md" />
        <SkeletonBlock className="size-8 rounded-md" />
      </div>
      {/* 内容区 */}
      <div className="flex-1 space-y-4 p-6">
        <SkeletonBlock className="h-8 w-3/4" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-5/6" />
        <SkeletonBlock className="h-32 w-full rounded-lg" />
        <SkeletonBlock className="h-4 w-2/3" />
      </div>
    </div>
  );
});

/**
 * LSP 状态骨架
 */
export const LspSkeleton = memo(function LspSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {/* 状态行 */}
      <div className="flex items-center gap-2">
        <SkeletonBlock className="size-3 rounded-full" />
        <SkeletonBlock className="h-4 w-32" />
      </div>
      {/* 诊断列表 */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <SkeletonBlock className="mt-0.5 size-4" />
            <div className="flex-1 space-y-1">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * 文件树骨架
 */
export const FileTreeSkeleton = memo(function FileTreeSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1 p-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-1"
          style={{ paddingLeft: `${(i % 3) * 12}px` }}
        >
          <SkeletonBlock className="size-4" />
          <SkeletonBlock className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
});

/**
 * 通用行骨架
 */
export const LineSkeleton = memo(function LineSkeleton({
  width = "100%",
  height = "1rem",
  className,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <SkeletonBlock
      className={cn("w-full", className)}
      style={{ width, height }}
    />
  );
});

/**
 * 圆形骨架
 */
export const CircleSkeleton = memo(function CircleSkeleton({
  size = "2rem",
  className,
}: {
  size?: string | number;
  className?: string;
}) {
  return (
    <SkeletonBlock
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
});

/**
 * 卡片骨架
 */
export const CardSkeleton = memo(function CardSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 rounded-lg border border-border p-4", className)}>
      <SkeletonBlock className="h-5 w-3/4" />
      <SkeletonBlock className="h-4 w-full" />
      <SkeletonBlock className="h-4 w-5/6" />
      <div className="flex gap-2 pt-2">
        <SkeletonBlock className="h-8 w-20 rounded-md" />
        <SkeletonBlock className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
});
