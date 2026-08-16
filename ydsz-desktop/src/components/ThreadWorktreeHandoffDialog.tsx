/**
 * @file 线程 Worktree 切换对话框
 *
 * 当用户选择"将线程切换到新 worktree"时弹出的对话框：
 *
 * - **输入 worktree 名称**：实时校验
 * - **预填**：默认从线程分支派生
 * - **busy 态**：handoff 进行中禁用按钮
 *
 * ## 核心导出
 *
 * - `ThreadWorktreeHandoffDialog`：主组件
 * - `ThreadWorktreeHandoffDialogProps`：组件 props
 *
 * ## 使用场景
 *
 * - BranchToolbar "Hand off to new worktree"
 *
 * ## 注意事项
 *
 * - 名称校验与 `buildTemporaryWorktreeBranchName` 对齐
 * - 取消不保存
 */
import { useEffect, useRef } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

interface ThreadWorktreeHandoffDialogProps {
  open: boolean;
  worktreeName: string;
  busy?: boolean;
  onWorktreeNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}

export function ThreadWorktreeHandoffDialog({
  open,
  worktreeName,
  busy = false,
  onWorktreeNameChange,
  onOpenChange,
  onConfirm,
}: ThreadWorktreeHandoffDialogProps) {
  const worktreeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      worktreeInputRef.current?.focus();
      worktreeInputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  const canSubmit = !busy && worktreeName.trim().length > 0;

  const handleSubmit = () => {
    if (canSubmit) {
      void onConfirm();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hand off to worktree</DialogTitle>
          <DialogDescription>
            Create a detached worktree from the current branch to continue working in parallel.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Worktree name</span>
              <Input
                ref={worktreeInputRef}
                value={worktreeName}
                disabled={busy}
                onChange={(event) => onWorktreeNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onOpenChange(false);
                  }
                }}
                placeholder="2. 环境变量 YDSZ_BOOTSTRAP_TOKEN\/feature-name"
              />
            </label>
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? "Handing off..." : "Hand off"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
