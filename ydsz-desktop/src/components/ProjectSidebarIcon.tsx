// FILE: ProjectSidebarIcon.tsx
// Purpose: Render the standard project folder icon with an optional favicon badge overlay.
// Layer: Sidebar UI component
// Exports: ProjectSidebarIcon
/**
 * @file 项目侧栏图标
 *
 * 侧边栏中项目的统一图标：
 *
 * - **闭合文件夹**：默认外观
 * - **favicon 覆盖**：如果项目根目录有 `favicon.ico`，叠加显示
 * - **缓存**：通过 `Map<projectId, boolean>` 记忆是否存在 favicon
 *
 * ## 核心导出
 *
 * - `ProjectSidebarIcon`：图标组件
 *
 * ## 使用场景
 *
 * - Sidebar 项目列表
 * - SidebarHeaderNavigationControls 内部
 *
 * ## 注意事项
 *
 * - 通过 `tauriBridge` 与环境变量获取 WebSocket origin
 * - favicon 检测使用 HEAD 请求避免下载
 */
import { useEffect, useState } from "react";
import { HiOutlineFolderOpen } from "react-icons/hi2";
import { tauriBridge } from "../lib/tauri-bridge";
import { FolderClosed } from "./FolderClosed";

const projectFaviconPresence = new Map<string, boolean>();

function resolveServerHttpOrigin(): string {
  if (typeof window === "undefined") return "";

  const bridgeWsUrl = tauriBridge.getCachedWsUrl?.();
  const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const wsCandidate =
    typeof bridgeWsUrl === "string" && bridgeWsUrl.length > 0
      ? bridgeWsUrl
      : typeof envWsUrl === "string" && envWsUrl.length > 0
        ? envWsUrl
        : null;

  if (!wsCandidate) return window.location.origin;

  try {
    const wsUrl = new URL(wsCandidate);
    const protocol =
      wsUrl.protocol === "wss:" ? "https:" : wsUrl.protocol === "ws:" ? "http:" : wsUrl.protocol;
    return `${protocol}//${wsUrl.host}`;
  } catch {
    return window.location.origin;
  }
}

function resolveProjectFaviconUrl(cwd: string): string {
  const origin = resolveServerHttpOrigin();
  const url =
    origin.length > 0
      ? new URL("/api/project-favicon", origin)
      : new URL("/api/project-favicon", "http://localhost");
  url.searchParams.set("cwd", cwd);
  url.searchParams.set("fallback", "none");
  return origin.length > 0 ? url.toString() : `${url.pathname}${url.search}`;
}

export function ProjectSidebarIcon({ cwd, expanded }: { cwd: string; expanded: boolean }) {
  const faviconSrc = resolveProjectFaviconUrl(cwd);
  const [hasFavicon, setHasFavicon] = useState<boolean>(
    () => projectFaviconPresence.get(faviconSrc) === true,
  );
  const FolderGlyph = expanded ? HiOutlineFolderOpen : FolderClosed;

  // Probe with Image() so desktop/file-origin behaves like the actual visible <img>.
  useEffect(() => {
    const cached = projectFaviconPresence.get(faviconSrc);
    if (cached !== undefined) {
      setHasFavicon(cached);
      return;
    }

    let cancelled = false;
    const image = new Image();
    const handleLoad = () => {
      projectFaviconPresence.set(faviconSrc, true);
      if (!cancelled) {
        setHasFavicon(true);
      }
    };
    const handleError = () => {
      projectFaviconPresence.set(faviconSrc, false);
      if (!cancelled) {
        setHasFavicon(false);
      }
    };

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);

    image.src = faviconSrc;

    return () => {
      cancelled = true;
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };
  }, [faviconSrc]);

  return (
    <>
      <FolderGlyph className="size-4" />
      {hasFavicon ? (
        <img
          src={faviconSrc}
          alt=""
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 size-3 rounded-[4px] object-contain shadow-sm"
          onError={() => {
            projectFaviconPresence.set(faviconSrc, false);
            setHasFavicon(false);
          }}
        />
      ) : null}
    </>
  );
}
