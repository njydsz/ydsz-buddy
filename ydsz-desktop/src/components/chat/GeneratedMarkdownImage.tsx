// FILE: GeneratedMarkdownImage.tsx
// Purpose: Renders Codex-generated images embedded in assistant markdown with
//          loading skeleton, hover overlay (expand/download), and inline error card.
// Layer: Web chat presentation component
// Exports: GeneratedMarkdownImage
// Notes: Pure UI; image URL building lives in `~/lib/localImageUrls`. No data
//        fetching here so the component stays trivially testable.
/**
 * @file AI 生成图片组件
 *
 * 渲染助手消息中嵌入的 AI 生成图片：
 *
 * - **加载骨架**：图片加载中显示骨架
 * - **悬浮操作**：放大 / 下载
 * - **错误卡片**：内联展示错误
 * - **本地路径**：自动拼接 cwd + 相对路径
 *
 * ## 核心导出
 *
 * - `GeneratedMarkdownImage`：主组件
 * - `GeneratedMarkdownImageProps`：组件 props
 *
 * ## 使用场景
 *
 * - ChatMarkdown 内嵌图片渲染
 *
 * ## 注意事项
 *
 * - URL 解析在 `~/lib/localImageUrls`
 * - 不负责数据获取，仅展示
 */
import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";

import { DownloadIcon, Loader2Icon, Maximize2, TriangleAlertIcon } from "~/lib/icons";

import { buildLocalImageUrl, localImageFileName } from "../../lib/localImageUrls";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

type GeneratedImageStatus = "loading" | "ready" | "error";

export interface GeneratedMarkdownImageProps {
  src: string;
  alt: string;
  cwd: string | undefined;
  onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}

export function GeneratedMarkdownImage(props: GeneratedMarkdownImageProps) {
  const { src, alt, cwd, onImageExpand } = props;
  const previewUrl = useMemo(() => buildLocalImageUrl({ src, cwd }), [src, cwd]);
  const downloadUrl = useMemo(() => buildLocalImageUrl({ src, cwd, download: true }), [src, cwd]);
  const fileName = useMemo(() => localImageFileName(src), [src]);
  const accessibleName = alt?.trim() || "Generated image";
  const [status, setStatus] = useState<GeneratedImageStatus>("loading");

  useEffect(() => {
    setStatus("loading");
  }, [previewUrl]);

  const expandImage = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      if (status === "error") {
        return;
      }
      onImageExpand?.({
        images: [{ src: previewUrl, name: fileName || accessibleName }],
        index: 0,
      });
    },
    [accessibleName, fileName, onImageExpand, previewUrl, status],
  );

  const stopPropagation = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);

  // <a download> needs a string; pass an empty string when we have no filename so
  // we still hint the browser to download instead of navigating.
  const downloadAttr = fileName || "";

  if (status === "error") {
    return (
      <span className="chat-generated-image chat-generated-image--error">
        <span className="chat-generated-image__error-icon" aria-hidden="true">
          <TriangleAlertIcon className="size-4" />
        </span>
        <span className="chat-generated-image__error-body">
          <span className="chat-generated-image__error-title">Couldn’t open this image</span>
          <span className="chat-generated-image__error-subtitle">
            The file may have moved or be unavailable.
          </span>
        </span>
        <a
          href={downloadUrl}
          download={downloadAttr}
          onClick={stopPropagation}
          className="chat-generated-image__action chat-generated-image__action--inline"
          aria-label="Download generated image"
        >
          <DownloadIcon className="size-3.5" aria-hidden="true" />
          <span>Download</span>
        </a>
      </span>
    );
  }

  return (
    <span className="chat-generated-image" data-status={status}>
      <button
        type="button"
        className="chat-generated-image__frame"
        onClick={expandImage}
        aria-label="Expand generated image"
      >
        {status === "loading" ? (
          <span className="chat-generated-image__skeleton" aria-hidden="true">
            <Loader2Icon className="size-4 animate-spin opacity-60" />
          </span>
        ) : null}
        <img
          src={previewUrl}
          alt={accessibleName}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          className="chat-generated-image__img"
        />
        <span className="chat-generated-image__overlay" aria-hidden="true">
          <span className="chat-generated-image__overlay-pill chat-generated-image__overlay-pill--expand">
            <Maximize2 className="size-3.5" />
            <span>Expand</span>
          </span>
        </span>
      </button>
      <a
        href={downloadUrl}
        download={downloadAttr}
        onClick={stopPropagation}
        onMouseDown={stopPropagation}
        className="chat-generated-image__overlay-pill chat-generated-image__overlay-pill--download"
        aria-label="Download generated image"
        title="Download"
      >
        <DownloadIcon className="size-3.5" aria-hidden="true" />
        <span>Download</span>
      </a>
    </span>
  );
}
