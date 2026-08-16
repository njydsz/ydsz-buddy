/**
 * @file messageRecall
 * @description 消息撤回 Toast 工具
 *
 * 用户发送消息后，弹出一个 5 秒的 toast，提供"撤销"按钮。
 * 点击后会调用 `revert()` 把线程回滚到发送前的检查点。
 *
 * 行为参考互联网大厂基线（飞书/钉钉/Slack）：
 *
 * - 5 秒倒计时自动消失，hover/聚焦时暂停倒计时
 * - 倒计时结束前点击"撤销"立即回滚
 * - 已在底层使用 toastManager 的 `dismissAfterVisibleMs`，
 *   与现有 visibility/focus 暂停逻辑兼容
 *
 * ## 核心导出
 *
 * - `showMessageRecallToast`：弹出可撤回 toast
 * - `RECALL_TOAST_DURATION_MS`：默认 5 秒
 */

import type { ThreadId } from "~/contracts";
import { toastManager } from "~/components/ui/toast";

/** 默认倒计时：5 秒 */
export const RECALL_TOAST_DURATION_MS = 5_000;

export interface MessageRecallOptions {
  /** 目标线程 id（用于跨线程可见性控制） */
  threadId: ThreadId;
  /** 倒计时 ms（默认 5000） */
  durationMs?: number;
  /** 撤销回调：点击"撤销"按钮时调用 */
  onRevert: () => void | Promise<void>;
  /** 撤回消息预览（用于 toast 标题/描述） */
  preview?: string;
}

/**
 * 弹出消息撤回 toast
 *
 * @returns toast id，可用于手动 dismiss
 */
export function showMessageRecallToast(options: MessageRecallOptions): string {
  const duration = options.durationMs ?? RECALL_TOAST_DURATION_MS;
  const preview = options.preview?.trim();
  const title = "已发送";
  const description = preview
    ? preview.length > 60
      ? `${preview.slice(0, 60)}…`
      : preview
    : "5 秒内可点击撤销";

  const toastId = toastManager.add({
    type: "info",
    title,
    description,
    data: {
      threadId: options.threadId,
      allowCrossThreadVisibility: false,
      dismissAfterVisibleMs: duration,
    },
    actionProps: {
      children: "撤销",
      onClick: () => {
        // 立即关闭 toast，避免回滚过程中用户重复点击
        try {
          toastManager.close(toastId);
        } catch {
          // 关闭失败不阻塞撤销流程
        }
        void Promise.resolve(options.onRevert()).catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error("[messageRecall] revert failed", err);
        });
      },
    },
  });

  return toastId;
}
