/**
 * @file 崩溃恢复容器
 *
 * 将 useCrashRecovery 与 CrashRecoveryDialog 组合，
 * 在检测到未完成的 checkpoint 时自动弹窗。
 * 作为全局组件挂在根路由的 children 树中。
 *
 * ## 触发条件
 *
 * - 应用启动时 `checkpoint_list_pending` 返回非空列表
 * - 即 `hasPendingRecovery === true` 时打开弹窗
 * - 用户处理后（resume / cancel / close）关闭弹窗
 *
 * ## 不重复弹出
 *
 * - 通过 `dismissedRef` 在本次会话内仅弹一次
 * - 处理（resume/cancel）后从状态移除自然不会再弹
 */

import { useEffect, useRef, useState } from "react";
import { CrashRecoveryDialog } from "./CrashRecoveryDialog";
import { useCrashRecovery } from "../hooks/useCrashRecovery";

export function CrashRecoveryHost() {
  const {
    pendingCheckpoints,
    hasPendingRecovery,
    resumeCheckpoint,
    cancelCheckpoint,
    inspectCheckpoint,
  } = useCrashRecovery();
  const [isOpen, setIsOpen] = useState(false);
  const dismissedRef = useRef(false);

  // 检测到未完成 checkpoint 时弹窗（仅本次会话首次）
  useEffect(() => {
    if (!hasPendingRecovery || dismissedRef.current) return;
    setIsOpen(true);
  }, [hasPendingRecovery]);

  const handleClose = () => {
    setIsOpen(false);
    dismissedRef.current = true;
  };

  return (
    <CrashRecoveryDialog
      isOpen={isOpen}
      checkpoints={pendingCheckpoints}
      onResume={resumeCheckpoint}
      onCancel={cancelCheckpoint}
      onInspect={inspectCheckpoint}
      onClose={handleClose}
    />
  );
}
