/**
 * @file SandboxAccessConfirmDialog.tsx
 * @description P0-3: 沙箱目录访问确认对话框
 *
 * 当 Agent 试图访问授权范围外的目录时，弹出此对话框让用户决定：
 * - 允许（将该目录添加到授权列表，永久授权）
 * - 仅本次允许（临时授权，不持久化）
 * - 拒绝（阻止访问）
 *
 * 触发方式：
 * 1. 主动调用：通过 useSandboxPathGuard hook 的 guardPath() 函数
 * 2. 被动监听：通过 Tauri 事件 `sandbox://access-denied`（后端未来可发射）
 */

import { memo, useCallback, useEffect, useState } from "react";
import {
  PiFolder,
  PiShieldWarning,
  PiCheck,
  PiX,
  PiClock,
  PiWarningCircle,
} from "react-icons/pi";
import { Button } from "./ui/button";

// ============================================================================

export interface SandboxAccessRequest {
  /** 请求访问的路径 */
  path: string;
  /** 是否需要写入权限 */
  write: boolean;
  /** 触发来源（如 "agent:file_read" / "agent:file_write"） */
  source?: string;
}

export type SandboxAccessDecision = "allow" | "allow-once" | "deny";

interface SandboxAccessConfirmDialogProps {
  /** 当前待确认的访问请求（null 时不显示） */
  request: SandboxAccessRequest | null;
  /** 用户做出决策后的回调 */
  onResolve: (decision: SandboxAccessDecision, request: SandboxAccessRequest) => void;
}

/**
 * 沙箱目录访问确认对话框
 *
 * 显示 Agent 试图访问的路径、操作类型（读/写），
 * 让用户选择允许（永久）、仅本次允许、或拒绝。
 */
export const SandboxAccessConfirmDialog = memo(function SandboxAccessConfirmDialog({
  request,
  onResolve,
}: SandboxAccessConfirmDialogProps) {
  const [isVisible, setIsVisible] = useState(false);

  // 当 request 变化时显示对话框
  useEffect(() => {
    if (request) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [request]);

  const handleResolve = useCallback(
    (decision: SandboxAccessDecision) => {
      setIsVisible(false);
      if (request) {
        onResolve(decision, request);
      }
    },
    [onResolve, request],
  );

  // ESC 键关闭 = 拒绝
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleResolve("deny");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, handleResolve]);

  if (!isVisible || !request) return null;

  const isWrite = request.write;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="sandbox-access-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sandbox-access-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* 头部 */}
        <div className="mb-5 flex items-start gap-4">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-full ${
              isWrite ? "bg-amber-500/10" : "bg-sky-500/10"
            }`}
          >
            <PiShieldWarning
              className={`size-6 ${isWrite ? "text-amber-600" : "text-sky-600"}`}
            />
          </div>
          <div className="flex-1">
            <h2 id="sandbox-access-title" className="text-lg font-semibold">
              {isWrite ? "Agent 请求写入目录" : "Agent 请求读取目录"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              该目录不在当前授权范围内，需要您的确认。
            </p>
          </div>
        </div>

        {/* 路径展示 */}
        <div className="mb-5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">目标路径</p>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5">
            <PiFolder className="size-4 shrink-0 text-muted-foreground" />
            <code className="flex-1 truncate text-xs text-foreground">
              {request.path}
            </code>
          </div>
          {request.source && (
            <p className="text-[10px] text-muted-foreground">
              触发来源：{request.source}
            </p>
          )}
        </div>

        {/* 安全提示 */}
        <div className="mb-5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="flex items-start gap-2">
            <PiWarningCircle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
              {isWrite
                ? "允许写入意味着 Agent 可以修改或删除该目录下的文件。请仅授权您信任的目录。"
                : "允许读取意味着 Agent 可以访问该目录下的文件内容。"}
            </p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => handleResolve("allow")}
            className="w-full justify-start gap-2"
            data-testid="sandbox-access-allow"
          >
            <PiCheck className="size-4 text-emerald-500" />
            <span>允许并永久授权此目录</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleResolve("allow-once")}
            className="w-full justify-start gap-2"
            data-testid="sandbox-access-allow-once"
          >
            <PiClock className="size-4 text-sky-500" />
            <span>仅本次允许</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleResolve("deny")}
            className="w-full justify-start gap-2"
            data-testid="sandbox-access-deny"
          >
            <PiX className="size-4 text-red-500" />
            <span>拒绝访问</span>
          </Button>
        </div>
      </div>
    </div>
  );
});
