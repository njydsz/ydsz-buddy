/**
 * @file AuthorizedDirsPanel.tsx
 * @description P0-3: 细粒度目录授权管理面板
 *
 * 功能：
 * - 展示当前已授权的目录列表（读/写）
 * - 添加授权目录（支持只读/读写切换）
 * - 移除授权目录
 * - 路径预检查：输入路径后可检查是否已在授权范围内
 *
 * 集成位置：Settings → Security → Authorized Directories
 */

import { memo, useCallback, useEffect, useState } from "react";
import {
  PiFolderPlus,
  PiFolderOpen,
  PiTrash,
  PiCheckCircle,
  PiWarningCircle,
  PiLock,
  PiShieldCheck,
} from "react-icons/pi";
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

// ============================================================================
// 类型定义
// ============================================================================

type SandboxLevel = "strict" | "workspace" | "permissive";

interface SandboxPolicyDto {
  level: SandboxLevel;
  allowedReadDirs: string[];
  allowedWriteDirs: string[];
  networkAllowed: boolean;
  blockedEnvVars: string[];
  allowedCommands: string[] | null;
  blockedCommands: string[];
  timeoutSecs: number;
  maxOutputBytes: number;
}

// ============================================================================
// 组件
// ============================================================================

export const AuthorizedDirsPanel = memo(function AuthorizedDirsPanel() {
  const [policy, setPolicy] = useState<SandboxPolicyDto | null>(null);
  const [newDir, setNewDir] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<"authorized" | "unauthorized" | null>(null);

  // 加载当前策略
  const loadPolicy = useCallback(async () => {
    const mod = await loadTauriInvoke();
    if (!mod) return;
    try {
      const result = await mod.invoke<SandboxPolicyDto>("code_sandbox_get_policy");
      setPolicy(result);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  // 添加授权目录
  const handleAdd = useCallback(async () => {
    if (!newDir.trim()) return;
    setLoading(true);
    setError(null);
    const mod = await loadTauriInvoke();
    if (!mod) {
      setError("Tauri 不可用");
      setLoading(false);
      return;
    }
    try {
      const result = await mod.invoke<SandboxPolicyDto>(
        "code_sandbox_add_authorized_dir",
        { dir: newDir.trim(), readOnly: readOnly },
      );
      setPolicy(result);
      setNewDir("");
      setCheckResult(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [newDir, readOnly]);

  // 移除授权目录
  const handleRemove = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    const mod = await loadTauriInvoke();
    if (!mod) {
      setError("Tauri 不可用");
      setLoading(false);
      return;
    }
    try {
      const result = await mod.invoke<SandboxPolicyDto>(
        "code_sandbox_remove_authorized_dir",
        { dir },
      );
      setPolicy(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 检查路径
  const handleCheckPath = useCallback(async () => {
    if (!newDir.trim()) return;
    const mod = await loadTauriInvoke();
    if (!mod) return;
    try {
      const isAuthorized = await mod.invoke<boolean>("code_sandbox_check_path", {
        path: newDir.trim(),
        write: !readOnly,
      });
      setCheckResult(isAuthorized ? "authorized" : "unauthorized");
    } catch {
      setCheckResult(null);
    }
  }, [newDir, readOnly]);

  const readDirs = policy?.allowedReadDirs ?? [];
  const writeDirs = policy?.allowedWriteDirs ?? [];

  // 合并去重，标注权限
  const allDirs = Array.from(new Set([...readDirs, ...writeDirs]));

  return (
    <div className="space-y-4" data-testid="authorized-dirs-panel">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <PiShieldCheck className="size-5 text-emerald-500" />
        <h3 className="text-sm font-semibold">授权目录</h3>
        <span className="text-xs text-muted-foreground">
          Agent 仅可在授权目录内读写文件
        </span>
      </div>

      {/* 当前安全层级 */}
      {policy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>当前层级：</span>
          <span
            className={cn(
              "rounded px-2 py-0.5 font-medium",
              policy.level === "strict" && "bg-red-500/10 text-red-600",
              policy.level === "workspace" && "bg-amber-500/10 text-amber-600",
              policy.level === "permissive" && "bg-emerald-500/10 text-emerald-600",
            )}
          >
            {policy.level}
          </span>
        </div>
      )}

      {/* 已授权目录列表 */}
      <div className="space-y-1.5">
        {allDirs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            尚未配置授权目录
          </p>
        ) : (
          allDirs.map((dir) => {
            const canWrite = writeDirs.includes(dir);
            return (
              <div
                key={dir}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                data-testid="authorized-dir-item"
              >
                <PiFolderOpen className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-xs" title={dir}>
                  {dir}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    canWrite
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-blue-500/10 text-blue-600",
                  )}
                >
                  {canWrite ? (
                    <>
                      <PiCheckCircle className="size-3" />
                      读写
                    </>
                  ) : (
                    <>
                      <PiLock className="size-3" />
                      只读
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRemove(dir)}
                  disabled={loading}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="移除"
                  data-testid={`remove-dir-${dir}`}
                >
                  <PiTrash className="size-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 添加新目录 */}
      <div className="space-y-2 rounded-lg border border-border/60 p-3">
        <div className="flex items-center gap-2">
          <PiFolderPlus className="size-4 text-muted-foreground" />
          <input
            type="text"
            value={newDir}
            onChange={(e) => {
              setNewDir(e.target.value);
              setCheckResult(null);
            }}
            placeholder="/path/to/authorized/directory"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
            data-testid="new-dir-input"
          />
          <button
            type="button"
            onClick={() => void handleCheckPath()}
            disabled={!newDir.trim()}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          >
            检查
          </button>
        </div>

        {/* 只读切换 */}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="size-3.5"
          />
          <PiLock className="size-3" />
          仅授权读取（禁止写入）
        </label>

        {/* 路径检查结果 */}
        {checkResult === "authorized" && (
          <div className="flex items-center gap-1 text-[11px] text-emerald-600">
            <PiCheckCircle className="size-3" />
            该路径已在授权范围内
          </div>
        )}
        {checkResult === "unauthorized" && (
          <div className="flex items-center gap-1 text-[11px] text-amber-600">
            <PiWarningCircle className="size-3" />
            该路径不在授权范围内，点击下方按钮添加
          </div>
        )}

        {/* 添加按钮 */}
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={loading || !newDir.trim()}
          className={cn(
            "w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            loading || !newDir.trim()
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          data-testid="add-dir-btn"
        >
          {loading ? "添加中..." : "添加授权目录"}
        </button>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <PiWarningCircle className="size-3.5" />
          {error}
        </div>
      )}
    </div>
  );
});
