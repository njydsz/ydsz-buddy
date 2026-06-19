/**
 * @file threadSummary.ts
 * @description 线程摘要状态计算工具模块
 * @purpose 提供线程元数据和状态计算的共享工具函数，用于追踪待审批、待用户输入等状态
 * @exports 线程摘要状态和元数据计算函数
 */

import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationThreadActivity,
} from "@remi-code/contracts";

/**
 * @interface ThreadSummaryMetadata
 * @description 线程摘要元数据接口
 * @property {string | null} latestUserMessageAt - 最新用户消息的时间戳（ISO 格式）
 * @property {boolean} hasPendingApprovals - 是否存在待审批的请求
 * @property {boolean} hasPendingUserInput - 是否存在待用户输入的请求
 * @property {boolean} hasActionableProposedPlan - 是否存在可执行的提议计划（尚未实施）
 */
export interface ThreadSummaryMetadata {
  latestUserMessageAt: string | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
}

/**
 * @interface ThreadSummaryState
 * @description 线程摘要状态接口，继承自 ThreadSummaryMetadata
 * @property {number} pendingApprovalCount - 待审批请求的数量
 * @property {number} pendingUserInputCount - 待用户输入请求的数量
 */
export interface ThreadSummaryState extends ThreadSummaryMetadata {
  pendingApprovalCount: number;
  pendingUserInputCount: number;
}

/**
 * @function maxIso
 * @description 比较两个 ISO 时间戳字符串，返回较大的一个
 * @param {string | null} left - 左侧时间戳
 * @param {string} right - 右侧时间戳
 * @returns {string} 较大的时间戳
 * @note 用于追踪最新的用户消息时间
 */
function maxIso(left: string | null, right: string): string {
  if (left === null) {
    return right;
  }
  return left > right ? left : right;
}

/**
 * @function compareActivitiesByOrder
 * @description 按顺序比较两个活动对象，用于排序
 * @param {Object} left - 左侧活动对象
 * @param {Object} right - 右侧活动对象
 * @returns {number} 排序比较结果（负数表示 left 在前，正数表示 right 在前，0 表示相等）
 * @note 优先按 sequence 排序，其次按 createdAt 排序，最后按 id 排序
 */
function compareActivitiesByOrder(
  left: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
  right: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
): number {
  // 如果没有 sequence，使用最大值确保排在最后
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  return (
    leftSequence - rightSequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * @function toPayloadRecord
 * @description 将未知类型的 payload 转换为记录对象
 * @param {unknown} payload - 待转换的 payload
 * @returns {Record<string, unknown> | null} 如果是对象则返回记录，否则返回 null
 */
function toPayloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

/**
 * @function requestKindFromRequestType
 * @description 根据请求类型字符串推导请求种类
 * @param {unknown} requestType - 请求类型字符串
 * @returns {"command" | "file-read" | "file-change" | null} 请求种类，未识别返回 null
 * @note 支持多种请求类型命名格式
 */
function requestKindFromRequestType(
  requestType: unknown,
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

/**
 * @function isStalePendingRequestFailureDetail
 * @description 检查失败详情是否表示过期的待处理请求
 * @param {string | undefined} detail - 失败详情字符串
 * @returns {boolean} 如果是过期请求的失败返回 true，否则返回 false
 * @note 用于清理已过期但未被正确关闭的审批/用户输入请求
 */
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

/**
 * @function hasStructuredUserInputQuestions
 * @description 检查 payload 中是否包含结构化的用户输入问题
 * @param {Record<string, unknown> | null} payload - 待检查的 payload
 * @returns {boolean} 如果包含有效的结构化问题返回 true，否则返回 false
 * @note 结构化问题必须包含 id、header、question 和至少一个有效的 option（含 label 和 description）
 */
function hasStructuredUserInputQuestions(payload: Record<string, unknown> | null): boolean {
  const questions = payload?.questions;
  if (!Array.isArray(questions)) {
    return false;
  }
  return questions.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const question = entry as Record<string, unknown>;
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
        const optionRecord = option as Record<string, unknown>;
        return (
          typeof optionRecord.label === "string" && typeof optionRecord.description === "string"
        );
      })
    );
  });
}

/**
 * @function resolveLatestProposedPlan
 * @description 解析最新的提议计划
 * @param {Object} input - 输入参数
 * @param {ReadonlyArray} input.proposedPlans - 提议计划列表
 * @param {Object | null} input.latestTurn - 最新的轮次信息
 * @returns {Object | null} 最新的提议计划，未找到返回 null
 * @note 优先返回最新轮次的计划，否则返回全局最新的计划
 */
function resolveLatestProposedPlan(input: {
  readonly proposedPlans: ReadonlyArray<
    Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt">
  >;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId"> | null;
}): Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt"> | null {
  // 如果存在最新轮次，优先查找该轮次的计划
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

  // 否则返回全局最新的计划
  return (
    [...input.proposedPlans]
      .toSorted(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
      )
      .at(-1) ?? null
  );
}

/**
 * @function deriveThreadSummaryState
 * @description 从消息、活动和计划列表中推导线程摘要状态
 * @param {Object} input - 输入参数
 * @param {ReadonlyArray} input.messages - 消息列表
 * @param {ReadonlyArray} input.activities - 活动列表
 * @param {ReadonlyArray} input.proposedPlans - 提议计划列表
 * @param {Object | null} input.latestTurn - 最新轮次信息
 * @returns {ThreadSummaryState} 推导出的线程摘要状态
 * @note 通过追踪活动事件来计算待审批和待用户输入的状态
 */
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
  // 1. 追踪最新的用户消息时间
  let latestUserMessageAt: string | null = null;
  for (const message of input.messages) {
    if (message.role === "user") {
      latestUserMessageAt = maxIso(latestUserMessageAt, message.createdAt);
    }
  }

  // 2. 追踪待审批和待用户输入的请求
  const openApprovals = new Map<string, true>();
  const openUserInputs = new Map<string, true>();
  // 按顺序排序活动，确保事件处理的正确性
  const orderedActivities = [...input.activities].toSorted(compareActivitiesByOrder);
  for (const activity of orderedActivities) {
    const payload = toPayloadRecord(activity.payload);
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;

    // 处理审批请求开始
    if (activity.kind === "approval.requested" && requestId) {
      const requestKind =
        payload?.requestKind === "command" ||
        payload?.requestKind === "file-read" ||
        payload?.requestKind === "file-change"
          ? payload.requestKind
          : requestKindFromRequestType(payload?.requestType);
      if (requestKind) {
        openApprovals.set(requestId, true);
      }
      continue;
    }

    // 处理审批请求完成
    if (activity.kind === "approval.resolved" && requestId) {
      openApprovals.delete(requestId);
      continue;
    }

    // 处理审批请求响应失败（过期请求）
    if (
      activity.kind === "provider.approval.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openApprovals.delete(requestId);
      continue;
    }

    // 处理用户输入请求开始
    if (activity.kind === "user-input.requested" && requestId) {
      if (hasStructuredUserInputQuestions(payload)) {
        openUserInputs.set(requestId, true);
      }
      continue;
    }

    // 处理用户输入请求完成
    if (activity.kind === "user-input.resolved" && requestId) {
      openUserInputs.delete(requestId);
      continue;
    }

    // 处理用户输入请求响应失败（过期请求）
    if (
      activity.kind === "provider.user-input.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openUserInputs.delete(requestId);
    }
  }

  // 3. 解析最新的提议计划
  const latestProposedPlan = resolveLatestProposedPlan({
    proposedPlans: input.proposedPlans,
    latestTurn: input.latestTurn,
  });

  // 4. 构建并返回摘要状态
  return {
    latestUserMessageAt,
    pendingApprovalCount: openApprovals.size,
    pendingUserInputCount: openUserInputs.size,
    hasPendingApprovals: openApprovals.size > 0,
    hasPendingUserInput: openUserInputs.size > 0,
    // 如果最新计划尚未实施，则认为存在可执行的计划
    hasActionableProposedPlan: latestProposedPlan?.implementedAt === null,
  };
}

/**
 * @function deriveThreadSummaryMetadata
 * @description 从消息、活动和计划列表中推导线程摘要元数据（不包含计数）
 * @param {Object} input - 输入参数
 * @param {ReadonlyArray} input.messages - 消息列表
 * @param {ReadonlyArray} input.activities - 活动列表
 * @param {ReadonlyArray} input.proposedPlans - 提议计划列表
 * @param {Object | null} input.latestTurn - 最新轮次信息
 * @returns {ThreadSummaryMetadata} 推导出的线程摘要元数据
 * @note 便捷封装：调用 deriveThreadSummaryState 并仅返回元数据部分
 */
export function deriveThreadSummaryMetadata(input: {
  readonly messages: ReadonlyArray<Pick<OrchestrationMessage, "role" | "createdAt">>;
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
