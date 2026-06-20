/**
 * @file 鍏变韩瑙嗗浘妯″瀷绫诲瀷瀹氫箟
 * @description 瀹氫箟 Web 搴旂敤灞傜殑杩愯鏃?UI 绫诲瀷锛屽寘鎷嚎绋嬨€侀」鐩€佺粓绔竷灞€銆佷晶杈规爮鎽樿绛夛紝
 * 琚?store銆佽矾鐢卞拰缁勪欢骞挎硾娑堣垂銆? */

import type {
  ModelSelection,
  OrchestrationMessageSource,
  TurnDispatchMode,
  OrchestrationLatestTurn,
  OrchestrationThreadPullRequest,
  OrchestrationProposedPlanId,
  OrchestrationSessionStatus,
  OrchestrationThreadActivity,
  ThreadHandoff,
  ProjectScript as ContractProjectScript,
  ThreadId,
  ProjectId,
  TurnId,
  MessageId,
  ProviderKind,
  CheckpointRef,
  ProviderInteractionMode,
  ProjectKind,
  RuntimeMode,
  ThreadEnvironmentMode,
} from "~/contracts";

/** 浼氳瘽闃舵锛歞isconnected 鈫?connecting 鈫?ready 鈫?running */
export type SessionPhase = "disconnected" | "connecting" | "ready" | "running";
/** 榛樿杩愯鏃舵ā寮忥細瀹屽叏璁块棶鏉冮檺 */
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";

/** 榛樿浜や簰妯″紡 */
export const DEFAULT_INTERACTION_MODE: ProviderInteractionMode = "default";
/** 榛樿绾跨▼缁堢闈㈡澘楂樺害锛堝儚绱狅級 */
export const DEFAULT_THREAD_TERMINAL_HEIGHT = 280;
/** 榛樿缁堢闈㈡澘 ID */
export const DEFAULT_THREAD_TERMINAL_ID = "default";
/** 姣忎釜缁堢鍒嗙粍鍏佽鐨勬渶澶х粓绔暟閲?*/
export const MAX_TERMINALS_PER_GROUP = 6;
/** 缁堢闈㈡澘鐨勫睍绀烘ā寮忥細drawer锛堟娊灞夊紡锛夋垨 workspace锛堝伐浣滃尯寮忥級 */
export type ThreadTerminalPresentationMode = "drawer" | "workspace";
/** 缁堢宸ヤ綔鍖烘爣绛鹃〉绫诲瀷锛歵erminal锛堢粓绔級鎴?chat锛堣亰澶╋級 */
export type ThreadTerminalWorkspaceTab = "terminal" | "chat";
/** 缁堢宸ヤ綔鍖哄竷灞€妯″紡锛歜oth锛堝弻闈㈡澘锛夋垨 terminal-only锛堜粎缁堢锛?*/
export type ThreadTerminalWorkspaceLayout = "both" | "terminal-only";
/** 绾跨▼涓荤晫闈細chat锛堣亰澶╋級鎴?terminal锛堢粓绔級 */
export type ThreadPrimarySurface = "chat" | "terminal";
/** 椤圭洰鑴氭湰閰嶇疆锛岀洿鎺ュ鐢?contracts 涓殑瀹氫箟 */
export type ProjectScript = ContractProjectScript;

/** 缁堢鍒嗗睆鏂瑰悜锛歨orizontal锛堟按骞筹級鎴?vertical锛堝瀭鐩达級 */
export type ThreadTerminalSplitDirection = "horizontal" | "vertical";
/** 缁堢鍒嗗睆浣嶇疆锛歵op / right / bottom / left */
export type ThreadTerminalSplitPosition = "top" | "right" | "bottom" | "left";

/** 缁堢甯冨眬鍙跺瓙鑺傜偣锛岃〃绀轰竴涓寘鍚粓绔疄渚嬬殑闈㈡澘 */
export interface ThreadTerminalLeafNode {
  /** 鑺傜偣绫诲瀷鏍囪瘑锛氱粓绔彾瀛?*/
  type: "terminal";
  /** 闈㈡澘鍞竴 ID */
  paneId: string;
  /** 闈㈡澘涓寘鍚殑缁堢 ID 鍒楄〃 */
  terminalIds: string[];
  /** 褰撳墠婵€娲荤殑缁堢 ID */
  activeTerminalId: string;
}

/** 缁堢甯冨眬鍒嗗睆鑺傜偣锛岃〃绀轰竴涓彲閫掑綊宓屽鐨勫垎灞忓鍣?*/
export interface ThreadTerminalSplitNode {
  /** 鑺傜偣绫诲瀷鏍囪瘑锛氬垎灞?*/
  type: "split";
  /** 鍒嗗睆鑺傜偣鍞竴 ID */
  id: string;
  /** 鍒嗗睆鏂瑰悜 */
  direction: ThreadTerminalSplitDirection;
  /** 瀛愯妭鐐瑰垪琛紝鍙祵濂楀彾瀛愯妭鐐规垨鍒嗗睆鑺傜偣 */
  children: ThreadTerminalLayoutNode[];
  /** 鍚勫瓙鑺傜偣鐨勬潈閲嶆瘮渚?*/
  weights: number[];
}

/** 缁堢甯冨眬鑺傜偣锛氬彾瀛愯妭鐐规垨鍒嗗睆鑺傜偣鐨勮仈鍚堢被鍨?*/
export type ThreadTerminalLayoutNode = ThreadTerminalLeafNode | ThreadTerminalSplitNode;

/** 缁堢鍒嗙粍锛屽寘鍚竷灞€淇℃伅鍜屽綋鍓嶆縺娲荤殑缁堢 */
export interface ThreadTerminalGroup {
  /** 鍒嗙粍鍞竴 ID */
  id: string;
  /** 褰撳墠婵€娲荤殑缁堢 ID */
  activeTerminalId: string;
  /** 鍒嗙粍鐨勫竷灞€鏍?*/
  layout: ThreadTerminalLayoutNode;
}

/** 鑱婂ぉ鍥剧墖闄勪欢 */
export interface ChatImageAttachment {
  /** 闄勪欢绫诲瀷锛氬浘鐗?*/
  type: "image";
  /** 闄勪欢鍞竴 ID */
  id: string;
  /** 鏂囦欢鍚?*/
  name: string;
  /** MIME 绫诲瀷 */
  mimeType: string;
  /** 鏂囦欢澶у皬锛堝瓧鑺傦級 */
  sizeBytes: number;
  /** 鍥剧墖棰勮 URL锛屽彲閫?*/
  previewUrl?: string;
}

/** 鑱婂ぉ鍔╂墜閫夋嫨闄勪欢锛屽紩鐢ㄥ姪鎵嬫秷鎭腑鐨勬枃鏈墖娈?*/
export interface ChatAssistantSelectionAttachment {
  /** 闄勪欢绫诲瀷锛氬姪鎵嬮€夋嫨 */
  type: "assistant-selection";
  /** 闄勪欢鍞竴 ID */
  id: string;
  /** 琚紩鐢ㄧ殑鍔╂墜娑堟伅 ID */
  assistantMessageId: string;
  /** 閫変腑鐨勬枃鏈唴瀹?*/
  text: string;
}

/** 鑱婂ぉ闄勪欢锛氬浘鐗囨垨鍔╂墜鏂囨湰閫夋嫨鐨勮仈鍚堢被鍨?*/
export type ChatAttachment = ChatImageAttachment | ChatAssistantSelectionAttachment;

/** 鑱婂ぉ娑堟伅 */
export interface ChatMessage {
  /** 娑堟伅鍞竴 ID */
  id: MessageId;
  /** 娑堟伅瑙掕壊锛歶ser锛堢敤鎴凤級銆乤ssistant锛堝姪鎵嬶級銆乻ystem锛堢郴缁燂級 */
  role: "user" | "assistant" | "system";
  /** 娑堟伅鏂囨湰鍐呭 */
  text: string;
  /** 闄勪欢鍒楄〃 */
  attachments?: ChatAttachment[];
  /** 娑堟伅璋冨害妯″紡 */
  dispatchMode?: TurnDispatchMode;
  /** 鎵€灞炲洖鍚?ID */
  turnId?: TurnId | null;
  /** 娑堟伅鍒涘缓鏃堕棿锛圛SO 瀛楃涓诧級 */
  createdAt: string;
  /** 娑堟伅瀹屾垚鏃堕棿锛圛SO 瀛楃涓诧級锛屾祦寮忔秷鎭畬鎴愬悗鎵嶆湁鍊?*/
  completedAt?: string | undefined;
  /** 鏄惁姝ｅ湪娴佸紡杈撳嚭涓?*/
  streaming: boolean;
  /** 娑堟伅鏉ユ簮 */
  source?: OrchestrationMessageSource;
}

/** 鎻愯鐨勮鍒?*/
export interface ProposedPlan {
  /** 璁″垝鍞竴 ID */
  id: OrchestrationProposedPlanId;
  /** 鍏宠仈鐨勫洖鍚?ID锛屽彲涓?null */
  turnId: TurnId | null;
  /** 璁″垝鐨?Markdown 鍐呭 */
  planMarkdown: string;
  /** 瀹炴柦鏃堕棿锛屾湭瀹炴柦鏃朵负 null */
  implementedAt: string | null;
  /** 瀹炴柦璇ヨ鍒掔殑绾跨▼ ID锛屾湭瀹炴柦鏃朵负 null */
  implementationThreadId: ThreadId | null;
  /** 鍒涘缓鏃堕棿 */
  createdAt: string;
  /** 鏇存柊鏃堕棿 */
  updatedAt: string;
}

/** 鍥炲悎宸紓涓殑鏂囦欢鍙樻洿璁板綍 */
export interface TurnDiffFileChange {
  /** 鏂囦欢璺緞 */
  path: string;
  /** 鍙樻洿绫诲瀷锛堝 added/modified/deleted锛?*/
  kind?: string | undefined;
  /** 鏂板琛屾暟 */
  additions?: number | undefined;
  /** 鍒犻櫎琛屾暟 */
  deletions?: number | undefined;
}

/** 鍥炲悎宸紓鎽樿锛岃褰曚竴涓洖鍚堢殑鏂囦欢鍙樻洿姹囨€?*/
export interface TurnDiffSummary {
  /** 鍥炲悎 ID */
  turnId: TurnId;
  /** 瀹屾垚鏃堕棿 */
  completedAt: string;
  /** 鍥炲悎鐘舵€?*/
  status?: string | undefined;
  /** 鍙樻洿鐨勬枃浠跺垪琛?*/
  files: TurnDiffFileChange[];
  /** 妫€鏌ョ偣寮曠敤锛岀敤浜庡洖閫€鎿嶄綔 */
  checkpointRef?: CheckpointRef | undefined;
  /** 鍏宠仈鐨勫姪鎵嬫秷鎭?ID */
  assistantMessageId?: MessageId | undefined;
  /** 妫€鏌ョ偣瀵瑰簲鐨勫洖鍚堝簭鍙?*/
  checkpointTurnCount?: number | undefined;
}

/** 椤圭洰瑙嗗浘妯″瀷 */
export interface Project {
  /** 椤圭洰鍞竴 ID */
  id: ProjectId;
  /** 椤圭洰绫诲瀷 */
  kind: ProjectKind;
  /** 鏈湴灞曠ず鍚嶇О锛堝彲鑳借鐢ㄦ埛閲嶅懡鍚嶏級 */
  name: string;
  /** 杩滅▼浠撳簱鍚嶇О */
  remoteName: string;
  /** 宸ヤ綔鍖烘枃浠跺す鍚?*/
  folderName: string;
  /** 鐢ㄦ埛鑷畾涔夌殑鏈湴鍚嶇О锛宯ull 琛ㄧず浣跨敤杩滅▼鍚嶇О */
  localName: string | null;
  /** 椤圭洰宸ヤ綔鐩綍缁濆璺緞 */
  cwd: string;
  /** 榛樿妯″瀷閫夋嫨閰嶇疆 */
  defaultModelSelection: ModelSelection | null;
  /** 渚ц竟鏍忎腑鏄惁灞曞紑 */
  expanded: boolean;
  /** 鍒涘缓鏃堕棿 */
  createdAt?: string | undefined;
  /** 鏇存柊鏃堕棿 */
  updatedAt?: string | undefined;
  /** 椤圭洰鑴氭湰鍒楄〃 */
  scripts: ProjectScript[];
}

/** 绾跨▼宸ヤ綔鍖虹姸鎬?*/
export interface ThreadWorkspaceState {
  /** 鐜妯″紡锛歭ocal锛堟湰鍦帮級鎴?worktree锛堝伐浣滄爲锛?*/
  envMode?: ThreadEnvironmentMode | undefined;
  /** 褰撳墠 Git 鍒嗘敮鍚?*/
  branch: string | null;
  /** 宸ヤ綔鏍戣矾寰?*/
  worktreePath: string | null;
  /** 鍏宠仈鐨勫伐浣滄爲璺緞 */
  associatedWorktreePath?: string | null;
  /** 鍏宠仈鐨勫伐浣滄爲鍒嗘敮 */
  associatedWorktreeBranch?: string | null;
  /** 鍏宠仈鐨勫伐浣滄爲寮曠敤 */
  associatedWorktreeRef?: string | null;
  /** 鍒涘缓鍒嗘敮娴佺▼鏄惁宸插畬鎴?*/
  createBranchFlowCompleted?: boolean;
}

/** 绾跨▼宸ヤ綔鍖鸿ˉ涓侊紝鐢ㄤ簬閮ㄥ垎鏇存柊宸ヤ綔鍖虹姸鎬?*/
export interface ThreadWorkspacePatch {
  envMode?: ThreadEnvironmentMode | undefined;
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  createBranchFlowCompleted?: boolean;
}

/** 绾跨▼瑙嗗浘妯″瀷锛屽寘鍚畬鏁寸殑绾跨▼璇︽儏 */
export interface Thread extends ThreadWorkspaceState {
  /** 绾跨▼鍞竴 ID */
  id: ThreadId;
  /** Codex 绾跨▼ ID锛岀敤浜庡吋瀹规棫鐗?*/
  codexThreadId: string | null;
  /** 鎵€灞為」鐩?ID */
  projectId: ProjectId;
  /** 绾跨▼鏍囬 */
  title: string;
  /** 妯″瀷閫夋嫨閰嶇疆 */
  modelSelection: ModelSelection;
  /** 杩愯鏃舵ā寮?*/
  runtimeMode: RuntimeMode;
  /** 浜や簰妯″紡 */
  interactionMode: ProviderInteractionMode;
  /** 褰撳墠浼氳瘽淇℃伅 */
  session: ThreadSession | null;
  /** 鑱婂ぉ娑堟伅鍒楄〃 */
  messages: ChatMessage[];
  /** 鎻愯鐨勮鍒掑垪琛?*/
  proposedPlans: ProposedPlan[];
  /** 閿欒淇℃伅 */
  error: string | null;
  /** 鍒涘缓鏃堕棿 */
  createdAt: string;
  /** 褰掓。鏃堕棿锛宯ull 琛ㄧず鏈綊妗?*/
  archivedAt?: string | null;
  /** 鏇存柊鏃堕棿 */
  updatedAt?: string | undefined;
  /** 鏄惁缃《 */
  isPinned?: boolean;
  /** 鏈€鏂板洖鍚堜俊鎭?*/
  latestTurn: OrchestrationLatestTurn | null;
  /** 寰呭鐞嗙殑鏉ユ簮鎻愯璁″垝 */
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
  /** 鏈€鍚庤闂椂闂?*/
  lastVisitedAt?: string | undefined;
  /** 鐖剁嚎绋?ID锛堝瓙浠ｇ悊鍦烘櫙锛?*/
  parentThreadId?: ThreadId | null;
  /** 瀛愪唬鐞?ID */
  subagentAgentId?: string | null;
  /** 瀛愪唬鐞嗘樀绉?*/
  subagentNickname?: string | null;
  /** 瀛愪唬鐞嗚鑹?*/
  subagentRole?: string | null;
  /** 鍒嗗弶鏉ユ簮绾跨▼ ID */
  forkSourceThreadId?: ThreadId | null;
  /** 渚ц亰鏉ユ簮绾跨▼ ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 浜ゆ帴淇℃伅 */
  handoff?: ThreadHandoff | null;
  /** 鏈€杩戝凡鐭ョ殑 Pull Request 淇℃伅 */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 鏈€鏂扮敤鎴锋秷鎭椂闂?*/
  latestUserMessageAt?: string | null;
  /** 鏄惁鏈夊緟澶勭悊鐨勫鎵?*/
  hasPendingApprovals?: boolean;
  /** 鏄惁鏈夊緟澶勭悊鐨勭敤鎴疯緭鍏?*/
  hasPendingUserInput?: boolean;
  /** 鏄惁鏈夊彲鎿嶄綔鐨勬彁璁鍒?*/
  hasActionableProposedPlan?: boolean;
  /** 鍥炲悎宸紓鎽樿鍒楄〃 */
  turnDiffSummaries: TurnDiffSummary[];
  /** 娲诲姩鍒楄〃 */
  activities: OrchestrationThreadActivity[];
}

/** 绾跨▼澶栧３淇℃伅锛屼笉鍖呭惈娑堟伅绛夐噸鍨嬫暟鎹紝鐢ㄤ簬渚ц竟鏍忕瓑杞婚噺鍦烘櫙 */
export interface ThreadShell extends ThreadWorkspaceState {
  /** 绾跨▼鍞竴 ID */
  id: ThreadId;
  /** Codex 绾跨▼ ID */
  codexThreadId: string | null;
  /** 鎵€灞為」鐩?ID */
  projectId: ProjectId;
  /** 绾跨▼鏍囬 */
  title: string;
  /** 妯″瀷閫夋嫨閰嶇疆 */
  modelSelection: ModelSelection;
  /** 杩愯鏃舵ā寮?*/
  runtimeMode: RuntimeMode;
  /** 浜や簰妯″紡 */
  interactionMode: ProviderInteractionMode;
  /** 閿欒淇℃伅 */
  error: string | null;
  /** 鍒涘缓鏃堕棿 */
  createdAt: string;
  /** 褰掓。鏃堕棿 */
  archivedAt?: string | null;
  /** 鏇存柊鏃堕棿 */
  updatedAt?: string | undefined;
  /** 鏄惁缃《 */
  isPinned?: boolean;
  /** 鐖剁嚎绋?ID */
  parentThreadId?: ThreadId | null;
  /** 瀛愪唬鐞?ID */
  subagentAgentId?: string | null;
  /** 瀛愪唬鐞嗘樀绉?*/
  subagentNickname?: string | null;
  /** 瀛愪唬鐞嗚鑹?*/
  subagentRole?: string | null;
  /** 鍒嗗弶鏉ユ簮绾跨▼ ID */
  forkSourceThreadId?: ThreadId | null;
  /** 渚ц亰鏉ユ簮绾跨▼ ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 浜ゆ帴淇℃伅 */
  handoff?: ThreadHandoff | null;
  /** 鏈€杩戝凡鐭ョ殑 Pull Request 淇℃伅 */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 鏈€鏂扮敤鎴锋秷鎭椂闂?*/
  latestUserMessageAt?: string | null;
  /** 鏄惁鏈夊緟澶勭悊鐨勫鎵?*/
  hasPendingApprovals?: boolean;
  /** 鏄惁鏈夊緟澶勭悊鐨勭敤鎴疯緭鍏?*/
  hasPendingUserInput?: boolean;
  /** 鏄惁鏈夊彲鎿嶄綔鐨勬彁璁鍒?*/
  hasActionableProposedPlan?: boolean;
  /** 鏈€鍚庤闂椂闂?*/
  lastVisitedAt?: string | undefined;
}

/** 绾跨▼鍥炲悎鐘舵€侊紝浠呭寘鍚渶鏂板洖鍚堝拰寰呭鐞嗙殑鎻愯璁″垝 */
export interface ThreadTurnState {
  /** 鏈€鏂板洖鍚堜俊鎭?*/
  latestTurn: OrchestrationLatestTurn | null;
  /** 寰呭鐞嗙殑鏉ユ簮鎻愯璁″垝 */
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
}

/** 渚ц竟鏍忕嚎绋嬫憳瑕侊紝鐢ㄤ簬渚ц竟鏍忓垪琛ㄨ鐨勮交閲忔覆鏌?*/
export interface SidebarThreadSummary {
  /** 绾跨▼鍞竴 ID */
  id: ThreadId;
  /** 鎵€灞為」鐩?ID */
  projectId: ProjectId;
  /** 绾跨▼鏍囬 */
  title: string;
  /** 妯″瀷閫夋嫨閰嶇疆 */
  modelSelection: ModelSelection;
  /** 浜や簰妯″紡 */
  interactionMode: ProviderInteractionMode;
  /** 鐜妯″紡 */
  envMode?: ThreadEnvironmentMode | undefined;
  /** 褰撳墠 Git 鍒嗘敮鍚?*/
  branch: string | null;
  /** 宸ヤ綔鏍戣矾寰?*/
  worktreePath: string | null;
  /** 褰撳墠浼氳瘽淇℃伅 */
  session: ThreadSession | null;
  /** 鍒涘缓鏃堕棿 */
  createdAt: string;
  /** 褰掓。鏃堕棿 */
  archivedAt?: string | null;
  /** 鏇存柊鏃堕棿 */
  updatedAt?: string | undefined;
  /** 鏄惁缃《 */
  isPinned?: boolean;
  /** 鏈€鏂板洖鍚堜俊鎭?*/
  latestTurn: OrchestrationLatestTurn | null;
  /** 鏈€鍚庤闂椂闂?*/
  lastVisitedAt?: string | undefined;
  /** 鐖剁嚎绋?ID */
  parentThreadId?: ThreadId | null;
  /** 瀛愪唬鐞?ID */
  subagentAgentId?: string | null;
  /** 瀛愪唬鐞嗘樀绉?*/
  subagentNickname?: string | null;
  /** 瀛愪唬鐞嗚鑹?*/
  subagentRole?: string | null;
  /** 鏈€鏂扮敤鎴锋秷鎭椂闂?*/
  latestUserMessageAt: string | null;
  /** 鏄惁鏈夊緟澶勭悊鐨勫鎵?*/
  hasPendingApprovals: boolean;
  /** 鏄惁鏈夊緟澶勭悊鐨勭敤鎴疯緭鍏?*/
  hasPendingUserInput: boolean;
  /** 鏄惁鏈夊彲鎿嶄綔鐨勬彁璁鍒?*/
  hasActionableProposedPlan: boolean;
  /** 鏄惁鏈夋鍦ㄨ繘琛岀殑灏鹃儴宸ヤ綔锛堝鏂囦欢鍐欏叆锛?*/
  hasLiveTailWork: boolean;
  /** 鍒嗗弶鏉ユ簮绾跨▼ ID */
  forkSourceThreadId?: ThreadId | null;
  /** 渚ц亰鏉ユ簮绾跨▼ ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 浜ゆ帴淇℃伅 */
  handoff?: ThreadHandoff | null;
  /** 鏈€杩戝凡鐭ョ殑 Pull Request 淇℃伅 */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
}

/** 绾跨▼浼氳瘽淇℃伅 */
export interface ThreadSession {
  /** 鎻愪緵鑰呯被鍨?*/
  provider: ProviderKind;
  /** 浼氳瘽鐘舵€侊紙鍚?legacy 鐘舵€佹槧灏勶級 */
  status: SessionPhase | "error" | "closed";
  /** 褰撳墠娲昏穬鐨勫洖鍚?ID */
  activeTurnId?: TurnId | undefined;
  /** 鍒涘缓鏃堕棿 */
  createdAt: string;
  /** 鏇存柊鏃堕棿 */
  updatedAt: string;
  /** 鏈€杩戜竴娆￠敊璇俊鎭?*/
  lastError?: string;
  /** 缂栨帓灞備細璇濈姸鎬?*/
  orchestrationStatus: OrchestrationSessionStatus;
}
