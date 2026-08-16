/**
 * @file Mermaid 图表渲染组件
 *
 * 懒加载 `mermaid` 库，把 mermaid 代码块渲染为 SVG 图表。
 * 支持 light/dark 主题联动，渲染失败时回退为代码块。
 *
 * ## CSP 兼容
 *
 * - `securityLevel: 'strict'` 禁止 mermaid 执行任意 HTML/JS
 * - 不从 CDN 加载字体（使用系统字体回退）
 * - 所有渲染在客户端完成，无外部网络请求
 *
 * ## 使用场景
 *
 * ChatMarkdown 中 `language-mermaid` 代码块的渲染器，
 * 支持流程图、时序图、甘特图、类图、状态图等。
 */

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTheme } from "~/hooks/useTheme";

/** mermaid 渲染失败的回退视图 */
function MermaidFallback({ code, error }: { code: string; error: string }): ReactNode {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
      <div className="mb-2 text-xs text-red-700 dark:text-red-300">
        Mermaid render failed: {error}
      </div>
      <pre className="overflow-x-auto text-xs">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** mermaid 加载中的占位视图 */
function MermaidLoading({ code }: { code: string }): ReactNode {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex flex-col items-center gap-2">
        <div className="size-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        <pre className="max-h-24 overflow-hidden text-xs text-gray-500 dark:text-gray-400">
          <code>{code.slice(0, 80)}{code.length > 80 ? "…" : ""}</code>
        </pre>
      </div>
    </div>
  );
}

interface MermaidBlockProps {
  /** mermaid 源代码 */
  code: string;
  /** 是否正在流式输出（流式中跳过渲染，避免频繁重绘） */
  isStreaming?: boolean;
}

/** mermaid 模块缓存（懒加载单例） */
let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;

async function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid");
  }
  return mermaidModulePromise;
}

/**
 * 渲染 mermaid 代码为 SVG
 *
 * @param code - mermaid 源代码
 * @param theme - 当前主题（light/dark）
 * @returns SVG 字符串
 */
async function renderMermaid(code: string, theme: "light" | "dark"): Promise<string> {
  const mermaid = await loadMermaid();
  const mermaidTheme = theme === "dark" ? "dark" : "default";

  // securityLevel: 'strict' 禁止 HTML 标签注入，符合 CSP
  mermaid.default.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: mermaidTheme,
    fontFamily: "inherit",
    flowchart: { useMaxWidth: true, htmlLabels: false },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });

  // 生成唯一 id，避免多图冲突
  const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
  const { svg } = await mermaid.default.render(id, code);
  return svg;
}

/**
 * Mermaid 图表组件
 *
 * 在流式输出时不渲染（避免频繁重绘），流式结束后才渲染。
 * 渲染失败时回退为代码块 + 错误提示。
 */
export const MermaidBlock = memo(function MermaidBlock({
  code,
  isStreaming = false,
}: MermaidBlockProps) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 代码内容 + 主题的指纹，用于缓存判断
  const cacheKey = useMemo(() => `${code.length}:${theme}:${isStreaming}`, [code, theme, isStreaming]);

  useEffect(() => {
    if (isStreaming) {
      // 流式输出中不渲染，避免频繁重绘
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    renderMermaid(code, theme)
      .then((result) => {
        if (!cancelled) {
          setSvg(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, code, theme, isStreaming]);

  if (isStreaming) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
        <pre className="overflow-x-auto text-xs">
          <code className="language-mermaid">{code}</code>
        </pre>
      </div>
    );
  }

  if (error) {
    return <MermaidFallback code={code} error={error} />;
  }

  if (isLoading || !svg) {
    return <MermaidLoading code={code} />;
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container my-3 flex justify-center overflow-x-auto rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950"
      // mermaid SVG 已经过 securityLevel: 'strict' 过滤，可安全注入
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
