/**
 * @file threadSummary.ts
 * @description 缁捐法鈻奸幗妯款洣閻樿埖鈧浇顓哥粻妤€浼愰崗閿嬆侀崸? * @purpose 閹绘劒绶电痪璺ㄢ柤閸忓啯鏆熼幑顔兼嫲閻樿埖鈧浇顓哥粻妤冩畱閸忓彉闊╁銉ュ徔閸戣姤鏆熼敍宀€鏁ゆ禍搴ゆ嫹闊亜绶熺€光剝澹掗妴浣哥窡閻劍鍩涙潏鎾冲弳缁涘濮搁幀? * @exports 缁捐法鈻奸幗妯款洣閻樿埖鈧礁鎷伴崗鍐╂殶閹诡喛顓哥粻妤€鍤遍弫? */

import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationThreadActivity,
} from "~/contracts";

/**
 * @interface ThreadSummaryMetadata
 * @description 缁捐法鈻奸幗妯款洣閸忓啯鏆熼幑顔藉复閸? * @property {string | null} latestUserMessageAt - 閺堚偓閺傛壆鏁ら幋閿嬬Х閹垳娈戦弮鍫曟？閹寸绱橧SO 閺嶇厧绱￠敍? * @property {boolean} hasPendingApprovals - 閺勵垰鎯佺€涙ê婀鍛吀閹靛湱娈戠拠閿嬬湴
 * @property {boolean} hasPendingUserInput - 閺勵垰鎯佺€涙ê婀鍛暏閹寸柉绶崗銉ф畱鐠囬攱鐪? * @property {boolean} hasActionableProposedPlan - 閺勵垰鎯佺€涙ê婀崣顖涘⒔鐞涘瞼娈戦幓鎰唴鐠佲€冲灊閿涘牆鐨婚張顏勭杽閺傛枻绱? */
export interface ThreadSummaryMetadata {
  latestUserMessageAt: string | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
}

/**
 * @interface ThreadSummaryState
 * @description 缁捐法鈻奸幗妯款洣閻樿埖鈧焦甯撮崣锝忕礉缂佈勫閼?ThreadSummaryMetadata
 * @property {number} pendingApprovalCount - 瀵板懎顓搁幍纭咁嚞濮瑰倻娈戦弫浼村櫤
 * @property {number} pendingUserInputCount - 瀵板懐鏁ら幋鐤翻閸忋儴顕Ч鍌滄畱閺佷即鍣? */
export interface ThreadSummaryState extends ThreadSummaryMetadata {
  pendingApprovalCount: number;
  pendingUserInputCount: number;
}

/**
 * @function maxIso
 * @description 濮ｆ棁绶濇稉銈勯嚋 ISO 閺冨爼妫块幋鍐茬摟缁楋缚瑕嗛敍宀冪箲閸ョ偠绶濇径褏娈戞稉鈧稉? * @param {string | null} left - 瀹革缚鏅堕弮鍫曟？閹? * @param {string} right - 閸欏厖鏅堕弮鍫曟？閹? * @returns {string} 鏉堝啫銇囬惃鍕闂傚瓨鍩? * @note 閻劋绨潻鍊熼嚋閺堚偓閺傛壆娈戦悽銊﹀煕濞戝牊浼呴弮鍫曟？
 */
function maxIso(left: string | null, right: string): string {
  if (left === null) {
    return right;
  }
  return left > right ? left : right;
}

/**
 * @function compareActivitiesByOrder
 * @description 閹稿銆庢惔蹇旂槷鏉堝啩琚辨稉顏呮た閸斻劌顕挒鈽呯礉閻劋绨幒鎺戠碍
 * @param {Object} left - 瀹革缚鏅跺ú璇插З鐎电钖? * @param {Object} right - 閸欏厖鏅跺ú璇插З鐎电钖? * @returns {number} 閹烘帒绨В鏃囩窛缂佹挻鐏夐敍鍫ｇ閺佹媽銆冪粈?left 閸︺劌澧犻敍灞绢劀閺佹媽銆冪粈?right 閸︺劌澧犻敍? 鐞涖劎銇氶惄鍝ョ搼閿? * @note 娴兼ê鍘涢幐?sequence 閹烘帒绨敍灞藉従濞嗏剝瀵?createdAt 閹烘帒绨敍灞炬付閸氬孩瀵?id 閹烘帒绨? */
function compareActivitiesByOrder(
  left: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
  right: Pick<OrchestrationThreadActivity, "createdAt" | "id" | "sequence">,
): number {
  // 婵″倹鐏夊▽鈩冩箒 sequence閿涘奔濞囬悽銊︽付婢堆冣偓鑲┾€樻穱婵囧笓閸︺劍娓堕崥?  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  return (
    leftSequence - rightSequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * @function toPayloadRecord
 * @description 鐏忓棙婀惌銉ц閸ㄥ娈?payload 鏉烆剚宕叉稉楦款唶瑜版洖顕挒? * @param {unknown} payload - 瀵板懓娴嗛幑銏㈡畱 payload
 * @returns {Record<string, unknown> | null} 婵″倹鐏夐弰顖氼嚠鐠炩€冲灟鏉╂柨娲栫拋鏉跨秿閿涘苯鎯侀崚娆掔箲閸?null
 */
function toPayloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

/**
 * @function requestKindFromRequestType
 * @description 閺嶈宓佺拠閿嬬湴缁鐎风€涙顑佹稉鍙夊腹鐎佃壈顕Ч鍌滎潚缁? * @param {unknown} requestType - 鐠囬攱鐪扮猾璇茬€风€涙顑佹稉? * @returns {"command" | "file-read" | "file-change" | null} 鐠囬攱鐪扮粔宥囪閿涘本婀拠鍡楀焼鏉╂柨娲?null
 * @note 閺€顖涘瘮婢舵氨顫掔拠閿嬬湴缁鐎烽崨钘夋倳閺嶇厧绱? */
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
 * @description 濡偓閺屻儱銇戠拹銉嚊閹懏妲搁崥锕併€冪粈楦跨箖閺堢喓娈戝鍛槱閻炲棜顕Ч? * @param {string | undefined} detail - 婢惰精瑙︾拠锔藉剰鐎涙顑佹稉? * @returns {boolean} 婵″倹鐏夐弰顖濈箖閺堢喕顕Ч鍌滄畱婢惰精瑙︽潻鏂挎礀 true閿涘苯鎯侀崚娆掔箲閸?false
 * @note 閻劋绨〒鍛倞瀹歌尪绻冮張鐔剁稻閺堫亣顫﹀锝団€橀崗鎶芥４閻ㄥ嫬顓搁幍?閻劍鍩涙潏鎾冲弳鐠囬攱鐪? */
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
 * @description 濡偓閺?payload 娑擃厽妲搁崥锕€瀵橀崥顐ょ波閺嬪嫬瀵查惃鍕暏閹寸柉绶崗銉╂６妫? * @param {Record<string, unknown> | null} payload - 瀵板懏顥呴弻銉ф畱 payload
 * @returns {boolean} 婵″倹鐏夐崠鍛儓閺堝鏅ラ惃鍕波閺嬪嫬瀵查梻顕€顣芥潻鏂挎礀 true閿涘苯鎯侀崚娆掔箲閸?false
 * @note 缂佹挻鐎崠鏍６妫版ê绻€妞よ瀵橀崥?id閵嗕弓eader閵嗕构uestion 閸滃矁鍤︾亸鎴滅娑擃亝婀侀弫鍫㈡畱 option閿涘牆鎯?label 閸?description閿? */
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
 * @description 鐟欙絾鐎介張鈧弬鎵畱閹绘劘顔呯拋鈥冲灊
 * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {ReadonlyArray} input.proposedPlans - 閹绘劘顔呯拋鈥冲灊閸掓銆? * @param {Object | null} input.latestTurn - 閺堚偓閺傛壆娈戞潪顔筋偧娣団剝浼? * @returns {Object | null} 閺堚偓閺傛壆娈戦幓鎰唴鐠佲€冲灊閿涘本婀幍鎯у煂鏉╂柨娲?null
 * @note 娴兼ê鍘涙潻鏂挎礀閺堚偓閺傛媽鐤嗗▎锛勬畱鐠佲€冲灊閿涘苯鎯侀崚娆掔箲閸ョ偛鍙忕仦鈧張鈧弬鎵畱鐠佲€冲灊
 */
function resolveLatestProposedPlan(input: {
  readonly proposedPlans: ReadonlyArray<
    Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt">
  >;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "turnId"> | null;
}): Pick<OrchestrationProposedPlan, "id" | "turnId" | "updatedAt" | "implementedAt"> | null {
  // 婵″倹鐏夌€涙ê婀張鈧弬鎷岀枂濞嗏槄绱濇导妯哄帥閺屻儲澹樼拠銉ㄧ枂濞嗭紕娈戠拋鈥冲灊
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

  // 閸氾箑鍨潻鏂挎礀閸忋劌鐪張鈧弬鎵畱鐠佲€冲灊
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
 * @description 娴犲孩绉烽幁顖樷偓浣规た閸斻劌鎷扮拋鈥冲灊閸掓銆冩稉顓熷腹鐎佃偐鍤庣粙瀣喅鐟曚胶濮搁幀? * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {ReadonlyArray} input.messages - 濞戝牊浼呴崚妤勩€? * @param {ReadonlyArray} input.activities - 濞茶濮╅崚妤勩€? * @param {ReadonlyArray} input.proposedPlans - 閹绘劘顔呯拋鈥冲灊閸掓銆? * @param {Object | null} input.latestTurn - 閺堚偓閺傛媽鐤嗗▎鈥蹭繆閹? * @returns {ThreadSummaryState} 閹恒劌顕遍崙铏规畱缁捐法鈻奸幗妯款洣閻樿埖鈧? * @note 闁俺绻冩潻鍊熼嚋濞茶濮╂禍瀣╂閺夈儴顓哥粻妤€绶熺€光剝澹掗崪灞界窡閻劍鍩涙潏鎾冲弳閻ㄥ嫮濮搁幀? */
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
  // 1. 鏉╁€熼嚋閺堚偓閺傛壆娈戦悽銊﹀煕濞戝牊浼呴弮鍫曟？
  let latestUserMessageAt: string | null = null;
  for (const message of input.messages) {
    if (message.role === "user") {
      latestUserMessageAt = maxIso(latestUserMessageAt, message.createdAt);
    }
  }

  // 2. 鏉╁€熼嚋瀵板懎顓搁幍鐟版嫲瀵板懐鏁ら幋鐤翻閸忋儳娈戠拠閿嬬湴
  const openApprovals = new Map<string, true>();
  const openUserInputs = new Map<string, true>();
  // 閹稿銆庢惔蹇斿笓鎼村繑妞块崝顭掔礉绾喕绻氭禍瀣╂婢跺嫮鎮婇惃鍕劀绾喗鈧?  const orderedActivities = [...input.activities].toSorted(compareActivitiesByOrder);
  for (const activity of orderedActivities) {
    const payload = toPayloadRecord(activity.payload);
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;

    // 婢跺嫮鎮婄€光剝澹掔拠閿嬬湴瀵偓婵?    if (activity.kind === "approval.requested" && requestId) {
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

    // 婢跺嫮鎮婄€光剝澹掔拠閿嬬湴鐎瑰本鍨?    if (activity.kind === "approval.resolved" && requestId) {
      openApprovals.delete(requestId);
      continue;
    }

    // 婢跺嫮鎮婄€光剝澹掔拠閿嬬湴閸濆秴绨叉径杈Е閿涘牐绻冮張鐔活嚞濮瑰偊绱?    if (
      activity.kind === "provider.approval.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openApprovals.delete(requestId);
      continue;
    }

    // 婢跺嫮鎮婇悽銊﹀煕鏉堟挸鍙嗙拠閿嬬湴瀵偓婵?    if (activity.kind === "user-input.requested" && requestId) {
      if (hasStructuredUserInputQuestions(payload)) {
        openUserInputs.set(requestId, true);
      }
      continue;
    }

    // 婢跺嫮鎮婇悽銊﹀煕鏉堟挸鍙嗙拠閿嬬湴鐎瑰本鍨?    if (activity.kind === "user-input.resolved" && requestId) {
      openUserInputs.delete(requestId);
      continue;
    }

    // 婢跺嫮鎮婇悽銊﹀煕鏉堟挸鍙嗙拠閿嬬湴閸濆秴绨叉径杈Е閿涘牐绻冮張鐔活嚞濮瑰偊绱?    if (
      activity.kind === "provider.user-input.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openUserInputs.delete(requestId);
    }
  }

  // 3. 鐟欙絾鐎介張鈧弬鎵畱閹绘劘顔呯拋鈥冲灊
  const latestProposedPlan = resolveLatestProposedPlan({
    proposedPlans: input.proposedPlans,
    latestTurn: input.latestTurn,
  });

  // 4. 閺嬪嫬缂撻獮鎯扮箲閸ョ偞鎲崇憰浣哄Ц閹?  return {
    latestUserMessageAt,
    pendingApprovalCount: openApprovals.size,
    pendingUserInputCount: openUserInputs.size,
    hasPendingApprovals: openApprovals.size > 0,
    hasPendingUserInput: openUserInputs.size > 0,
    // 婵″倹鐏夐張鈧弬鎷岊吀閸掓帒鐨婚張顏勭杽閺傛枻绱濋崚娆掝吇娑撳搫鐡ㄩ崷銊ュ讲閹笛嗩攽閻ㄥ嫯顓搁崚?    hasActionableProposedPlan: latestProposedPlan?.implementedAt === null,
  };
}

/**
 * @function deriveThreadSummaryMetadata
 * @description 娴犲孩绉烽幁顖樷偓浣规た閸斻劌鎷扮拋鈥冲灊閸掓銆冩稉顓熷腹鐎佃偐鍤庣粙瀣喅鐟曚礁鍘撻弫鐗堝祦閿涘牅绗夐崠鍛儓鐠佲剝鏆熼敍? * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {ReadonlyArray} input.messages - 濞戝牊浼呴崚妤勩€? * @param {ReadonlyArray} input.activities - 濞茶濮╅崚妤勩€? * @param {ReadonlyArray} input.proposedPlans - 閹绘劘顔呯拋鈥冲灊閸掓銆? * @param {Object | null} input.latestTurn - 閺堚偓閺傛媽鐤嗗▎鈥蹭繆閹? * @returns {ThreadSummaryMetadata} 閹恒劌顕遍崙铏规畱缁捐法鈻奸幗妯款洣閸忓啯鏆熼幑? * @note 娓氭寧宓庣亸浣筋棅閿涙俺鐨熼悽?deriveThreadSummaryState 楠炴湹绮庢潻鏂挎礀閸忓啯鏆熼幑顕€鍎撮崚? */
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
