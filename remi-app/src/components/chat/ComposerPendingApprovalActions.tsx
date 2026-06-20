/**
 * @file ComposerPendingApprovalActions.tsx
 * @description 聊天编辑器中待审批请求的操作按钮组，提供取消、拒绝、会话级允许和单次批准四种审批决策。
 */

import { type ApprovalRequestId, type ProviderApprovalDecision } from "~/contracts";
import { memo } from "react";
import { Button } from "../ui/button";

/**
 * ComposerPendingApprovalActions 组件的属性接口
 */
interface ComposerPendingApprovalActionsProps {
  /** 待审批请求的唯一标识 */
  requestId: ApprovalRequestId;
  /** 是否正在响应审批请求（响应期间禁用按钮） */
  isResponding: boolean;
  /** 审批决策回调，接收请求 ID 和决策类型 */
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<void>;
}

/**
 * ComposerPendingApprovalActions 组件
 * @description 渲染待审批请求的操作按钮，包括取消当前轮次、拒绝、会话级允许和单次批准
 */

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
