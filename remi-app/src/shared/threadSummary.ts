/**
 * @file threadSummary.ts
 * @description 绾跨▼鎽樿鐘舵€佽绠楀伐鍏锋ā鍧? * @purpose 鎻愪緵绾跨▼鍏冩暟鎹拰鐘舵€佽绠楃殑鍏变韩宸ュ叿鍑芥暟锛岀敤浜庤拷韪緟瀹℃壒銆佸緟鐢ㄦ埛杈撳叆绛夌姸鎬? * @exports 绾跨▼鎽樿鐘舵€佸拰鍏冩暟鎹绠楀嚱鏁? */

import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationThreadActivity,
} from "~/contracts";

/**
 * @interface ThreadSummaryMetadata
 * @description 绾跨▼鎽樿鍏冩暟鎹帴鍙? * @property {string | null} latestUserMessageAt - 鏈€鏂扮敤鎴锋秷鎭殑鏃堕棿鎴筹紙ISO 鏍煎紡锛? * @property {boolean} hasPendingApprovals - 鏄惁瀛樺湪寰呭鎵圭殑璇锋眰
 * @property {boolean} hasPendingUserInput - 鏄惁瀛樺湪寰呯敤鎴疯緭鍏ョ殑璇锋眰
 * @property {boolean} hasActionableProposedPlan - 鏄惁瀛樺湪鍙墽琛岀殑鎻愯璁″垝锛堝皻鏈疄鏂斤級
 */
export interface ThreadSummaryMetadata {
  latestUserMessageAt: string | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
}

/**
 * @interface ThreadSummaryState
 * @description 绾跨▼鎽樿鐘舵€佹帴鍙ｏ紝缁ф壙鑷?ThreadSummaryMetadata
 * @property {number} pendingApprovalCount - 寰呭鎵硅姹傜殑鏁伴噺
 * @property {number} pendingUserInputCount - 寰呯敤鎴疯緭鍏ヨ姹傜殑鏁伴噺
 */
export interface ThreadSummaryState extends ThreadSummaryMetadata {
  pendingApprovalCount: number;
  pendingUserInputCount: number;
}

/**
 * @function maxIso
 * @description 姣旇緝涓や釜 ISO 鏃堕棿鎴冲瓧绗︿覆锛岃繑鍥炶緝澶х殑涓€涓? * @param {string | null} left - 宸︿晶鏃堕棿鎴? * @param {string} right - 鍙充晶鏃堕棿鎴? * @returns {string} 杈冨ぇ鐨勬椂闂存埑
 * @note 鐢ㄤ簬杩借釜鏈€鏂扮殑鐢ㄦ埛娑堟伅鏃堕棿
 */
function maxIso(left: string | null, right: string): string {
  if (left === null) {
    return right;
  }
  return left > right ? left : right;
}

/**
 * @function compareActivitiesByOrder
 * @description 鎸夐『搴忔瘮杈冧袱涓椿鍔ㄥ璞★紝鐢ㄤ簬鎺掑簭
 * @param {Object} left - 宸︿晶娲诲姩瀵硅薄
 * @param {Object} right - 鍙充晶娲诲姩瀵硅薄
 * @returns {number} 鎺掑簭姣旇緝缁撴灉锛堣礋鏁拌〃绀?left 鍦ㄥ墠锛屾鏁拌〃绀?right 鍦ㄥ墠锛? 琛ㄧず鐩哥瓑锛? * @note 浼樺厛鎸?sequence 鎺掑簭锛屽叾娆℃寜 createdAt 鎺掑簭锛屾渶鍚庢寜 id 鎺掑簭
 */
function compareActivitiesByOrder(
  left: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
  right: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
): number {
  // 濡傛灉娌℃湁 sequence锛屼娇鐢ㄦ渶澶у€肩‘淇濇帓鍦ㄦ渶鍚?  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  return (
    leftSequence - rightSequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * @function toPayloadRecord
 * @description 灏嗘湭鐭ョ被鍨嬬殑 payload 杞崲涓鸿褰曞璞? * @param {unknown} payload - 寰呰浆鎹㈢殑 payload
 * @returns {Record<string, unknown> | null} 濡傛灉鏄璞″垯杩斿洖璁板綍锛屽惁鍒欒繑鍥?null
 */
function toPayloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

/**
 * @function requestKindFromRequestType
 * @description 鏍规嵁璇锋眰绫诲瀷瀛楃涓叉帹瀵艰姹傜绫? * @param {unknown} requestType - 璇锋眰绫诲瀷瀛楃涓? * @returns {"command" | "file-read" | "file-change" | null} 璇锋眰绉嶇被锛屾湭璇嗗埆杩斿洖 null
 * @note 鏀寔澶氱璇锋眰绫诲瀷鍛藉悕鏍煎紡
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
 * @description 妫€鏌ュけ璐ヨ鎯呮槸鍚﹁〃绀鸿繃鏈熺殑寰呭鐞嗚姹? * @param {string | undefined} detail - 澶辫触璇︽儏瀛楃涓? * @returns {boolean} 濡傛灉鏄繃鏈熻姹傜殑澶辫触杩斿洖 true锛屽惁鍒欒繑鍥?false
 * @note 鐢ㄤ簬娓呯悊宸茶繃鏈熶絾鏈姝ｇ‘鍏抽棴鐨勫鎵?鐢ㄦ埛杈撳叆璇锋眰
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
 * @description 妫€鏌?payload 涓槸鍚﹀寘鍚粨鏋勫寲鐨勭敤鎴疯緭鍏ラ棶棰? * @param {Record<string, unknown> | null} payload - 寰呮鏌ョ殑 payload
 * @returns {boolean} 濡傛灉鍖呭惈鏈夋晥鐨勭粨鏋勫寲闂杩斿洖 true锛屽惁鍒欒繑鍥?false
 * @note 缁撴瀯鍖栭棶棰樺繀椤诲寘鍚?id銆乭eader銆乹uestion 鍜岃嚦灏戜竴涓湁鏁堢殑 option锛堝惈 label 鍜?description锛? */
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
 * @description 瑙ｆ瀽鏈€鏂扮殑鎻愯璁″垝
 * @param {Object} input - 杈撳叆鍙傛暟
 * @param {ReadonlyArray} input.proposedPlans - 鎻愯璁″垝鍒楄〃
 * @param {Object | null} input.latestTurn - 鏈€鏂扮殑杞淇℃伅
 * @returns {Object | null} 鏈€鏂扮殑鎻愯璁″垝锛屾湭鎵惧埌杩斿洖 null
 * @note 浼樺厛杩斿洖鏈€鏂拌疆娆＄殑璁″垝锛屽惁鍒欒繑鍥炲叏灞€鏈€鏂扮殑璁″垝
 */
function resolveLatestProposedPlan(input: {
  readonly proposedPlans: ReadonlyArray<
    Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt">
  >;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId"> | null;
}): Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt"> | null {
  // 濡傛灉瀛樺湪鏈€鏂拌疆娆★紝浼樺厛鏌ユ壘璇ヨ疆娆＄殑璁″垝
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

  // 鍚﹀垯杩斿洖鍏ㄥ眬鏈€鏂扮殑璁″垝
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
 * @description 浠庢秷鎭€佹椿鍔ㄥ拰璁″垝鍒楄〃涓帹瀵肩嚎绋嬫憳瑕佺姸鎬? * @param {Object} input - 杈撳叆鍙傛暟
 * @param {ReadonlyArray} input.messages - 娑堟伅鍒楄〃
 * @param {ReadonlyArray} input.activities - 娲诲姩鍒楄〃
 * @param {ReadonlyArray} input.proposedPlans - 鎻愯璁″垝鍒楄〃
 * @param {Object | null} input.latestTurn - 鏈€鏂拌疆娆′俊鎭? * @returns {ThreadSummaryState} 鎺ㄥ鍑虹殑绾跨▼鎽樿鐘舵€? * @note 閫氳繃杩借釜娲诲姩浜嬩欢鏉ヨ绠楀緟瀹℃壒鍜屽緟鐢ㄦ埛杈撳叆鐨勭姸鎬? */
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
  // 1. 杩借釜鏈€鏂扮殑鐢ㄦ埛娑堟伅鏃堕棿
  let latestUserMessageAt: string | null = null;
  for (const message of input.messages) {
    if (message.role === "user") {
      latestUserMessageAt = maxIso(latestUserMessageAt, message.createdAt);
    }
  }

  // 2. 杩借釜寰呭鎵瑰拰寰呯敤鎴疯緭鍏ョ殑璇锋眰
  const openApprovals = new Map<string, true>();
  const openUserInputs = new Map<string, true>();
  // 鎸夐『搴忔帓搴忔椿鍔紝纭繚浜嬩欢澶勭悊鐨勬纭€?  const orderedActivities = [...input.activities].toSorted(compareActivitiesByOrder);
  for (const activity of orderedActivities) {
    const payload = toPayloadRecord(activity.payload);
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;

    // 澶勭悊瀹℃壒璇锋眰寮€濮?    if (activity.kind === "approval.requested" && requestId) {
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

    // 澶勭悊瀹℃壒璇锋眰瀹屾垚
    if (activity.kind === "approval.resolved" && requestId) {
      openApprovals.delete(requestId);
      continue;
    }

    // 澶勭悊瀹℃壒璇锋眰鍝嶅簲澶辫触锛堣繃鏈熻姹傦級
    if (
      activity.kind === "provider.approval.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openApprovals.delete(requestId);
      continue;
    }

    // 澶勭悊鐢ㄦ埛杈撳叆璇锋眰寮€濮?    if (activity.kind === "user-input.requested" && requestId) {
      if (hasStructuredUserInputQuestions(payload)) {
        openUserInputs.set(requestId, true);
      }
      continue;
    }

    // 澶勭悊鐢ㄦ埛杈撳叆璇锋眰瀹屾垚
    if (activity.kind === "user-input.resolved" && requestId) {
      openUserInputs.delete(requestId);
      continue;
    }

    // 澶勭悊鐢ㄦ埛杈撳叆璇锋眰鍝嶅簲澶辫触锛堣繃鏈熻姹傦級
    if (
      activity.kind === "provider.user-input.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openUserInputs.delete(requestId);
    }
  }

  // 3. 瑙ｆ瀽鏈€鏂扮殑鎻愯璁″垝
  const latestProposedPlan = resolveLatestProposedPlan({
    proposedPlans: input.proposedPlans,
    latestTurn: input.latestTurn,
  });

  // 4. 鏋勫缓骞惰繑鍥炴憳瑕佺姸鎬?  return {
    latestUserMessageAt,
    pendingApprovalCount: openApprovals.size,
    pendingUserInputCount: openUserInputs.size,
    hasPendingApprovals: openApprovals.size > 0,
    hasPendingUserInput: openUserInputs.size > 0,
    // 濡傛灉鏈€鏂拌鍒掑皻鏈疄鏂斤紝鍒欒涓哄瓨鍦ㄥ彲鎵ц鐨勮鍒?    hasActionableProposedPlan: latestProposedPlan?.implementedAt === null,
  };
}

/**
 * @function deriveThreadSummaryMetadata
 * @description 浠庢秷鎭€佹椿鍔ㄥ拰璁″垝鍒楄〃涓帹瀵肩嚎绋嬫憳瑕佸厓鏁版嵁锛堜笉鍖呭惈璁℃暟锛? * @param {Object} input - 杈撳叆鍙傛暟
 * @param {ReadonlyArray} input.messages - 娑堟伅鍒楄〃
 * @param {ReadonlyArray} input.activities - 娲诲姩鍒楄〃
 * @param {ReadonlyArray} input.proposedPlans - 鎻愯璁″垝鍒楄〃
 * @param {Object | null} input.latestTurn - 鏈€鏂拌疆娆′俊鎭? * @returns {ThreadSummaryMetadata} 鎺ㄥ鍑虹殑绾跨▼鎽樿鍏冩暟鎹? * @note 渚挎嵎灏佽锛氳皟鐢?deriveThreadSummaryState 骞朵粎杩斿洖鍏冩暟鎹儴鍒? */
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
