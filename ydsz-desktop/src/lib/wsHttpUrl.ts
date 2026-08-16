/**
 * @file WebSocket HTTP URL 解析模块
 *
 * 本模块提供从 WebSocket 连接解析对应的 HTTP URL 的功能，
 * 用于桌面端发起带认证令牌的 HTTP 请求（如附件下载、本地图片加载）。
 *
 * ## 核心导出
 *
 * - `resolveWsHttpUrl`：将相对路径解析为完整的 HTTP URL
 * - `toAttachmentPreviewUrl`：将附件 URL 转换为可预览的 URL
 *
 * ## 使用场景
 *
 * - `<img>` 标签加载本地图片（桌面端 custom protocol 问题）
 * - `<a download>` 下载附件
 * - 任何需要服务端认证的 HTTP 请求
 *
 * ## 注意事项
 *
 * - 桌面端页面通过 custom protocol 加载，相对路径无法到达服务端
 * - 自动携带 WebSocket 连接中的 legacy token 查询参数
 */
import { tauriBridge } from "./tauri-bridge";

/**
 * 解析 WebSocket URL 为对应的 HTTP URL
 *
 * 提取 WebSocket URL 中的协议、主机和认证令牌，
 * 生成可用于 HTTP 请求的完整 URL。
 *
 * @param rawPath - 原始路径（如 "/api/attachments/..."）
 * @returns 完整的 HTTP URL
 */
export function resolveWsHttpUrl(rawPath: string): string {
  if (typeof window === "undefined") return rawPath;
  const bridgeWsUrl = tauriBridge.getCachedWsUrl?.() ?? null;
  const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const wsCandidate =
    typeof bridgeWsUrl === "string" && bridgeWsUrl.length > 0
      ? bridgeWsUrl
      : typeof envWsUrl === "string" && envWsUrl.length > 0
        ? envWsUrl
        : null;
  if (!wsCandidate) return new URL(rawPath, window.location.origin).toString();
  try {
    const wsUrl = new URL(wsCandidate);
    const protocol =
      wsUrl.protocol === "wss:" ? "https:" : wsUrl.protocol === "ws:" ? "http:" : wsUrl.protocol;
    const httpUrl = new URL(rawPath, `${protocol}//${wsUrl.host}`);
    const legacyToken = wsUrl.searchParams.get("token");
    if (legacyToken && !httpUrl.searchParams.has("token")) {
      httpUrl.searchParams.set("token", legacyToken);
    }
    return httpUrl.toString();
  } catch {
    return new URL(rawPath, window.location.origin).toString();
  }
}

/**
 * 将附件 URL 转换为可预览的 URL
 *
 * 绝对 URL 直接返回，相对 URL 通过 resolveWsHttpUrl 转换。
 *
 * @param rawUrl - 原始附件 URL
 * @returns 可用于预览的 URL
 */
export function toAttachmentPreviewUrl(rawUrl: string): string {
  if (rawUrl.startsWith("/")) {
    return resolveWsHttpUrl(rawUrl);
  }
  return rawUrl;
}
