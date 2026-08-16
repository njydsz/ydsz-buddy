/**
 * @file 重命名线程对话框
 *
 * 重命名线程的简单对话框：
 *
 * - **输入校验**：标题必填，去除首尾空白
 * - **保存**：通过 `onSave` 异步保存
 * - **错误处理**：保存失败时通过 input 抖动反馈
 *
 * ## 核心导出
 *
 * - `RenameThreadDialog`：主组件
 * - `RenameThreadDialogProps`：组件 props
 *
 * ## 使用场景
 *
 * - Sidebar 线程右键菜单
 * - ChatHeader 标题编辑
 *
 * ## 注意事项
 *
 * - `onSave` 可同步或异步
 * - 标题为空时禁用"保存"按钮
 * - 取消时清空本地编辑态
 */
import { useEffect, useRef, useState } from "react";
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

interface RenameThreadDialogProps {
  open: boolean;
  currentTitle: string;
  onOpenChange: (open: boolean) => void;
  onSave: (newTitle: string) => Promise<void> | void;
}

export function RenameThreadDialog({
  open,
  currentTitle,
  onOpenChange,
  onSave,
}: RenameThreadDialogProps) {
  const [value, setValue] = useState(currentTitle);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setIsSaving(false);
      return;
    }
    setValue(currentTitle);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, currentTitle]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !isSaving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave(trimmed);
      onOpenChange(false);
    } catch {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Keep it short and recognizable.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <Input
              ref={inputRef}
              size="lg"
              value={value}
              disabled={isSaving}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onOpenChange(false);
                }
              }}
              aria-label="Chat title"
            />
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSave}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
