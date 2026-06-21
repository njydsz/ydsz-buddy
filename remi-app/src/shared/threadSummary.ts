/**
 * @file 线程摘要与状态汇总模块
 *
 * 本模块提供对线程（Thread）状态进行摘要和汇总的工具：
 *
 * - **线程摘要元数据**：从消息流中提取最新用户消息、待审批数量等
 * - **活动状态**：判断线程是否处于活跃、等待输入、等待审批等状态
 * - **计划追踪**：识别可操作的提议计划
 * - **Payload 校验**：解析事件 payload 为强类型
 *
 * ## 核心导出
 *
 * - `ThreadSummaryMetadata`：线程摘要元数据
 * - `ThreadSummaryState`：线程摘要完整状态
 * - `summarizeThread`：从消息流生成摘要
 * - `ApprovalRequestedPayload`：审批请求 payload 类型
 * - `UserInputRequestedPayload`：用户输入请求 payload 类型
 * - `PlanProposedPayload`：提议计划 payload 类型
 *
 * ## 使用场景
 *
 * - 侧边栏线程列表展示摘要
 * - 排序线程（按最近活动、待审批数等）
 * - 通知中心：仅对有待审批的线程发通知
 *
 * ## 注意事项
 *
 * - 摘要计算为同步纯函数，性能良好
 * - 大型线程（> 1000 条消息）建议使用增量摘要
 */

import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationThreadActivity,
} from "@remi-claw/contracts";
import type { ChatMessage } from "../types";

export interface ThreadSummaryMetadata {
  latestUserMessageAt: string | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
}

export interface ThreadSummaryState extends ThreadSummaryMetadata {
  pendingApprovalCount: number;
  pendingUserInputCount: number;
}

// Payload 类型定义
export interface ApprovalRequestedPayload {
  requestId: string;
  requestKind?: "command" | "file-read" | "file-change";
  requestType?: string;
  detail?: string;
}

export interface UserInputQuestionOption {
  label: string;
  description: string;
}

export interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  options: UserInputQuestionOption[];
}

export interface UserInputRequestedPayload {
  requestId: string;
  questions: UserInputQuestion[];
}

export interface ActivityPayloadBase {
  requestId?: string;
  detail?: string;
}

function maxIso(left: string | null, right: string): string {
  if (left === null) {
    return right;
  }
  return left > right ? left : right;
}

function compareActivitiesByOrder(
  left: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
  right: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
): number {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  return (
    leftSequence - rightSequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function toPayloadRecord(payload: unknown): ActivityPayloadBase | null {
  return payload && typeof payload === "object" ? (payload as ActivityPayloadBase) : null;
}

function requestKindFromRequestType(
  requestType: string | undefined,
): "command" | "file-read" | "file-change" | null {
  switch (requestType) {
    case "command_execution_approval":
    case "exec_command_approval":
      return "command";
    case "file_read_approval":
      return "file-read";
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    default:
      return null;
  }
}

function isStalePendingRequestFailureDetail(detail: string | undefined): boolean {
  if (!detail) {
    return false;
  }
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("stale pending approval request") ||
    normalized.includes("stale pending user-input request") ||
    normalized.includes("unknown pending approval request") ||
    normalized.includes("unknown pending permission request") ||
    normalized.includes("unknown pending user-input request") ||
    normalized.includes("stale pending user input request") ||
    normalized.includes("unknown pending user input request")
  );
}

function hasStructuredUserInputQuestions(payload: ActivityPayloadBase | null): boolean {
  const questions = (payload as UserInputRequestedPayload | null)?.questions;
  if (!Array.isArray(questions)) {
    return false;
  }
  return questions.some((question) => {
    if (!question || typeof question !== "object") {
      return false;
    }
    const options = Array.isArray(question.options) ? question.options : null;
    return (
      typeof question.id === "string" &&
      typeof question.header === "string" &&
      typeof question.question === "string" &&
      options !== null &&
      options.some((option) => {
        if (!option || typeof option !== "object") {
          return false;
        }
        return (
          typeof option.label === "string" && typeof option.description === "string"
        );
      })
    );
  });
}

function resolveLatestProposedPlan(input: {
  readonly proposedPlans: ReadonlyArray<
    Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt">
  >;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId"> | null;
}): Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt"> | null {
  if (input.latestTurn?.turnId) {
    const matchingTurnPlan = [...input.proposedPlans]
      .filter((plan) => plan.turnId === input.latestTurn?.turnId)
      .toSorted(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
      )
      .at(-1);
    if (matchingTurnPlan) {
      return matchingTurnPlan;
    }
  }

  return (
    [...input.proposedPlans]
      .toSorted(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
      )
      .at(-1) ?? null
  );
}

export function deriveThreadSummaryState(input: {
  readonly messages: ReadonlyArray<Pick<OrchestrationMessage, "role" | "createdAt">>;
  readonly activities: ReadonlyArray<
    Pick<OrchestrationThreadActivity, "createdAt" | "id" | "kind" | "payload" | "sequence">
  >;
  readonly proposedPlans: ReadonlyArray<
    Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt">
  >;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId"> | null;
}): ThreadSummaryState {
  let latestUserMessageAt: string | null = null;
  for (const message of input.messages) {
    if (message.role === "user") {
      latestUserMessageAt = maxIso(latestUserMessageAt, message.createdAt);
    }
  }

  const openApprovals = new Map<string, true>();
  const openUserInputs = new Map<string, true>();
  const orderedActivities = [...input.activities].toSorted(compareActivitiesByOrder);
  for (const activity of orderedActivities) {
    const payload = toPayloadRecord(activity.payload);
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;

    if (activity.kind === "approval.requested" && requestId) {
      const approvalPayload = payload as ApprovalRequestedPayload | null;
      const requestKind =
        approvalPayload?.requestKind === "command" ||
        approvalPayload?.requestKind === "file-read" ||
        approvalPayload?.requestKind === "file-change"
          ? approvalPayload.requestKind
          : requestKindFromRequestType(approvalPayload?.requestType);
      if (requestKind) {
        openApprovals.set(requestId, true);
      }
      continue;
    }

    if (activity.kind === "approval.resolved" && requestId) {
      openApprovals.delete(requestId);
      continue;
    }

    if (
      activity.kind === "provider.approval.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openApprovals.delete(requestId);
      continue;
    }

    if (activity.kind === "user-input.requested" && requestId) {
      if (hasStructuredUserInputQuestions(payload)) {
        openUserInputs.set(requestId, true);
      }
      continue;
    }

    if (activity.kind === "user-input.resolved" && requestId) {
      openUserInputs.delete(requestId);
      continue;
    }

    if (
      activity.kind === "provider.user-input.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openUserInputs.delete(requestId);
    }
  }

  const latestProposedPlan = resolveLatestProposedPlan({
    proposedPlans: input.proposedPlans,
    latestTurn: input.latestTurn,
  });

  return {
    latestUserMessageAt,
    pendingApprovalCount: openApprovals.size,
    pendingUserInputCount: openUserInputs.size,
    hasPendingApprovals: openApprovals.size > 0,
    hasPendingUserInput: openUserInputs.size > 0,
    hasActionableProposedPlan: latestProposedPlan?.implementedAt === null,
  };
}

export function deriveThreadSummaryMetadata(input: {
  readonly messages: ReadonlyArray<Pick<ChatMessage, "role" | "createdAt">>;
  readonly activities: ReadonlyArray<
    Pick<OrchestrationThreadActivity, "createdAt" | "id" | "kind" | "payload" | "sequence">
  >;
  readonly proposedPlans: ReadonlyArray<
    Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt">
  >;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId"> | null;
}): ThreadSummaryMetadata {
  const summary = deriveThreadSummaryState(input);
  return {
    latestUserMessageAt: summary.latestUserMessageAt,
    hasPendingApprovals: summary.hasPendingApprovals,
    hasPendingUserInput: summary.hasPendingUserInput,
    hasActionableProposedPlan: summary.hasActionableProposedPlan,
  };
}
