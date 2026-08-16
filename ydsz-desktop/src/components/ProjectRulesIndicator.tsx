/**
 * @file ProjectRulesIndicator.tsx
 * @description 项目级 AI 协作规则加载状态指示器
 *
 * ## 功能
 *
 * - 自动监听 `workspaceRoot` 变化,调用 `useProjectRules` 扫描项目根目录
 * - 显示已加载规则文件的简短摘要,点击展开合并后的 markdown
 * - 规则为空时不显示(避免干扰)
 * - 加载失败时静默降级
 *
 * ## 位置
 *
 * 嵌入在 Composer 区域下方,与 ComposerInputFeedback 并列。
 * 不影响现有 Composer 排版,仅作为透明的状态徽章。
 *
 * @module components/ProjectRulesIndicator
 */

import { useState } from "react";

import { useMessages } from "../i18n/I18nContext";
import { useProjectRules } from "../hooks/useProjectRules";

/**
 * 指示器输入参数
 */
export interface ProjectRulesIndicatorProps {
  /** 项目根目录绝对路径 */
  workspaceRoot: string | null | undefined;
  /** 自定义类名 */
  className?: string;
}

/**
 * 简单截断(防 XSS / 防 UI 溢出)
 */
function summarizeFileName(source: string): string {
  if (source === ".ydsz/rules/") return ".ydsz/rules/";
  if (source.length > 24) return `${source.slice(0, 21)}...`;
  return source;
}

/**
 * 模板插值工具
 */
function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\$\{(\w+)\}/g, (_m, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `\${${k}}`,
  );
}

/**
 * 项目规则加载状态指示器
 */
export function ProjectRulesIndicator({
  workspaceRoot,
  className,
}: ProjectRulesIndicatorProps) {
  const messages = useMessages();
  const { files, merged, hasRules, query, totalBytes, teamRules, teamRulesApplied } =
    useProjectRules({
      workspaceRoot,
    });
  const [expanded, setExpanded] = useState(false);

  // 无规则时(加载中、失败、空)不显示,避免 UI 噪声
  if (!hasRules && !teamRulesApplied) {
    return null;
  }

  const t = messages.projectRules;
  const summary = fillTemplate(t.countSummary, {
    count: files.length,
    bytes: totalBytes,
  });

  // 团队规则 badge: 已应用 / 禁用 / 错误
  let teamBadge: { text: string; tone: "applied" | "disabled" | "error" } | null = null;
  if (teamRulesApplied) {
    teamBadge = { text: t.teamAppliedBadge, tone: "applied" };
  } else if (teamRules) {
    if (teamRules.error) {
      teamBadge = { text: t.teamErrorBadge, tone: "error" };
    } else if (!teamRules.enabled) {
      teamBadge = { text: t.teamDisabledBadge, tone: "disabled" };
    }
  }

  return (
    <div
      className={className}
      data-testid="project-rules-indicator"
      data-rule-count={files.length}
      data-total-bytes={totalBytes}
      data-team-applied={teamRulesApplied ? "true" : "false"}
      data-team-enabled={teamRules?.enabled ? "true" : "false"}
      data-team-count={teamRules?.fileCount ?? 0}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t.clickToView}
        title={t.clickToView}
        aria-expanded={expanded}
      >
        <span aria-hidden="true">📋</span>
        <span>
          {t.indicatorLabel}
          <span className="ml-1 font-mono text-foreground/70">{summary}</span>
        </span>
        {teamBadge ? (
          <span
            data-testid={`project-rules-team-badge-${teamBadge.tone}`}
            title={teamBadge.tone === "applied" ? t.teamAppliedHint : teamBadge.text}
            className={
              teamBadge.tone === "applied"
                ? "rounded bg-emerald-500/20 px-1 text-[10px] text-emerald-700 dark:text-emerald-300"
                : teamBadge.tone === "error"
                  ? "rounded bg-destructive/20 px-1 text-[10px] text-destructive"
                  : "rounded bg-muted px-1 text-[10px] text-muted-foreground"
            }
          >
            {teamBadge.text}
          </span>
        ) : null}
        {query.isPending ? (
          <span className="text-muted-foreground/60">·</span>
        ) : null}
        <span aria-hidden="true" className="text-muted-foreground/60">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded ? (
        <div
          role="region"
          aria-label={t.clickToView}
          className="mt-1.5 max-h-72 overflow-y-auto rounded-md border border-border/40 bg-muted/20 p-2.5 text-[11px] leading-relaxed text-foreground/80"
        >
          <p className="mb-1.5 font-medium text-foreground">
            {t.filesHeading} · {summary}
          </p>
          <ul className="mb-1.5 list-inside list-disc text-muted-foreground">
            {files.map((f) => (
              <li key={f.path} className="font-mono">
                {summarizeFileName(f.source)}
                {f.truncated ? t.truncatedSuffix : ""}
                {" — "}
                <span className="text-foreground/60">{f.path}</span>
              </li>
            ))}
          </ul>
          {teamBadge?.tone === "applied" ? (
            <p
              data-testid="project-rules-team-hint"
              className="mb-1.5 text-emerald-700 dark:text-emerald-300"
            >
              {t.teamAppliedHint}
            </p>
          ) : null}
          {merged ? (
            <details>
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {t.previewMerged}
              </summary>
              <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-[10.5px] text-foreground/80">
                {merged}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
