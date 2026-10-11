// FILE: ImagePartRenderer.tsx
// Purpose: Renders image parts in chat messages with thumbnail preview, loading/error states,
//          and Dialog-based fullscreen enlargement.
// Layer: Chat message presentation
/**
 * @file 图片消息渲染组件
 *
 * 渲染消息中的图片部分（对标 ZCode 的 ImagePart）：
 *
 * - **缩略图展示**：max-width: 100%、max-height: 300px、圆角
 * - **点击放大**：使用 shadcn Dialog 全屏预览
 * - **Alt 文本**：支持图片描述
 * - **加载中/加载失败状态**：骨架屏 + 错误提示
 *
 * ## 核心导出
 *
 * - `ImagePartRenderer`：主组件
 * - `ImagePartRendererProps`：组件 props
 *
 * ## 使用场景
 *
 * - 用户消息中的图片附件渲染
 * - 助手消息中的图片引用渲染
 *
 * ## 注意事项
 *
 * - 缩略图点击后通过 Dialog 组件放大，不依赖父级 overlay 状态
 * - 支持 Base64 Data URL 和远程 URL 两种图片来源
 */

import { memo, useState } from "react";
import { Loader2Icon, TriangleAlertIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";

interface ImagePartRendererProps {
  /** 图片源地址：Base64 Data URL 或远程 URL */
  src: string;
  /** 图片 alt 描述文本 */
  alt?: string;
  /** 文件名（用于 Dialog 标题显示） */
  name?: string;
  /** 额外的容器类名 */
  className?: string;
}

type ImageStatus = "loading" | "ready" | "error";

export const ImagePartRenderer = memo(function ImagePartRenderer({
  src,
  alt,
  name,
  className,
}: ImagePartRendererProps) {
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [dialogOpen, setDialogOpen] = useState(false);

  const accessibleName = alt?.trim() || name || "图片";

  return (
    <div className={cn("relative inline-block", className)}>
      {/* 缩略图按钮 */}
      <button
        type="button"
        className="group relative block max-w-full overflow-hidden rounded-lg border border-border/70 bg-background/50 text-left transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:border-border/70"
        aria-label={`预览图片: ${accessibleName}`}
        title={name}
        onClick={() => {
          if (status === "error") return;
          setDialogOpen(true);
        }}
        disabled={status === "error"}
      >
        {/* 加载中骨架 */}
        {status === "loading" && (
          <div className="flex h-24 w-40 items-center justify-center">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground/60" />
          </div>
        )}

        {/* 错误状态 */}
        {status === "error" && (
          <div className="flex h-24 w-40 items-center justify-center gap-2 px-3">
            <TriangleAlertIcon className="size-4 shrink-0 text-destructive/70" />
            <span className="truncate text-xs text-muted-foreground">
              图片加载失败
            </span>
          </div>
        )}

        {/* 图片本体 */}
        {status !== "error" && (
          <img
            src={src}
            alt={accessibleName}
            className={cn(
              "max-h-[300px] max-w-full object-contain transition-opacity",
              status === "loading" ? "opacity-0" : "opacity-100",
              "group-hover:opacity-90",
            )}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
            draggable={false}
          />
        )}
      </button>

      {/* 全屏预览 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup
          className="h-[100dvh] max-h-[100dvh] w-screen max-w-screen border-0 bg-black/90 p-0 sm:h-auto sm:max-h-[92vh] sm:w-auto sm:max-w-[92vw] sm:rounded-lg"
          style={{ width: "100vw", maxWidth: "100vw" }}
        >
          <DialogTitle className="sr-only">{accessibleName}</DialogTitle>
          <DialogDescription className="sr-only">
            {name ? `图片: ${name}` : "图片全屏预览"}
          </DialogDescription>

          {/* 关闭按钮 */}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="absolute right-3 top-3 z-10 text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => setDialogOpen(false)}
            aria-label="关闭图片预览"
          >
            <XIcon className="size-4" />
          </Button>

          {/* 图片内容 */}
          <div className="flex h-full max-h-[100dvh] items-center justify-center p-4 sm:max-h-[92vh]">
            <img
              src={src}
              alt={accessibleName}
              className="max-h-full max-w-full select-none rounded-md object-contain"
              draggable={false}
            />
          </div>

          {/* 底部文件名信息 */}
          {name && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center px-4 pb-3">
              <span className="max-w-full truncate rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
                {name}
              </span>
            </div>
          )}
        </DialogPopup>
      </Dialog>
    </div>
  );
});
