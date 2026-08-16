/**
 * @file URL 预览卡片组件
 *
 * 本组件提供 URL 预览功能：
 *
 * - **元数据提取**：显示 URL 的标题、描述、favicon、缩略图
 * - **OpenGraph 支持**：提取 OpenGraph 元数据
 * - **双模式插入**：支持"嵌入预览"和"仅链接"两种模式
 * - **加载状态**：显示加载动画
 * - **错误处理**：元数据获取失败时显示默认卡片
 *
 * ## 核心导出
 *
 * - `UrlPreviewCard`: URL 预览卡片组件
 *
 * ## 使用场景
 *
 * - 拖拽 URL 时显示预览
 * - 粘贴 URL 时显示预览
 * - 消息中的 URL 预览
 *
 * ## 注意事项
 *
 * - 元数据抓取走后端 RPC（`url_preview.fetch_metadata`），规避 CORS 与浏览器限制
 * - 后端使用 reqwest + scraper 解析 OpenGraph meta，30 分钟 TTL 缓存
 * - RPC 调用失败（Storybook / 离线 / 后端不可用）时降级到本地模拟数据
 * - 支持减少动画偏好（prefers-reduced-motion）
 */

import { useState, useEffect } from "react";
import { cn } from "~/lib/utils";
import { useReducedMotion } from "~/hooks/useReducedMotion";
import { readNativeApi } from "~/nativeApi";
import type { UrlMetadata } from "~/contracts/urlPreview";
import { Link, ExternalLink, Loader2, AlertCircle } from "lucide-react";

/**
 * URL 预览卡片属性
 */
export interface UrlPreviewCardProps {
  /** URL 地址 */
  url: string;
  /** 插入模式：embed（嵌入预览）或 link（仅链接） */
  mode?: "embed" | "link";
  /** 模式切换回调 */
  onModeChange?: (mode: "embed" | "link") => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 从 URL 提取域名
 *
 * @param url - URL 地址
 * @returns 域名
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * 模拟获取 URL 元数据（Fallback）
 *
 * @description
 * 当后端 RPC 不可用（Storybook / 离线 / WebSocket 断开）时使用本地模拟数据，
 * 保证 VRT stories 稳定显示 EmbedCard / LinkCard 状态。
 *
 * @param url - URL 地址
 * @returns URL 元数据
 */
function fetchUrlMetadataMock(url: string): UrlMetadata {
  const domain = extractDomain(url);
  return {
    url,
    title: `Page from ${domain}`,
    description: `This is a preview of the content at ${url}`,
    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
    siteName: domain,
  };
}

/**
 * 获取 URL 元数据
 *
 * @description
 * 优先走后端 RPC（`url_preview.fetch_metadata`），后端使用 reqwest + scraper
 * 解析 OpenGraph meta，30 分钟 TTL 缓存。RPC 调用失败时降级到本地模拟数据。
 *
 * @param url - URL 地址
 * @returns URL 元数据 Promise
 */
async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  try {
    const nativeApi = readNativeApi();
    if (nativeApi?.urlPreview?.fetchMetadata) {
      return await nativeApi.urlPreview.fetchMetadata({ url });
    }
  } catch (err) {
    // RPC 调用失败（WebSocket 断开 / Storybook 环境），降级到模拟数据
    console.warn("[UrlPreviewCard] RPC fetchMetadata failed, falling back to mock:", err);
  }
  return fetchUrlMetadataMock(url);
}

/**
 * 加载状态卡片
 */
function LoadingCard() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/80 p-4 backdrop-blur-sm">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <div className="flex-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

/**
 * 错误状态卡片
 */
function ErrorCard({ url }: { url: string }) {
  const domain = extractDomain(url);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{domain}</div>
        <div className="mt-1 text-xs text-muted-foreground">无法获取预览</div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-primary hover:underline"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

/**
 * 嵌入模式卡片
 */
function EmbedCard({ metadata }: { metadata: UrlMetadata }) {
  const domain = extractDomain(metadata.url);

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm transition-shadow hover:shadow-md">
      {/* 缩略图 */}
      {metadata.thumbnail && (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={metadata.thumbnail}
            alt={metadata.title ?? "Preview"}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* 内容 */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Favicon */}
          {metadata.favicon && (
            <img
              src={metadata.favicon}
              alt=""
              className="h-5 w-5 shrink-0 rounded"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}

          <div className="min-w-0 flex-1">
            {/* 标题 */}
            <div className="line-clamp-2 text-sm font-medium text-foreground">
              {metadata.title ?? domain}
            </div>

            {/* 描述 */}
            {metadata.description && (
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {metadata.description}
              </div>
            )}

            {/* 域名 */}
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Link className="h-3 w-3" />
              <span className="truncate">{domain}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 链接模式卡片
 */
function LinkCard({ metadata }: { metadata: UrlMetadata }) {
  const domain = extractDomain(metadata.url);

  return (
    <a
      href={metadata.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-border/50 bg-background/80 p-3 backdrop-blur-sm transition-colors hover:bg-muted/50"
    >
      {/* Favicon */}
      {metadata.favicon && (
        <img
          src={metadata.favicon}
          alt=""
          className="h-4 w-4 shrink-0 rounded"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}

      {/* 链接文本 */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground group-hover:text-primary">
          {metadata.title ?? domain}
        </div>
        <div className="truncate text-xs text-muted-foreground">{domain}</div>
      </div>

      {/* 外部链接图标 */}
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
    </a>
  );
}

/**
 * URL 预览卡片组件
 *
 * @param props - 组件属性
 * @returns React 组件
 *
 * @example
 * ```tsx
 * <UrlPreviewCard
 *   url="https://example.com"
 *   mode="embed"
 *   onModeChange={(mode) => console.log(mode)}
 * />
 * ```
 */
export function UrlPreviewCard({
  url,
  mode = "embed",
  className,
}: UrlPreviewCardProps) {
  const [metadata, setMetadata] = useState<UrlMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      setLoading(true);
      setError(false);

      try {
        const data = await fetchUrlMetadata(url);
        if (!cancelled) {
          setMetadata(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div
        className={cn("transition-opacity", className)}
        style={{
          animation: prefersReducedMotion ? "none" : "fadeIn 200ms ease-out",
        }}
      >
        <LoadingCard />
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div
        className={cn("transition-opacity", className)}
        style={{
          animation: prefersReducedMotion ? "none" : "fadeIn 200ms ease-out",
        }}
      >
        <ErrorCard url={url} />
      </div>
    );
  }

  return (
    <div
      className={cn("transition-opacity", className)}
      style={{
        animation: prefersReducedMotion ? "none" : "fadeIn 200ms ease-out",
      }}
    >
      {mode === "embed" ? <EmbedCard metadata={metadata} /> : <LinkCard metadata={metadata} />}
    </div>
  );
}
