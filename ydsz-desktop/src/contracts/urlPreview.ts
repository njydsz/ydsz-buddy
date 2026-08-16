/**
 * @file URL 预览契约模块
 *
 * 定义 `url_preview.fetch_metadata` RPC 的输入/输出契约。
 *
 * ## 数据流
 *
 * 1. 前端 `UrlPreviewCard` 收到 URL（拖拽/粘贴）
 * 2. 调用 `nativeApi.urlPreview.fetchMetadata({ url })`
 * 3. WebSocket RPC 到后端 `url_preview.fetch_metadata`
 * 4. 后端 reqwest 抓取 HTML + scraper 解析 OG meta
 * 5. 命中 30 分钟缓存则直接返回，否则发起 HTTP 请求
 * 6. 返回 `UrlMetadata`，前端渲染卡片
 *
 * ## 安全
 *
 * - 仅允许 http/https 协议
 * - 后端设置 User-Agent 标识
 * - 响应体大小上限 5 MB
 * - 请求超时 15 秒
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

/**
 * URL 元数据
 *
 * 与后端 `ydsz-provider::rpc_methods::handlers::url_preview::UrlMetadata` 对齐。
 * 所有可选字段在解析失败时为 `undefined`，前端应做降级处理。
 */
export const UrlMetadata = Schema.Struct({
  /** URL 地址 */
  url: TrimmedNonEmptyString,
  /** 页面标题（来自 og:title / twitter:title / `<title>`） */
  title: Schema.optional(Schema.String),
  /** 页面描述（来自 og:description / twitter:description / `<meta name="description">`） */
  description: Schema.optional(Schema.String),
  /** 网站图标 URL（来自 `<link rel="icon">`，已解析为绝对 URL） */
  favicon: Schema.optional(Schema.String),
  /** 缩略图 URL（来自 og:image / twitter:image，已解析为绝对 URL） */
  thumbnail: Schema.optional(Schema.String),
  /** 网站名称（来自 og:site_name） */
  siteName: Schema.optional(Schema.String),
});
export type UrlMetadata = typeof UrlMetadata.Type;

/**
 * `url_preview.fetch_metadata` 请求参数
 */
export const UrlPreviewFetchMetadataInput = Schema.Struct({
  /** 目标 URL（必须是 http/https） */
  url: TrimmedNonEmptyString,
  /** 是否跳过缓存直接抓取（默认 false） */
  skipCache: Schema.optional(Schema.Boolean),
});
export type UrlPreviewFetchMetadataInput = typeof UrlPreviewFetchMetadataInput.Type;
