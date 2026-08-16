/**
 * @file WorkspaceAiSharePanel.tsx
 * @description 跨线程 workspace 级别 AI 生产占比卡片
 *
 * 数据流:服务端 `orchestration.getTurnAiShareSnapshot` → 30s 服务端缓存
 *       → 客户端 60s 拉一次(`useWorkspaceTurnAiShare`)
 *       → 渲染 24h / 7d / 30d 三个窗口 + 顶部短摘要
 *
 * 用途:在 Sidebar 顶部 / Settings / TopChrome 作为"workspace 整体 AI 占比"
 *      入口,与 `ThreadStatusBar`(单线程本地)互补。
 */
import { RefreshCw, Sparkles } from "lucide-react";

import { formatAiSharePercent } from "../lib/turnAiShare";
import type { AiShareWindow } from "../contracts/orchestration";
import {
  pickAiShare,
  useWorkspaceTurnAiShare,
  type WorkspaceAiShareStats,
} from "../hooks/useWorkspaceTurnAiShare";
import { useMessages } from "../i18n/I18nContext";

type Variant = "panel" | "compact";

export interface WorkspaceAiSharePanelProps {
  /** panel = 详细版(三窗口进度条);compact = 折叠版(单行摘要) */
  variant?: Variant;
  /** 启用 hook(测试或隐藏时关闭) */
  enabled?: boolean;
  /** 自定义 className */
  className?: string;
}

const WINDOW_LABELS: Record<string, string> = {
  "24h": "window24h",
  "7d": "window7d",
  "30d": "window30d",
};

function formatLines(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function WorkspaceAiSharePanel({
  variant = "panel",
  enabled = true,
  className,
}: WorkspaceAiSharePanelProps) {
  const query = useWorkspaceTurnAiShare(enabled);
  const data = query.data;

  if (variant === "compact") {
    return (
      <CompactView
        data={data}
        isError={query.isError}
        isLoading={query.isLoading}
        onRetry={() => query.refetch()}
        className={className}
      />
    );
  }
  return (
    <PanelView
      data={data}
      isError={query.isError}
      isLoading={query.isLoading}
      onRetry={() => query.refetch()}
      className={className}
    />
  );
}

function PanelView({
  data,
  isError,
  isLoading,
  onRetry,
  className,
}: {
  data: WorkspaceAiShareStats | undefined;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  className?: string;
}) {
  const t = useMessages().turnAiShare.workspace;
  return (
    <section
      className={`rounded-lg border border-border bg-card p-3 shadow-sm ${className ?? ""}`.trim()}
      data-testid="workspace-ai-share-panel"
      data-empty={!data || data.isEmpty}
      aria-label={t.title}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          data-testid="workspace-ai-share-refresh"
          aria-label={t.refresh}
        >
          <RefreshCw
            className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {t.refresh}
        </button>
      </header>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{t.subtitle}</p>

      {isLoading && !data ? (
        <ul className="mt-3 space-y-2" data-testid="workspace-ai-share-loading">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-6 w-full animate-pulse rounded bg-muted/40"
            />
          ))}
        </ul>
      ) : isError ? (
        <p
          className="mt-3 text-[12px] text-destructive"
          data-testid="workspace-ai-share-error"
          role="alert"
        >
          {t.refresh}
        </p>
      ) : !data || data.isEmpty ? (
        <p
          className="mt-3 text-[12px] text-muted-foreground"
          data-testid="workspace-ai-share-empty"
        >
          {t.empty}
        </p>
      ) : (
        <ul className="mt-3 space-y-2" data-testid="workspace-ai-share-windows">
          {data.windows.map((w) => (
            <WindowRow
              key={w.window}
              window={w}
              testId={`workspace-ai-share-window-${w.window}`}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CompactView({
  data,
  isError,
  isLoading,
  onRetry,
  className,
}: {
  data: WorkspaceAiShareStats | undefined;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  className?: string;
}) {
  const t = useMessages().turnAiShare.workspace;
  const w30 = data && !data.isEmpty ? pickAiShare(data, "30d") : null;
  const percent = w30 ? formatAiSharePercent(w30.aiShare) : "—";
  const lines = w30 ? formatLines(w30.aiLines) : "—";
  const summary = w30 ? t.summary(percent, lines, t.window30d) : t.empty;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground ${className ?? ""}`.trim()}
      data-testid="workspace-ai-share-compact"
      data-empty={!data || data.isEmpty}
      onClick={onRetry}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRetry();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t.title}
      title={summary}
    >
      <Sparkles
        className={`h-3 w-3 text-primary ${isLoading ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      <span className="font-medium">{summary}</span>
      {isError ? (
        <span className="text-destructive" data-testid="workspace-ai-share-compact-error">
          !
        </span>
      ) : null}
    </div>
  );
}

function WindowRow({
  window,
  testId,
}: {
  window: AiShareWindow;
  testId?: string;
}) {
  const t = useMessages().turnAiShare.workspace;
  const sharePct =
    window.aiShare !== null ? Math.max(0, Math.min(1, window.aiShare)) : 0;
  const labelKey = WINDOW_LABELS[window.window] ?? "window30d";
  const label = (t as unknown as Record<string, string>)[labelKey] ?? window.window;
  return (
    <li
      className="rounded-md border border-border/60 bg-background/40 p-2"
      data-testid={testId ?? "workspace-ai-share-window"}
      data-window={window.window}
      data-share={window.aiShare ?? "null"}
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-foreground">
          {window.aiShare !== null ? t.percent(window.aiShare * 100) : "—"}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary/80 transition-all"
          style={{ width: `${Math.max(2, sharePct * 100)}%` }}
          data-testid={`${testId ?? "workspace-ai-share-window"}-bar`}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{t.lines(window.totalLines)}</span>
        <span>
          {t.lines(window.aiLines)} · {window.turnCount} turns
        </span>
      </div>
    </li>
  );
}

export default WorkspaceAiSharePanel;
