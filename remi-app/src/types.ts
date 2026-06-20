/**
 * @file 閸忓彉闊╃憴鍡楁禈濡€崇€风猾璇茬€风€规矮绠? * @description 鐎规矮绠?Web 鎼存梻鏁ょ仦鍌滄畱鏉╂劘顢戦弮?UI 缁鐎烽敍灞藉瘶閹奉剛鍤庣粙瀣ㄢ偓渚€銆嶉惄顔衡偓浣虹矒缁旑垰绔风仦鈧妴浣锋櫠鏉堣鐖幗妯款洣缁涘绱? * 鐞?store閵嗕浇鐭鹃悽鍗炴嫲缂佸嫪娆㈤獮鎸庣【濞戝牐鍨傞妴? */

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

/** 娴兼俺鐦介梼鑸殿唽閿涙瓰isconnected 閳?connecting 閳?ready 閳?running */
export type SessionPhase = "disconnected" | "connecting" | "ready" | "running";
/** 姒涙顓绘潻鎰攽閺冭埖膩瀵骏绱扮€瑰苯鍙忕拋鍧楁６閺夊啴妾?*/
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";

/** 姒涙顓绘禍銈勭鞍濡€崇础 */
export const DEFAULT_INTERACTION_MODE: ProviderInteractionMode = "default";
/** 姒涙顓荤痪璺ㄢ柤缂佸牏顏棃銏℃緲妤傛ê瀹抽敍鍫濆剼缁辩媴绱?*/
export const DEFAULT_THREAD_TERMINAL_HEIGHT = 280;
/** 姒涙顓荤紒鍫㈩伂闂堛垺婢?ID */
export const DEFAULT_THREAD_TERMINAL_ID = "default";
/** 濮ｅ繋閲滅紒鍫㈩伂閸掑棛绮嶉崗浣筋啅閻ㄥ嫭娓舵径褏绮撶粩顖涙殶闁?*/
export const MAX_TERMINALS_PER_GROUP = 6;
/** 缂佸牏顏棃銏℃緲閻ㄥ嫬鐫嶇粈鐑樐佸蹇ョ窗drawer閿涘牊濞婄仦澶婄础閿涘鍨?workspace閿涘牆浼愭担婊冨隘瀵骏绱?*/
export type ThreadTerminalPresentationMode = "drawer" | "workspace";
/** 缂佸牏顏銉ょ稊閸栫儤鐖ｇ粵楣冦€夌猾璇茬€烽敍姝礶rminal閿涘牏绮撶粩顖ょ礆閹?chat閿涘牐浜版径鈺嬬礆 */
export type ThreadTerminalWorkspaceTab = "terminal" | "chat";
/** 缂佸牏顏銉ょ稊閸栧搫绔风仦鈧Ο鈥崇础閿涙瓬oth閿涘牆寮婚棃銏℃緲閿涘鍨?terminal-only閿涘牅绮庣紒鍫㈩伂閿?*/
export type ThreadTerminalWorkspaceLayout = "both" | "terminal-only";
/** 缁捐法鈻兼稉鑽ゆ櫕闂堫澁绱癱hat閿涘牐浜版径鈺嬬礆閹?terminal閿涘牏绮撶粩顖ょ礆 */
export type ThreadPrimarySurface = "chat" | "terminal";
/** 妞ゅ湱娲伴懘姘拱闁板秶鐤嗛敍宀€娲块幒銉ヮ槻閻?contracts 娑擃厾娈戠€规矮绠?*/
export type ProjectScript = ContractProjectScript;

/** 缂佸牏顏崚鍡楃潌閺傜懓鎮滈敍姝╫rizontal閿涘牊鎸夐獮绛圭礆閹?vertical閿涘牆鐎惄杈剧礆 */
export type ThreadTerminalSplitDirection = "horizontal" | "vertical";
/** 缂佸牏顏崚鍡楃潌娴ｅ秶鐤嗛敍姝祇p / right / bottom / left */
export type ThreadTerminalSplitPosition = "top" | "right" | "bottom" | "left";

/** 缂佸牏顏敮鍐ㄧ湰閸欒泛鐡欓懞鍌滃仯閿涘矁銆冪粈杞扮娑擃亜瀵橀崥顐ょ矒缁旑垰鐤勬笟瀣畱闂堛垺婢?*/
export interface ThreadTerminalLeafNode {
  /** 閼哄倻鍋ｇ猾璇茬€烽弽鍥槕閿涙氨绮撶粩顖氬骄鐎?*/
  type: "terminal";
  /** 闂堛垺婢橀崬顖欑 ID */
  paneId: string;
  /** 闂堛垺婢樻稉顓炲瘶閸氼偆娈戠紒鍫㈩伂 ID 閸掓銆?*/
  terminalIds: string[];
  /** 瑜版挸澧犲┑鈧ú鑽ゆ畱缂佸牏顏?ID */
  activeTerminalId: string;
}

/** 缂佸牏顏敮鍐ㄧ湰閸掑棗鐫嗛懞鍌滃仯閿涘矁銆冪粈杞扮娑擃亜褰查柅鎺戠秺瀹撳苯顨滈惃鍕瀻鐏炲繐顔愰崳?*/
export interface ThreadTerminalSplitNode {
  /** 閼哄倻鍋ｇ猾璇茬€烽弽鍥槕閿涙艾鍨庣仦?*/
  type: "split";
  /** 閸掑棗鐫嗛懞鍌滃仯閸烆垯绔?ID */
  id: string;
  /** 閸掑棗鐫嗛弬鐟版倻 */
  direction: ThreadTerminalSplitDirection;
  /** 鐎涙劘濡悙鐟板灙鐞涱煉绱濋崣顖氱サ婵傛褰剧€涙劘濡悙瑙勫灗閸掑棗鐫嗛懞鍌滃仯 */
  children: ThreadTerminalLayoutNode[];
  /** 閸氬嫬鐡欓懞鍌滃仯閻ㄥ嫭娼堥柌宥嗙槷娓?*/
  weights: number[];
}

/** 缂佸牏顏敮鍐ㄧ湰閼哄倻鍋ｉ敍姘骄鐎涙劘濡悙瑙勫灗閸掑棗鐫嗛懞鍌滃仯閻ㄥ嫯浠堥崥鍫㈣閸?*/
export type ThreadTerminalLayoutNode = ThreadTerminalLeafNode | ThreadTerminalSplitNode;

/** 缂佸牏顏崚鍡欑矋閿涘苯瀵橀崥顐㈢鐏炩偓娣団剝浼呴崪灞界秼閸撳秵绺哄ú鑽ゆ畱缂佸牏顏?*/
export interface ThreadTerminalGroup {
  /** 閸掑棛绮嶉崬顖欑 ID */
  id: string;
  /** 瑜版挸澧犲┑鈧ú鑽ゆ畱缂佸牏顏?ID */
  activeTerminalId: string;
  /** 閸掑棛绮嶉惃鍕鐏炩偓閺?*/
  layout: ThreadTerminalLayoutNode;
}

/** 閼卞﹤銇夐崶鍓у闂勫嫪娆?*/
export interface ChatImageAttachment {
  /** 闂勫嫪娆㈢猾璇茬€烽敍姘禈閻?*/
  type: "image";
  /** 闂勫嫪娆㈤崬顖欑 ID */
  id: string;
  /** 閺傚洣娆㈤崥?*/
  name: string;
  /** MIME 缁鐎?*/
  mimeType: string;
  /** 閺傚洣娆㈡径褍鐨敍鍫濈摟閼哄偊绱?*/
  sizeBytes: number;
  /** 閸ュ墽澧栨０鍕潔 URL閿涘苯褰查柅?*/
  previewUrl?: string;
}

/** 閼卞﹤銇夐崝鈺傚闁瀚ㄩ梽鍕閿涘苯绱╅悽銊ュИ閹靛绉烽幁顖欒厬閻ㄥ嫭鏋冮張顒傚濞?*/
export interface ChatAssistantSelectionAttachment {
  /** 闂勫嫪娆㈢猾璇茬€烽敍姘И閹靛鈧瀚?*/
  type: "assistant-selection";
  /** 闂勫嫪娆㈤崬顖欑 ID */
  id: string;
  /** 鐞氼偄绱╅悽銊ф畱閸斺晜澧滃☉鍫熶紖 ID */
  assistantMessageId: string;
  /** 闁鑵戦惃鍕瀮閺堫剙鍞寸€?*/
  text: string;
}

/** 閼卞﹤銇夐梽鍕閿涙艾娴橀悧鍥ㄥ灗閸斺晜澧滈弬鍥ㄦ拱闁瀚ㄩ惃鍕粓閸氬牏琚崹?*/
export type ChatAttachment = ChatImageAttachment | ChatAssistantSelectionAttachment;

/** 閼卞﹤銇夊☉鍫熶紖 */
export interface ChatMessage {
  /** 濞戝牊浼呴崬顖欑 ID */
  id: MessageId;
  /** 濞戝牊浼呯憴鎺曞閿涙ser閿涘牏鏁ら幋鍑ょ礆閵嗕工ssistant閿涘牆濮幍瀣剁礆閵嗕够ystem閿涘牏閮寸紒鐕傜礆 */
  role: "user" | "assistant" | "system";
  /** 濞戝牊浼呴弬鍥ㄦ拱閸愬懎顔?*/
  text: string;
  /** 闂勫嫪娆㈤崚妤勩€?*/
  attachments?: ChatAttachment[];
  /** 濞戝牊浼呯拫鍐ㄥ濡€崇础 */
  dispatchMode?: TurnDispatchMode;
  /** 閹碘偓鐏炵偛娲栭崥?ID */
  turnId?: TurnId | null;
  /** 濞戝牊浼呴崚娑樼紦閺冨爼妫块敍鍦汼O 鐎涙顑佹稉璇х礆 */
  createdAt: string;
  /** 濞戝牊浼呯€瑰本鍨氶弮鍫曟？閿涘湜SO 鐎涙顑佹稉璇х礆閿涘本绁﹀蹇旂Х閹垰鐣幋鎰倵閹靛秵婀侀崐?*/
  completedAt?: string | undefined;
  /** 閺勵垰鎯佸锝呮躬濞翠礁绱℃潏鎾冲毉娑?*/
  streaming: boolean;
  /** 濞戝牊浼呴弶銉︾爱 */
  source?: OrchestrationMessageSource;
}

/** 閹绘劘顔呴惃鍕吀閸?*/
export interface ProposedPlan {
  /** 鐠佲€冲灊閸烆垯绔?ID */
  id: OrchestrationProposedPlanId;
  /** 閸忓疇浠堥惃鍕礀閸?ID閿涘苯褰叉稉?null */
  turnId: TurnId | null;
  /** 鐠佲€冲灊閻?Markdown 閸愬懎顔?*/
  planMarkdown: string;
  /** 鐎圭偞鏌﹂弮鍫曟？閿涘本婀€圭偞鏌﹂弮鏈佃礋 null */
  implementedAt: string | null;
  /** 鐎圭偞鏌︾拠銉吀閸掓帞娈戠痪璺ㄢ柤 ID閿涘本婀€圭偞鏌﹂弮鏈佃礋 null */
  implementationThreadId: ThreadId | null;
  /** 閸掓稑缂撻弮鍫曟？ */
  createdAt: string;
  /** 閺囧瓨鏌婇弮鍫曟？ */
  updatedAt: string;
}

/** 閸ョ偛鎮庡顔肩磽娑擃厾娈戦弬鍥︽閸欐ɑ娲跨拋鏉跨秿 */
export interface TurnDiffFileChange {
  /** 閺傚洣娆㈢捄顖氱窞 */
  path: string;
  /** 閸欐ɑ娲跨猾璇茬€烽敍鍫濐洤 added/modified/deleted閿?*/
  kind?: string | undefined;
  /** 閺傛澘顤冪悰灞炬殶 */
  additions?: number | undefined;
  /** 閸掔娀娅庣悰灞炬殶 */
  deletions?: number | undefined;
}

/** 閸ョ偛鎮庡顔肩磽閹芥顩﹂敍宀冾唶瑜版洑绔存稉顏勬礀閸氬牏娈戦弬鍥︽閸欐ɑ娲垮Ч鍥ㄢ偓?*/
export interface TurnDiffSummary {
  /** 閸ョ偛鎮?ID */
  turnId: TurnId;
  /** 鐎瑰本鍨氶弮鍫曟？ */
  completedAt: string;
  /** 閸ョ偛鎮庨悩鑸碘偓?*/
  status?: string | undefined;
  /** 閸欐ɑ娲块惃鍕瀮娴犺泛鍨悰?*/
  files: TurnDiffFileChange[];
  /** 濡偓閺屻儳鍋ｅ鏇犳暏閿涘瞼鏁ゆ禍搴℃礀闁偓閹垮秳缍?*/
  checkpointRef?: CheckpointRef | undefined;
  /** 閸忓疇浠堥惃鍕И閹靛绉烽幁?ID */
  assistantMessageId?: MessageId | undefined;
  /** 濡偓閺屻儳鍋ｇ€电懓绨查惃鍕礀閸氬牆绨崣?*/
  checkpointTurnCount?: number | undefined;
}

/** 妞ゅ湱娲扮憴鍡楁禈濡€崇€?*/
export interface Project {
  /** 妞ゅ湱娲伴崬顖欑 ID */
  id: ProjectId;
  /** 妞ゅ湱娲扮猾璇茬€?*/
  kind: ProjectKind;
  /** 閺堫剙婀寸仦鏇犮仛閸氬秶袨閿涘牆褰查懗鍊燁潶閻劍鍩涢柌宥呮嚒閸氬稄绱?*/
  name: string;
  /** 鏉╂粎鈻兼禒鎾崇氨閸氬秶袨 */
  remoteName: string;
  /** 瀹搞儰缍旈崠鐑樻瀮娴犺泛銇欓崥?*/
  folderName: string;
  /** 閻劍鍩涢懛顏勭暰娑斿娈戦張顒€婀撮崥宥囆為敍瀹痷ll 鐞涖劎銇氭担璺ㄦ暏鏉╂粎鈻奸崥宥囆?*/
  localName: string | null;
  /** 妞ゅ湱娲板銉ょ稊閻╊喖缍嶇紒婵嗩嚠鐠侯垰绶?*/
  cwd: string;
  /** 姒涙顓诲Ο鈥崇€烽柅澶嬪闁板秶鐤?*/
  defaultModelSelection: ModelSelection | null;
  /** 娓氀嗙珶閺嶅繋鑵戦弰顖氭儊鐏炴洖绱?*/
  expanded: boolean;
  /** 閸掓稑缂撻弮鍫曟？ */
  createdAt?: string | undefined;
  /** 閺囧瓨鏌婇弮鍫曟？ */
  updatedAt?: string | undefined;
  /** 妞ゅ湱娲伴懘姘拱閸掓銆?*/
  scripts: ProjectScript[];
}

/** 缁捐法鈻煎銉ょ稊閸栬櫣濮搁幀?*/
export interface ThreadWorkspaceState {
  /** 閻滎垰顣ㄥΟ鈥崇础閿涙ocal閿涘牊婀伴崷甯礆閹?worktree閿涘牆浼愭担婊勭埐閿?*/
  envMode?: ThreadEnvironmentMode | undefined;
  /** 瑜版挸澧?Git 閸掑棙鏁崥?*/
  branch: string | null;
  /** 瀹搞儰缍旈弽鎴ｇ熅瀵?*/
  worktreePath: string | null;
  /** 閸忓疇浠堥惃鍕紣娴ｆ粍鐖茬捄顖氱窞 */
  associatedWorktreePath?: string | null;
  /** 閸忓疇浠堥惃鍕紣娴ｆ粍鐖查崚鍡樻暜 */
  associatedWorktreeBranch?: string | null;
  /** 閸忓疇浠堥惃鍕紣娴ｆ粍鐖插鏇犳暏 */
  associatedWorktreeRef?: string | null;
  /** 閸掓稑缂撻崚鍡樻暜濞翠胶鈻奸弰顖氭儊瀹告彃鐣幋?*/
  createBranchFlowCompleted?: boolean;
}

/** 缁捐法鈻煎銉ょ稊閸栭缚藟娑撲緤绱濋悽銊ょ艾闁劌鍨庨弴瀛樻煀瀹搞儰缍旈崠铏瑰Ц閹?*/
export interface ThreadWorkspacePatch {
  envMode?: ThreadEnvironmentMode | undefined;
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  createBranchFlowCompleted?: boolean;
}

/** 缁捐法鈻肩憴鍡楁禈濡€崇€烽敍灞藉瘶閸氼偄鐣弫瀵告畱缁捐法鈻肩拠锔藉剰 */
export interface Thread extends ThreadWorkspaceState {
  /** 缁捐法鈻奸崬顖欑 ID */
  id: ThreadId;
  /** Codex 缁捐法鈻?ID閿涘瞼鏁ゆ禍搴″悑鐎硅妫悧?*/
  codexThreadId: string | null;
  /** 閹碘偓鐏炵偤銆嶉惄?ID */
  projectId: ProjectId;
  /** 缁捐法鈻奸弽鍥暯 */
  title: string;
  /** 濡€崇€烽柅澶嬪闁板秶鐤?*/
  modelSelection: ModelSelection;
  /** 鏉╂劘顢戦弮鑸的佸?*/
  runtimeMode: RuntimeMode;
  /** 娴溿倓绨板Ο鈥崇础 */
  interactionMode: ProviderInteractionMode;
  /** 瑜版挸澧犳导姘崇樈娣団剝浼?*/
  session: ThreadSession | null;
  /** 閼卞﹤銇夊☉鍫熶紖閸掓銆?*/
  messages: ChatMessage[];
  /** 閹绘劘顔呴惃鍕吀閸掓帒鍨悰?*/
  proposedPlans: ProposedPlan[];
  /** 闁挎瑨顕ゆ穱鈩冧紖 */
  error: string | null;
  /** 閸掓稑缂撻弮鍫曟？ */
  createdAt: string;
  /** 瑜版帗銆傞弮鍫曟？閿涘ull 鐞涖劎銇氶張顏勭秺濡?*/
  archivedAt?: string | null;
  /** 閺囧瓨鏌婇弮鍫曟？ */
  updatedAt?: string | undefined;
  /** 閺勵垰鎯佺純顕€銆?*/
  isPinned?: boolean;
  /** 閺堚偓閺傛澘娲栭崥鍫滀繆閹?*/
  latestTurn: OrchestrationLatestTurn | null;
  /** 瀵板懎顦╅悶鍡欐畱閺夈儲绨幓鎰唴鐠佲€冲灊 */
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
  /** 閺堚偓閸氬氦顔栭梻顔芥闂?*/
  lastVisitedAt?: string | undefined;
  /** 閻栧墎鍤庣粙?ID閿涘牆鐡欐禒锝囨倞閸︾儤娅欓敍?*/
  parentThreadId?: ThreadId | null;
  /** 鐎涙劒鍞悶?ID */
  subagentAgentId?: string | null;
  /** 鐎涙劒鍞悶鍡樻█缁?*/
  subagentNickname?: string | null;
  /** 鐎涙劒鍞悶鍡氼潡閼?*/
  subagentRole?: string | null;
  /** 閸掑棗寮堕弶銉︾爱缁捐法鈻?ID */
  forkSourceThreadId?: ThreadId | null;
  /** 娓氀嗕喊閺夈儲绨痪璺ㄢ柤 ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 娴溿倖甯存穱鈩冧紖 */
  handoff?: ThreadHandoff | null;
  /** 閺堚偓鏉╂垵鍑￠惌銉ф畱 Pull Request 娣団剝浼?*/
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 閺堚偓閺傛壆鏁ら幋閿嬬Х閹垱妞傞梻?*/
  latestUserMessageAt?: string | null;
  /** 閺勵垰鎯侀張澶婄窡婢跺嫮鎮婇惃鍕吀閹?*/
  hasPendingApprovals?: boolean;
  /** 閺勵垰鎯侀張澶婄窡婢跺嫮鎮婇惃鍕暏閹寸柉绶崗?*/
  hasPendingUserInput?: boolean;
  /** 閺勵垰鎯侀張澶婂讲閹垮秳缍旈惃鍕絹鐠侇喛顓搁崚?*/
  hasActionableProposedPlan?: boolean;
  /** 閸ョ偛鎮庡顔肩磽閹芥顩﹂崚妤勩€?*/
  turnDiffSummaries: TurnDiffSummary[];
  /** 濞茶濮╅崚妤勩€?*/
  activities: OrchestrationThreadActivity[];
}

/** 缁捐法鈻兼径鏍э紦娣団剝浼呴敍灞肩瑝閸栧懎鎯堝☉鍫熶紖缁涘鍣搁崹瀣殶閹诡噯绱濋悽銊ょ艾娓氀嗙珶閺嶅繒鐡戞潪濠氬櫤閸︾儤娅?*/
export interface ThreadShell extends ThreadWorkspaceState {
  /** 缁捐法鈻奸崬顖欑 ID */
  id: ThreadId;
  /** Codex 缁捐法鈻?ID */
  codexThreadId: string | null;
  /** 閹碘偓鐏炵偤銆嶉惄?ID */
  projectId: ProjectId;
  /** 缁捐法鈻奸弽鍥暯 */
  title: string;
  /** 濡€崇€烽柅澶嬪闁板秶鐤?*/
  modelSelection: ModelSelection;
  /** 鏉╂劘顢戦弮鑸的佸?*/
  runtimeMode: RuntimeMode;
  /** 娴溿倓绨板Ο鈥崇础 */
  interactionMode: ProviderInteractionMode;
  /** 闁挎瑨顕ゆ穱鈩冧紖 */
  error: string | null;
  /** 閸掓稑缂撻弮鍫曟？ */
  createdAt: string;
  /** 瑜版帗銆傞弮鍫曟？ */
  archivedAt?: string | null;
  /** 閺囧瓨鏌婇弮鍫曟？ */
  updatedAt?: string | undefined;
  /** 閺勵垰鎯佺純顕€銆?*/
  isPinned?: boolean;
  /** 閻栧墎鍤庣粙?ID */
  parentThreadId?: ThreadId | null;
  /** 鐎涙劒鍞悶?ID */
  subagentAgentId?: string | null;
  /** 鐎涙劒鍞悶鍡樻█缁?*/
  subagentNickname?: string | null;
  /** 鐎涙劒鍞悶鍡氼潡閼?*/
  subagentRole?: string | null;
  /** 閸掑棗寮堕弶銉︾爱缁捐法鈻?ID */
  forkSourceThreadId?: ThreadId | null;
  /** 娓氀嗕喊閺夈儲绨痪璺ㄢ柤 ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 娴溿倖甯存穱鈩冧紖 */
  handoff?: ThreadHandoff | null;
  /** 閺堚偓鏉╂垵鍑￠惌銉ф畱 Pull Request 娣団剝浼?*/
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 閺堚偓閺傛壆鏁ら幋閿嬬Х閹垱妞傞梻?*/
  latestUserMessageAt?: string | null;
  /** 閺勵垰鎯侀張澶婄窡婢跺嫮鎮婇惃鍕吀閹?*/
  hasPendingApprovals?: boolean;
  /** 閺勵垰鎯侀張澶婄窡婢跺嫮鎮婇惃鍕暏閹寸柉绶崗?*/
  hasPendingUserInput?: boolean;
  /** 閺勵垰鎯侀張澶婂讲閹垮秳缍旈惃鍕絹鐠侇喛顓搁崚?*/
  hasActionableProposedPlan?: boolean;
  /** 閺堚偓閸氬氦顔栭梻顔芥闂?*/
  lastVisitedAt?: string | undefined;
}

/** 缁捐法鈻奸崶鐐叉値閻樿埖鈧緤绱濇禒鍛瘶閸氼偅娓堕弬鏉挎礀閸氬牆鎷板鍛槱閻炲棛娈戦幓鎰唴鐠佲€冲灊 */
export interface ThreadTurnState {
  /** 閺堚偓閺傛澘娲栭崥鍫滀繆閹?*/
  latestTurn: OrchestrationLatestTurn | null;
  /** 瀵板懎顦╅悶鍡欐畱閺夈儲绨幓鎰唴鐠佲€冲灊 */
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
}

/** 娓氀嗙珶閺嶅繒鍤庣粙瀣喅鐟曚緤绱濋悽銊ょ艾娓氀嗙珶閺嶅繐鍨悰銊攽閻ㄥ嫯浜ら柌蹇旇閺?*/
export interface SidebarThreadSummary {
  /** 缁捐法鈻奸崬顖欑 ID */
  id: ThreadId;
  /** 閹碘偓鐏炵偤銆嶉惄?ID */
  projectId: ProjectId;
  /** 缁捐法鈻奸弽鍥暯 */
  title: string;
  /** 濡€崇€烽柅澶嬪闁板秶鐤?*/
  modelSelection: ModelSelection;
  /** 娴溿倓绨板Ο鈥崇础 */
  interactionMode: ProviderInteractionMode;
  /** 閻滎垰顣ㄥΟ鈥崇础 */
  envMode?: ThreadEnvironmentMode | undefined;
  /** 瑜版挸澧?Git 閸掑棙鏁崥?*/
  branch: string | null;
  /** 瀹搞儰缍旈弽鎴ｇ熅瀵?*/
  worktreePath: string | null;
  /** 瑜版挸澧犳导姘崇樈娣団剝浼?*/
  session: ThreadSession | null;
  /** 閸掓稑缂撻弮鍫曟？ */
  createdAt: string;
  /** 瑜版帗銆傞弮鍫曟？ */
  archivedAt?: string | null;
  /** 閺囧瓨鏌婇弮鍫曟？ */
  updatedAt?: string | undefined;
  /** 閺勵垰鎯佺純顕€銆?*/
  isPinned?: boolean;
  /** 閺堚偓閺傛澘娲栭崥鍫滀繆閹?*/
  latestTurn: OrchestrationLatestTurn | null;
  /** 閺堚偓閸氬氦顔栭梻顔芥闂?*/
  lastVisitedAt?: string | undefined;
  /** 閻栧墎鍤庣粙?ID */
  parentThreadId?: ThreadId | null;
  /** 鐎涙劒鍞悶?ID */
  subagentAgentId?: string | null;
  /** 鐎涙劒鍞悶鍡樻█缁?*/
  subagentNickname?: string | null;
  /** 鐎涙劒鍞悶鍡氼潡閼?*/
  subagentRole?: string | null;
  /** 閺堚偓閺傛壆鏁ら幋閿嬬Х閹垱妞傞梻?*/
  latestUserMessageAt: string | null;
  /** 閺勵垰鎯侀張澶婄窡婢跺嫮鎮婇惃鍕吀閹?*/
  hasPendingApprovals: boolean;
  /** 閺勵垰鎯侀張澶婄窡婢跺嫮鎮婇惃鍕暏閹寸柉绶崗?*/
  hasPendingUserInput: boolean;
  /** 閺勵垰鎯侀張澶婂讲閹垮秳缍旈惃鍕絹鐠侇喛顓搁崚?*/
  hasActionableProposedPlan: boolean;
  /** 閺勵垰鎯侀張澶嬵劀閸︺劏绻樼悰宀€娈戠亸楣冨劥瀹搞儰缍旈敍鍫濐洤閺傚洣娆㈤崘娆忓弳閿?*/
  hasLiveTailWork: boolean;
  /** 閸掑棗寮堕弶銉︾爱缁捐法鈻?ID */
  forkSourceThreadId?: ThreadId | null;
  /** 娓氀嗕喊閺夈儲绨痪璺ㄢ柤 ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 娴溿倖甯存穱鈩冧紖 */
  handoff?: ThreadHandoff | null;
  /** 閺堚偓鏉╂垵鍑￠惌銉ф畱 Pull Request 娣団剝浼?*/
  lastKnownPr?: OrchestrationThreadPullRequest | null;
}

/** 缁捐法鈻兼导姘崇樈娣団剝浼?*/
export interface ThreadSession {
  /** 閹绘劒绶甸懓鍛閸?*/
  provider: ProviderKind;
  /** 娴兼俺鐦介悩鑸碘偓渚婄礄閸?legacy 閻樿埖鈧焦妲х亸鍕剁礆 */
  status: SessionPhase | "error" | "closed";
  /** 瑜版挸澧犲ú鏄忕┈閻ㄥ嫬娲栭崥?ID */
  activeTurnId?: TurnId | undefined;
  /** 閸掓稑缂撻弮鍫曟？ */
  createdAt: string;
  /** 閺囧瓨鏌婇弮鍫曟？ */
  updatedAt: string;
  /** 閺堚偓鏉╂垳绔村▎锟犳晩鐠囶垯淇婇幁?*/
  lastError?: string;
  /** 缂傛牗甯撶仦鍌欑窗鐠囨繄濮搁幀?*/
  orchestrationStatus: OrchestrationSessionStatus;
}
