/**
 * @file Composer 待审批操作组件
 *
 * 本组件提供"批准"/"拒绝"/"始终批准"三个操作按钮，
 * 用于待审批请求的快速决策。
 *
 * ## 核心导出
 *
 * - `ComposerPendingApprovalActions`：操作按钮组
 *
 * ## 使用场景
 *
 * - ComposerPendingApprovalPanel 内部
 * - 待审批消息行尾
 *
 * ## 注意事项
 *
 * - "始终批准" 仅对当前会话生效
 * - 拒绝时可附带原因
 * - 决策通过 WebSocket 实时同步
 */

import { type ApprovalRequestId, type ProviderApprovalDecision } from "~/contracts";
import { memo } from "react";
import { Button } from "../ui/button";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<void>;
}

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={isResponding}
        onClick={() => void onRespondToApproval(requestId, "cancel")}
      >
        Cancel turn
      </Button>
      <Button
        size="sm"
        variant="destructive-outline"
        disabled={isResponding}
        onClick={() => void onRespondToApproval(requestId, "decline")}
      >
        Decline
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isResponding}
        onClick={() => void onRespondToApproval(requestId, "acceptForSession")}
      >
        Always allow this session
      </Button>
      <Button
        size="sm"
        variant="default"
        disabled={isResponding}
        onClick={() => void onRespondToApproval(requestId, "accept")}
      >
        Approve once
      </Button>
    </>
  );
});
