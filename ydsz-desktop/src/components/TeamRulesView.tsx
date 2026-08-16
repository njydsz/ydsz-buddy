/**
 * @file TeamRulesView.tsx
 * @description 团队共享规则管理视图
 *
 * ## 功能
 *
 * - 列出 `~/.ydsz-buddy/team-rules/` 下的全部规则文件
 * - 新建 / 编辑 / 删除规则(基于 `useTeamRules` Hook)
 * - 维护 manifest(团队名 / 远端地址 / 启用开关)
 * - 失败时显示错误,空状态提供引导
 * - 全部交互都有 `data-testid`,方便 E2E
 *
 * ## 与 SettingsPage 的集成
 *
 * 在 `settings.tsx` 的"规则与策略"分组下注册一个 `<TeamRulesView />`。
 * 单独成 view 也支持 —— 只需给一个 `standalone` 属性。
 *
 * ## 设计要点
 *
 * - 不直接修改文件系统(由 Rust 命令处理 atomic write)
 * - 全部 mutation 走 `useTeamRules` 暴露的 `saveRule` / `deleteRule` / `saveManifest`
 * - 显示 manifest 同步状态(更新时间 / 远端 commit)方便排查"规则没生效"
 *
 * @module components/TeamRulesView
 */

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useMessages } from "../i18n/I18nContext";
import {
  useTeamRules,
  type TeamRuleFileDto,
  type TeamRulesManifestDto,
} from "../hooks/useTeamRules";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";

const TEAM_RULES_FOLDER_REVEAL_CMD = "show_in_folder";

/**
 * 视图输入参数
 */
export interface TeamRulesViewProps {
  /** 自定义类名 */
  className?: string;
  /** 隐藏页头(用于嵌入到 SettingsPage 子区块) */
  hideHeader?: boolean;
  /** 自定义 baseDir(高级用法,默认 = home dir) */
  baseDir?: string | null;
}

interface EditDialogState {
  /** 是否打开 */
  open: boolean;
  /** 编辑模式还是新建模式 */
  mode: "create" | "edit";
  /** 正在编辑的规则 */
  file: TeamRuleFileDto | null;
  /** 表单数据 */
  form: {
    fileName: string;
    content: string;
  };
  /** 表单错误 */
  error: string | null;
  /** 是否正在提交 */
  submitting: boolean;
}

const EMPTY_DIALOG: EditDialogState = {
  open: false,
  mode: "create",
  file: null,
  form: { fileName: "", content: "" },
  error: null,
  submitting: false,
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function formatModified(epochSec: number, locale: string): string {
  if (!epochSec) return "—";
  const d = new Date(epochSec * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString(locale);
  } catch {
    return d.toISOString();
  }
}

/**
 * 团队共享规则管理视图
 */
export function TeamRulesView({
  className,
  hideHeader = false,
  baseDir,
}: TeamRulesViewProps) {
  const messages = useMessages();
  const t = messages.teamRules;
  const locale = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  const queryClient = useQueryClient();

  const {
    files,
    manifest,
    root,
    merged,
    hasRules,
    isEnabled,
    summary,
    totalBytes,
    elapsedMs,
    skipped,
    error,
    saveRule,
    deleteRule,
    saveManifest,
    refresh,
    query,
  } = useTeamRules({ baseDir: baseDir ?? null });

  const [editDialog, setEditDialog] = useState<EditDialogState>(EMPTY_DIALOG);
  const [manifestDraft, setManifestDraft] = useState<TeamRulesManifestDto | null>(
    null,
  );
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // 初始化 manifest 草稿
  useEffect(() => {
    if (manifest) {
      setManifestDraft(manifest);
    }
  }, [manifest]);

  // Toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const openCreate = () => {
    setEditDialog({
      open: true,
      mode: "create",
      file: null,
      form: { fileName: "untitled.md", content: "" },
      error: null,
      submitting: false,
    });
  };

  const openEdit = (file: TeamRuleFileDto) => {
    setEditDialog({
      open: true,
      mode: "edit",
      file,
      form: { fileName: file.name, content: file.content },
      error: null,
      submitting: false,
    });
  };

  const closeDialog = () => {
    if (editDialog.submitting) return;
    setEditDialog(EMPTY_DIALOG);
  };

  const handleSubmit = async () => {
    const { form, mode, file } = editDialog;
    // 校验文件名
    const name = form.fileName.trim();
    if (!name) {
      setEditDialog((s) => ({ ...s, error: "文件名不能为空" }));
      return;
    }
    if (
      name.includes("..") ||
      name.includes("/") ||
      name.includes("\\")
    ) {
      setEditDialog((s) => ({ ...s, error: "文件名不能包含路径分隔符" }));
      return;
    }
    if (!name.toLowerCase().endsWith(".md")) {
      setEditDialog((s) => ({ ...s, error: "文件后缀必须是 .md" }));
      return;
    }
    if (form.content.length > 32 * 1024) {
      setEditDialog((s) => ({ ...s, error: "内容超过 32 KiB 上限" }));
      return;
    }
    setEditDialog((s) => ({ ...s, submitting: true, error: null }));
    try {
      await saveRule.mutateAsync({ fileName: name, content: form.content });
      setToast({ type: "success", text: t.saveSuccess });
      setEditDialog(EMPTY_DIALOG);
    } catch (e) {
      setEditDialog((s) => ({
        ...s,
        submitting: false,
        error: e instanceof Error ? e.message : String(e),
      }));
      setToast({ type: "error", text: t.saveFailure });
    }
    void mode;
    void file;
  };

  const handleDelete = async (file: TeamRuleFileDto) => {
    const ok = typeof window !== "undefined"
      ? window.confirm(t.deleteConfirm)
      : true;
    if (!ok) return;
    try {
      await deleteRule.mutateAsync(file.name);
      setToast({ type: "success", text: t.deleteSuccess });
    } catch (e) {
      setToast({
        type: "error",
        text: e instanceof Error ? e.message : t.deleteFailure,
      });
    }
  };

  const handleSaveManifest = async () => {
    if (!manifestDraft) return;
    try {
      await saveManifest.mutateAsync(manifestDraft);
      setToast({ type: "success", text: t.manifestUpdated });
    } catch (e) {
      setToast({
        type: "error",
        text: e instanceof Error ? e.message : t.manifestFailed,
      });
    }
  };

  const handleRevealFolder = async () => {
    if (!root) return;
    try {
      // 走 Tauri 的 show_in_folder 命令
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke(TEAM_RULES_FOLDER_REVEAL_CMD, { path: root });
    } catch {
      // 兜底:在浏览器/测试环境下静默
    }
  };

  const handleReload = async () => {
    try {
      await refresh();
    } catch {
      // useQuery 已暴露 error
    } finally {
      void queryClient;
    }
  };

  const lastUpdated = useMemo<string>(() => {
    if (manifest?.updatedAt) return manifest.updatedAt;
    if (files.length === 0) return "—";
    const newest = files.reduce<number>(
      (acc, f) => (f.modifiedAt > acc ? f.modifiedAt : acc),
      0,
    );
    return formatModified(newest, locale);
  }, [manifest, files, locale]);

  return (
    <div
      className={className}
      data-testid="team-rules-view"
      data-rule-count={files.length}
      data-total-bytes={totalBytes}
      data-skipped={skipped}
      data-elapsed-ms={elapsedMs}
      data-is-enabled={isEnabled ? "true" : "false"}
      data-has-root={root ? "true" : "false"}
    >
      {!hideHeader ? (
        <header className="mb-3 space-y-1">
          <h2 className="text-base font-semibold leading-tight text-foreground">
            {t.viewTitle}
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t.viewDescription}
          </p>
        </header>
      ) : null}

      {/* Manifest 配置面板 */}
      <section
        className="mb-4 rounded-md border border-border/40 bg-muted/20 p-3"
        data-testid="team-rules-manifest"
      >
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Manifest
        </h3>
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : manifestDraft ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2" data-testid="team-rules-enabled-row">
              <Switch
                id="team-rules-enabled"
                checked={manifestDraft.enabled}
                onCheckedChange={(v) =>
                  setManifestDraft((m) => (m ? { ...m, enabled: v } : m))
                }
                data-testid="team-rules-enabled-toggle"
              />
              <Label htmlFor="team-rules-enabled" className="text-sm">
                {t.enabledLabel}
              </Label>
              <span
                className="text-[10.5px] text-muted-foreground"
                title={t.enabledHint}
              >
                ⓘ
              </span>
            </div>
            <div>
              <Label
                htmlFor="team-rules-name"
                className="text-xs text-muted-foreground"
                title={t.teamNameHelp}
              >
                {t.teamNameLabel}
              </Label>
              <Input
                id="team-rules-name"
                data-testid="team-rules-name-input"
                value={manifestDraft.teamName ?? ""}
                onChange={(e) =>
                  setManifestDraft((m) =>
                    m ? { ...m, teamName: e.target.value || null } : m,
                  )
                }
                placeholder={t.teamNamePlaceholder}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label
                htmlFor="team-rules-remote"
                className="text-xs text-muted-foreground"
                title={t.remoteUrlHelp}
              >
                {t.remoteUrlLabel}
              </Label>
              <Input
                id="team-rules-remote"
                data-testid="team-rules-remote-input"
                value={manifestDraft.remoteUrl ?? ""}
                onChange={(e) =>
                  setManifestDraft((m) =>
                    m ? { ...m, remoteUrl: e.target.value || null } : m,
                  )
                }
                placeholder={t.remoteUrlPlaceholder}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label
                htmlFor="team-rules-commit"
                className="text-xs text-muted-foreground"
              >
                {t.remoteCommitLabel}
              </Label>
              <Input
                id="team-rules-commit"
                data-testid="team-rules-commit-input"
                value={manifestDraft.remoteCommit ?? ""}
                onChange={(e) =>
                  setManifestDraft((m) =>
                    m ? { ...m, remoteCommit: e.target.value || null } : m,
                  )
                }
                placeholder="abc1234"
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2 text-[10.5px] text-muted-foreground">
              <span data-testid="team-rules-last-updated">
                {t.manifestUpdated}: {lastUpdated}
              </span>
              <span>·</span>
              <span>
                {t.summary.replace(
                  "${count}",
                  String(files.length),
                ).replace("${bytes}", formatBytes(totalBytes))}
              </span>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveManifest}
                disabled={saveManifest.isPending}
                data-testid="team-rules-save-manifest"
              >
                {t.saveRule}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReload}
                data-testid="team-rules-reload"
                title={t.reloadHint}
              >
                {t.reload}
              </Button>
              {root ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleRevealFolder}
                  data-testid="team-rules-reveal"
                  title={t.openInExplorerHint}
                >
                  {t.openInExplorer}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="team-rules-no-manifest">
            —
          </p>
        )}
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-testid="team-rules-error"
        >
          {error}
        </div>
      ) : null}

      {/* 规则列表 */}
      <section
        className="rounded-md border border-border/40 bg-background/40"
        data-testid="team-rules-list-section"
      >
        <header className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.listHeading}
          </h3>
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            data-testid="team-rules-create"
            disabled={!isEnabled && !manifest}
          >
            {t.createRule}
          </Button>
        </header>
        {query.isPending ? (
          <ul className="divide-y divide-border/40">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-12" />
              </li>
            ))}
          </ul>
        ) : !hasRules ? (
          <div
            className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
            data-testid="team-rules-empty"
          >
            <span aria-hidden="true" className="text-3xl">
              🗂️
            </span>
            <h4 className="text-sm font-medium text-foreground">
              {t.blankStateTitle}
            </h4>
            <p className="max-w-sm text-xs text-muted-foreground">
              {t.blankStateDescription}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openCreate}
              data-testid="team-rules-empty-create"
            >
              {t.createRule}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/40" data-testid="team-rules-list">
            {files.map((file) => (
              <li
                key={file.name}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                data-testid="team-rules-list-item"
                data-rule-name={file.name}
                data-rule-bytes={file.content.length}
                data-rule-truncated={file.truncated ? "true" : "false"}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-foreground">
                    {file.name}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {file.content.length} {t.bytesLabel} ·{" "}
                    {formatModified(file.modifiedAt, locale)}
                    {file.truncated ? (
                      <span
                        className="ml-2 inline-flex items-center rounded bg-amber-500/20 px-1 text-[10px] text-amber-700 dark:text-amber-300"
                        data-testid="team-rules-truncated-badge"
                      >
                        {t.truncatedBadge}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(file)}
                    data-testid="team-rules-edit"
                    aria-label={`${t.editRule} ${file.name}`}
                  >
                    {t.editRule}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(file)}
                    data-testid="team-rules-delete"
                    aria-label={`${t.deleteRule} ${file.name}`}
                    disabled={deleteRule.isPending}
                  >
                    {t.deleteRule}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <footer className="border-t border-border/40 bg-muted/20 px-3 py-1.5 text-[10.5px] text-muted-foreground">
          {summary}
        </footer>
      </section>

      {/* 合并预览 */}
      {hasRules && merged ? (
        <details
          className="mt-3 rounded-md border border-border/40 bg-muted/10"
          data-testid="team-rules-merged"
        >
          <summary className="cursor-pointer px-3 py-2 text-xs text-foreground/80">
            {t.previewMerged}
          </summary>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-border/40 bg-background/60 p-3 text-[11px] text-foreground/80">
            {merged}
          </pre>
        </details>
      ) : null}

      {/* 编辑/新建对话框 */}
      {editDialog.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          data-testid="team-rules-dialog"
        >
          <div className="w-full max-w-2xl rounded-md border border-border bg-background p-4 shadow-lg">
            <h3 className="mb-3 text-sm font-semibold">
              {editDialog.mode === "create" ? t.createRule : t.editRule}
            </h3>
            <div className="mb-3">
              <Label htmlFor="team-rule-name" className="text-xs">
                {t.ruleNameLabel}
              </Label>
              <Input
                id="team-rule-name"
                data-testid="team-rule-name-input"
                value={editDialog.form.fileName}
                onChange={(e) =>
                  setEditDialog((s) => ({
                    ...s,
                    form: { ...s.form, fileName: e.target.value },
                  }))
                }
                placeholder={t.ruleNamePlaceholder}
                className="mt-1 h-8 text-sm"
                disabled={editDialog.submitting || editDialog.mode === "edit"}
              />
            </div>
            <div className="mb-3">
              <Label htmlFor="team-rule-content" className="text-xs">
                {t.ruleContentLabel}
              </Label>
              <Textarea
                id="team-rule-content"
                data-testid="team-rule-content-input"
                value={editDialog.form.content}
                onChange={(e) =>
                  setEditDialog((s) => ({
                    ...s,
                    form: { ...s.form, content: e.target.value },
                  }))
                }
                placeholder={t.ruleContentPlaceholder}
                className="mt-1 min-h-[200px] text-xs"
                disabled={editDialog.submitting}
              />
            </div>
            {editDialog.error ? (
              <p
                role="alert"
                className="mb-2 text-xs text-destructive"
                data-testid="team-rule-error"
              >
                {editDialog.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeDialog}
                disabled={editDialog.submitting}
                data-testid="team-rule-cancel"
              >
                {t.cancel}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={editDialog.submitting}
                data-testid="team-rule-save"
              >
                {editDialog.submitting ? `${t.saveRule}…` : t.saveRule}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 rounded-md border px-3 py-2 text-xs shadow ${
            toast.type === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
          data-testid="team-rules-toast"
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
