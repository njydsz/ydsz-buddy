/**
 * @file BackupPanel.tsx
 * @description G8-P1: 备份与恢复面板
 *
 * 功能：
 * - 展示已有备份列表（文件名、创建时间、大小）
 * - "立即备份"按钮 — 弹出保存对话框选择输出路径并执行导出
 * - "恢复"按钮 — 带二次确认对话框，选择 zip 文件后执行恢复
 * - "删除"按钮 — 删除选中的备份文件
 * - 备份进度指示
 *
 * 集成位置：Settings → Data Backup → BackupPanel
 */

import { memo, useCallback, useEffect, useState } from "react";
import { PiArchive, PiDownloadCloud, PiUploadCloud, PiTrash, PiHardDrive, PiSpinner, PiWarning, PiCheck } from "react-icons/pi";
import { cn } from "~/lib/utils";

// ============================================================================
// Tauri Invoke 动态加载
// ============================================================================

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

// Also need dialog + fs-ext from Tauri plugins for open/save file dialogs
let tauriDialogPromise: Promise<typeof import("@tauri-apps/api/dialog") | null> | null = null;

async function loadTauriDialog(): Promise<typeof import("@tauri-apps/api/dialog") | null> {
  if (tauriDialogPromise) return tauriDialogPromise;
  tauriDialogPromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/dialog");
      return mod;
    } catch {
      return null;
    }
  })();
  return tauriDialogPromise;
}

// ============================================================================
// 类型定义
// ============================================================================

interface BackupInfo {
  filename: string;
  created_at_ms: number;
  size_bytes: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimestamp(ms: number): string {
  if (ms <= 0) return "—";
  const d = new Date(ms);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ============================================================================
// 组件
// ============================================================================

export const BackupPanel = memo(function BackupPanel() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"info" | "success" | "error">("info");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestorePath, setPendingRestorePath] = useState<string | null>(null);

  // 加载备份列表
  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const invoke = await loadTauriInvoke();
      if (!invoke) {
        setStatusMessage("非 Tauri 环境，不可用");
        setStatusKind("error");
        return;
      }
      const list = await invoke.invoke<BackupInfo[]>("backup_list");
      setBackups(list);
    } catch (e) {
      setStatusMessage(`加载备份列表失败: ${e}`);
      setStatusKind("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  // 立即备份
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const invoke = await loadTauriInvoke();
      const dialog = await loadTauriDialog();
      if (!invoke || !dialog) {
        setStatusMessage("非 Tauri 环境，不可用");
        setStatusKind("error");
        return;
      }

      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const defaultFilename = `ydsz_backup_${ts}.zip`;

      const outputPath = await dialog.save({
        defaultPath: defaultFilename,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });

      if (!outputPath) {
        setExporting(false);
        return;
      }

      setStatusMessage("正在导出备份...");
      setStatusKind("info");

      const result = await invoke.invoke<string>("backup_export", {
        outputPath,
      });

      setStatusMessage(`备份已导出: ${result}`);
      setStatusKind("success");
      await loadBackups();
    } catch (e) {
      setStatusMessage(`导出失败: ${e}`);
      setStatusKind("error");
    } finally {
      setExporting(false);
    }
  }, [loadBackups]);

  // 选择备份文件并触发恢复确认
  const handleRestoreClick = useCallback(async () => {
    try {
      const dialog = await loadTauriDialog();
      if (!dialog) {
        setStatusMessage("非 Tauri 环境，不可用");
        setStatusKind("error");
        return;
      }

      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });

      if (selected && typeof selected === "string") {
        setPendingRestorePath(selected);
        setShowRestoreConfirm(true);
      }
    } catch {
      setStatusMessage("选择备份文件失败");
      setStatusKind("error");
    }
  }, []);

  // 确认恢复
  const handleRestoreConfirm = useCallback(async () => {
    if (!pendingRestorePath) return;
    setShowRestoreConfirm(false);
    setRestoring(true);

    try {
      const invoke = await loadTauriInvoke();
      if (!invoke) {
        setStatusMessage("非 Tauri 环境，不可用");
        setStatusKind("error");
        return;
      }

      setStatusMessage("正在恢复备份...");
      setStatusKind("info");

      await invoke.invoke<void>("backup_restore", {
        backupPath: pendingRestorePath,
      });

      setStatusMessage("备份恢复成功！请重启应用以使变更生效。");
      setStatusKind("success");
      await loadBackups();
    } catch (e) {
      setStatusMessage(`恢复失败: ${e}`);
      setStatusKind("error");
    } finally {
      setPendingRestorePath(null);
      setRestoring(false);
    }
  }, [pendingRestorePath, loadBackups]);

  // 删除备份
  const handleDelete = useCallback(async (filename: string) => {
    if (!confirm(`确定要删除备份 "${filename}" 吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const invoke = await loadTauriInvoke();
      if (!invoke) return;

      await invoke.invoke<void>("backup_delete", { filename });
      setStatusMessage(`已删除备份: ${filename}`);
      setStatusKind("success");
      await loadBackups();
    } catch (e) {
      setStatusMessage(`删除失败: ${e}`);
      setStatusKind("error");
    }
  }, [loadBackups]);

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-(--color-border-light)",
            "bg-(--color-background-panel) px-3 py-1.5 text-xs font-medium",
            "text-foreground transition-colors hover:bg-(--sidebar-accent)",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onClick={handleExport}
          disabled={exporting || restoring}
        >
          {exporting ? (
            <PiSpinner className="size-3.5 animate-spin" />
          ) : (
            <PiArchive className="size-3.5" />
          )}
          {exporting ? "正在备份..." : "立即备份"}
        </button>

        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-(--color-border-light)",
            "bg-(--color-background-panel) px-3 py-1.5 text-xs font-medium",
            "text-foreground transition-colors hover:bg-(--sidebar-accent)",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onClick={handleRestoreClick}
          disabled={exporting || restoring}
        >
          {restoring ? (
            <PiSpinner className="size-3.5 animate-spin" />
          ) : (
            <PiUploadCloud className="size-3.5" />
          )}
          {restoring ? "正在恢复..." : "恢复备份"}
        </button>

        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-transparent",
            "px-3 py-1.5 text-xs font-medium text-muted-foreground",
            "transition-colors hover:text-foreground",
          )}
          onClick={() => void loadBackups()}
          disabled={loading}
        >
          <PiDownloadCloud className={cn("size-3.5", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* 状态消息 */}
      {statusMessage && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            statusKind === "success" && "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
            statusKind === "error" && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
            statusKind === "info" && "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
          )}
        >
          {statusKind === "success" ? (
            <PiCheck className="mt-0.5 size-3.5 shrink-0" />
          ) : statusKind === "error" ? (
            <PiWarning className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <PiSpinner className="mt-0.5 size-3.5 shrink-0 animate-spin" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 备份列表 */}
      <div className="rounded-md border border-(--color-border-light) bg-(--color-background-panel)/50">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            <PiSpinner className="mr-2 size-3.5 animate-spin" />
            加载备份列表...
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
            <PiHardDrive className="size-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">暂无备份</p>
            <p className="text-[11px] text-muted-foreground/60">
              点击"立即备份"创建第一个备份
            </p>
          </div>
        ) : (
          <div className="divide-y divide-(--color-border-light)/50">
            {backups.map((b) => (
              <div
                key={b.filename}
                className="flex items-center gap-3 px-3 py-2.5 text-xs transition-colors hover:bg-(--sidebar-accent)/50"
              >
                <PiArchive className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {b.filename}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatTimestamp(b.created_at_ms)} · {formatSize(b.size_bytes)}
                  </p>
                </div>
                <button
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                  title="删除备份"
                  onClick={() => void handleDelete(b.filename)}
                >
                  <PiTrash className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 恢复确认对话框 */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-(--color-border-light) bg-(--color-background-panel) p-4 shadow-xl">
            <div className="flex items-center gap-2">
              <PiWarning className="size-5 text-amber-500" />
              <h3 className="text-sm font-medium">确认恢复</h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              恢复操作将覆盖当前所有数据 (数据库 / 配置文件 / 工作区配置)。
              在执行恢复前，当前数据会被自动备份到 <code className="rounded bg-muted px-1 text-[11px]">_pre_restore</code> 目录。
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              确定要继续吗？建议先创建当前状态的备份。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md border border-(--color-border-light) bg-(--color-background-panel) px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-(--sidebar-accent)"
                onClick={() => {
                  setShowRestoreConfirm(false);
                  setPendingRestorePath(null);
                }}
              >
                取消
              </button>
              <button
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
                onClick={() => void handleRestoreConfirm()}
              >
                确认恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
