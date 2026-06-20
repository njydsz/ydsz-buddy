/**
 * @file taskCompletion.logic.ts
 * @description 缁捐法鈻奸悽鐔锋嚒閸涖劍婀￠柅姘辩叀濡偓濞村绗岄柅姘辩叀閺傚洦顢嶉弸鍕紦闁槒绶仦鍌樷偓? * 鐠愮喕鐭楃拠鍡楀焼缁捐法鈻?缂佸牏顏惃鍕暚閹存劖鈧椒绗岄棁鈧崗铏暈閹礁褰夐弴杈剧礉楠炲墎鏁撻幋鎰嚠鎼存梻娈戦柅姘辩叀閺傚洦顢嶉妴? * 閺堫剚膩閸фぞ璐熺痪顖炩偓鏄忕帆鐏炲偊绱濇稉宥呭瘶閸?UI 閻╃鍙ф禒锝囩垳閵? */

import {
  defaultTerminalTitleForCliKind,
  type TerminalCliKind,
  type TerminalVisualState,
} from "~/shared/terminalThreads";
import type { Thread, ThreadSession } from "../types";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  hasLiveLatestTurn,
} from "../session-logic";

/**
 * 瀹告彃鐣幋鎰畱缁捐法鈻奸崐娆撯偓澶愩€嶉敍宀€鏁ゆ禍搴ｆ晸閹存劒鎹㈤崝鈥崇暚閹存劙鈧氨鐓￠妴? */
export interface CompletedThreadCandidate {
  /** 缁捐法鈻奸崬顖欑閺嶅洩鐦?*/
  threadId: Thread["id"];
  /** 閹碘偓鐏炵偤銆嶉惄顔兼暜娑撯偓閺嶅洩鐦?*/
  projectId: Thread["projectId"];
  /** 缁捐法鈻奸弽鍥暯 */
  title: string;
  /** 娴犺濮熺€瑰本鍨氶弮鍫曟？閹寸绱橧SO 8601 閺嶇厧绱￠敍?*/
  completedAt: string;
  /** 閸斺晜澧滈張鈧弬鐗堢Х閹垳娈戦幗妯款洣閺傚洦婀伴敍宀冨閺冪姴鍨稉?null */
  assistantSummary: string | null;
}

/**
 * 缁捐法鈻奸棁鈧憰浣烘暏閹村嘲鍙у▔銊ф畱閸婃瑩鈧銆嶉敍宀€鏁ゆ禍搴ｆ晸閹?闂団偓鐟曚浇绶崗?缁鈧氨鐓￠妴? */
export interface ThreadAttentionCandidate {
  /** 閸忚櫕鏁炵猾璇茬€烽敍姝沺proval閿涘牆顓搁幍纭咁嚞濮瑰偊绱氶幋?user-input閿涘牏鏁ら幋鐤翻閸忋儴顕Ч鍌︾礆 */
  kind: "approval" | "user-input";
  /** 缁捐法鈻奸崬顖欑閺嶅洩鐦?*/
  threadId: Thread["id"];
  /** 閹碘偓鐏炵偤銆嶉惄顔兼暜娑撯偓閺嶅洩鐦?*/
  projectId: Thread["projectId"];
  /** 缁捐法鈻奸弽鍥暯 */
  title: string;
  /** 鐠囬攱鐪伴崬顖欑閺嶅洩鐦戦敍鍫濐吀閹电顕Ч鍌涘灗閻劍鍩涙潏鎾冲弳鐠囬攱鐪伴惃?ID閿?*/
  requestId: string;
  /** 鐠囬攱鐪伴崚娑樼紦閺冨爼妫块幋绛圭礄ISO 8601 閺嶇厧绱￠敍?*/
  createdAt: string;
  /** 鐎光剝澹掔拠閿嬬湴閻ㄥ嫬鐡欑猾璇茬€烽敍姘嚒娴犮倖澧界悰灞烩偓浣规瀮娴犳儼顕伴崣鏍ㄥ灗閺傚洣娆㈤崣妯绘纯 */
  requestKind?: "command" | "file-read" | "file-change";
  /** 閸欘垶鈧娈戠拠閿嬬湴閹芥顩︽穱鈩冧紖 */
  summary?: string;
}

/**
 * 缂佸牏顏柅姘辩叀閹碘偓闂団偓閻ㄥ嫮鍤庣粙瀣Ц閹礁鎻╅悡褝绱濋崠鍛儓缁捐法鈻兼稉瀣閺堝绮撶粩顖滄畱鏉╂劘顢戦悩鑸碘偓浣风瑢閸忓啩淇婇幁顖樷偓? */
interface TerminalNotificationThreadState {
  /** 瑜版挸澧犲锝呮躬鏉╂劘顢戦惃鍕矒缁?ID 閸掓銆?*/
  runningTerminalIds: string[];
  /** 閸氬嫮绮撶粩顖滄畱閸忚櫕鏁為悩鑸碘偓浣规Ё鐏忓嫸绱檃ttention=闂団偓缁斿宓嗛崗铏暈, review=瀵板懎顓搁弻銉礆 */
  terminalAttentionStatesById: Record<string, "attention" | "review">;
  /** 閸氬嫮绮撶粩顖滄畱 CLI 缁鐎烽弰鐘茬殸閿涘牆顩?bash閵嗕垢owershell 缁涘绱?*/
  terminalCliKindsById: Record<string, TerminalCliKind>;
  /** 缁捐法鈻兼稉瀣閺堝绮撶粩?ID 閸掓銆?*/
  terminalIds: string[];
  /** 閸氬嫮绮撶粩顖滄畱閻劍鍩涢懛顏勭暰娑斿鐖ｇ粵鐐Ё鐏?*/
  terminalLabelsById: Record<string, string>;
  /** 閸氬嫮绮撶粩顖滄畱閺嶅洭顣界憰鍡欐磰閸婂吋妲х亸鍕剁礄娴兼ê鍘涚痪褔鐝禍搴ㄧ帛鐠併倖鐖ｆ０妯烘嫲閺嶅洨顒烽敍?*/
  terminalTitleOverridesById: Record<string, string>;
}

/**
 * 瀹告彃鐣幋鎰畱缂佸牏顏禒璇插閸婃瑩鈧銆嶉敍宀€鏁ゆ禍搴ｆ晸閹存劗绮撶粩顖欐崲閸斺€崇暚閹存劙鈧氨鐓￠妴? */
export interface CompletedTerminalCandidate {
  /** 缂佸牏顏?CLI 缁鐎烽敍灞炬￥濞夋洜鈥樼€规碍妞傛稉?null */
  cliKind: TerminalCliKind | null;
  /** 缂佸牏顏崬顖欑閺嶅洩鐦?*/
  terminalId: string;
  /** 閹碘偓鐏炵偟鍤庣粙瀣暜娑撯偓閺嶅洩鐦?*/
  threadId: Thread["id"];
  /** 缂佸牏顏弰鍓с仛閺嶅洭顣?*/
  title: string;
}

/**
 * 缂佸牏顏棁鈧憰浣烘暏閹村嘲鍙у▔銊ф畱閸婃瑩鈧銆嶉敍宀€鏁ゆ禍搴ｆ晸閹存劗绮撶粩?闂団偓鐟曚礁鍙у▔?缁鈧氨鐓￠妴? */
export interface TerminalAttentionCandidate {
  /** 缂佸牏顏?CLI 缁鐎烽敍灞炬￥濞夋洜鈥樼€规碍妞傛稉?null */
  cliKind: TerminalCliKind | null;
  /** 缂佸牏顏崬顖欑閺嶅洩鐦?*/
  terminalId: string;
  /** 閹碘偓鐏炵偟鍤庣粙瀣暜娑撯偓閺嶅洩鐦?*/
  threadId: Thread["id"];
  /** 缂佸牏顏弰鍓с仛閺嶅洭顣?*/
  title: string;
}

/** 缁捐法鈻兼导姘崇樈閻樿埖鈧胶琚崹瀣剁礉婢跺秶鏁?ThreadSession 閻?status 鐎涙顔岀猾璇茬€?*/
type ThreadSessionStatus = ThreadSession["status"];

/**
 * 閸掋倖鏌囬弰顖氭儊鎼存梹妯夌粈铏瑰殠缁嬪鐣幋鎰扳偓姘辩叀閻?Toast 閹绘劗銇氶妴? * 娴犲懎婀惄顔界垼缁捐法鈻艰ぐ鎾冲娑撳秴褰茬憴浣规閹靛秵妯夌粈娲偓姘辩叀閿涘矂浼╅崗宥咁嚠瀹告彃鐫嶇粈鍝勬躬鐏炲繐绠锋稉濠勬畱缁捐法鈻奸柌宥咁槻閹绘劙鍟嬮妴? *
 * @param input.threadId - 瀵板懎鍨介弬顓犳畱缁捐法鈻?ID
 * @param input.visibleThreadIds - 瑜版挸澧犵仦蹇撶娑撳﹤褰茬憴浣烘畱缁捐法鈻?ID 闂嗗棗鎮? * @returns 閼汇儳鍤庣粙瀣╃瑝閸欘垵顫嗛崚娆掔箲閸?true閿涘矁銆冪粈鍝勭安閺勫墽銇?Toast
 */
export function shouldShowThreadNotificationToast(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
}): boolean {
  return !input.visibleThreadIds.has(input.threadId);
}

/**
 * 閸掋倖鏌囩痪璺ㄢ柤娴兼俺鐦介悩鑸碘偓浣规Ц閸氾箑鐫樻禍?鏉╂劘顢戞稉?閵? * 鐏?"running"閿涘牐绻嶇悰灞艰厬閿涘鎷?"connecting"閿涘牐绻涢幒銉よ厬閿涘娼庣憴鍡曡礋鏉╂劘顢戦幀浣碘偓? *
 * @param status - 缁捐法鈻兼导姘崇樈閻樿埖鈧礁鈧? * @returns 閼汇儰璐熸潻鎰攽娑擃厽鍨ㄦ潻鐐村复娑擃厾濮搁幀浣稿灟鏉╂柨娲?true
 */
function isRunningStatus(status: ThreadSessionStatus | null | undefined): boolean {
  return status === "running" || status === "connecting";
}

/**
 * 娴犲海鍤庣粙瀣Х閹垰鍨悰銊よ厬閹绘劕褰囬張鈧崥搴濈閺夆€冲И閹靛绉烽幁顖滄畱閹芥顩﹂妴? * 閹芥顩︽导姘箵闂勩倕顦挎担娆戔敄閻ц棄鐡х粭锕€鑻熼幋顏呮焽閼?140 鐎涙顑佹禒銉ュ敶閿涘矂浼╅崗宥呮躬缁崵绮洪柅姘辩叀娑擃厼鐫嶇粈楦跨箖闂€鍨敶鐎瑰箍鈧? *
 * @param thread - 缁捐法鈻肩€电钖勯敍灞藉瘶閸氼偄鐣弫瀵告畱濞戝牊浼呴崚妤勩€? * @returns 閸斺晜澧滃☉鍫熶紖閹芥顩﹂弬鍥ㄦ拱閿涘牊娓堕梹?140 鐎涙顑侀敍澶涚礉閼汇儲妫ら崝鈺傚濞戝牊浼呴崚娆掔箲閸?null
 */
function summarizeLatestAssistantMessage(thread: Thread): string | null {
  // 娴犲孩绉烽幁顖氬灙鐞涖劍婀亸鎯ф倻閸撳秹浜堕崢鍡礉閹垫儳鍩岄張鈧崥搴濈閺夆€冲И閹靛顫楅懝鑼畱濞戝牊浼?  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    // 閸樺娅庢＃鏍х啲缁岃櫣娅ч獮璺虹殺鏉╃偟鐢荤粚铏规鐎涙顑侀崢瀣級娑撳搫宕熸稉顏嗏敄閺?    const trimmed = message.text.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) {
      continue;
    }
    // 鐡掑懓绻?140 鐎涙顑侀弮鑸靛焻閺傤厼鑻熷ǎ璇插閻胶鏆愰崣?    return trimmed.length <= 140 ? trimmed : `${trimmed.slice(0, 137)}...`;
  }
  return null;
}

/**
 * 閸掋倖鏌囩痪璺ㄢ柤閺勵垰鎯佺€涙ê婀張顏勭暚閹存劗娈戞潪顔筋偧閿涘澅urn閿涘鈧? * 濠娐ゅ喕娴犮儰绗呮禒璁崇閺夆€叉閸楀疇顫嬫稉鍝勭摠閸︺劍婀€瑰本鍨氭潪顔筋偧閿? * 1. 閺堚偓閺傛媽鐤嗗▎鈥茬矝婢跺嫪绨ú鏄忕┈閻樿埖鈧緤绱欓張澶婄杽閺冩湹姘︽禍鎺炵礆
 * 2. 閺堚偓閺傛媽鐤嗗▎鈩冪梾閺堝鐣幋鎰闂傚瓨鍩戦敍灞肩瑬娴兼俺鐦芥径鍕艾鏉╂劘顢戞稉顓犲Ц閹? *
 * @param thread - 缁捐法鈻肩€电钖? * @returns 閼汇儱鐡ㄩ崷銊︽弓鐎瑰本鍨氭潪顔筋偧閸掓瑨绻戦崶?true
 */
function hadUnsettledTurn(thread: Thread | undefined): boolean {
  if (!thread) {
    return false;
  }
  // 濡偓閺屻儲娓堕弬鎷岀枂濞嗏剝妲搁崥锔跨矝閺堝鐤勯弮鏈垫唉娴?  if (hasLiveLatestTurn(thread.latestTurn, thread.session)) {
    return true;
  }
  // 鏉烆喗顐奸張顏勭暚閹存劒绗栨导姘崇樈娴犲秴婀潻鎰攽
  return !thread.latestTurn?.completedAt && isRunningStatus(thread.session?.status);
}

/**
 * 閸掋倖鏌囩痪璺ㄢ柤閻ㄥ嫬鐣幋鎰扳偓姘辩叀閺勵垰鎯佸鑼旂€规熬绱檚ettled閿涘鈧? * 缁嬪啿鐣鹃惃鍕蒋娴犺绱伴張鈧弬鎷岀枂濞嗏剝婀佸鈧慨瀣嫲鐎瑰本鍨氶弮鍫曟？閹寸绱濇稉鏂剧窗鐠囨繄娈戠紓鏍ㄥ笓閻樿埖鈧椒绗夐弰?"running"閵? *
 * @param thread - 缁捐法鈻肩€电钖? * @returns 閼汇儵鈧氨鐓￠悩鑸碘偓浣稿嚒缁嬪啿鐣鹃敍鍫濆讲娴犮儱鐣ㄩ崗銊ュ絺閸戝搫鐣幋鎰扳偓姘辩叀閿涘鍨潻鏂挎礀 true
 */
function isCompletionNotificationSettled(thread: Thread | undefined): boolean {
  // 韫囧懘銆忛張澶庣枂濞嗭紕娈戝鈧慨瀣嫲鐎瑰本鍨氶弮鍫曟？閹?  if (!thread?.latestTurn?.startedAt || !thread.latestTurn.completedAt) {
    return false;
  }
  // 濞屸剝婀佹导姘崇樈娣団剝浼呴弮鎯邦潒娑撳搫鍑＄粙鍐茬暰
  if (!thread.session) {
    return true;
  }
  // 缂傛牗甯撻悩鑸碘偓浣风瑝閸愬秵妲告潻鎰攽娑擃叏绱濈拠瀛樻瀹告彃鐣崗銊х波閺?  return thread.session.orchestrationStatus !== "running";
}

/**
 * 鐎佃鐦崜宥呮倵娑撱倖顐肩痪璺ㄢ柤韫囶偆鍙庨敍灞炬暪闂嗗棙鏌婃禍褏鏁撻惃鍕嚒鐎瑰本鍨氱痪璺ㄢ柤閸婃瑩鈧銆嶉妴? * 闁俺绻冨В鏃囩窛鏉╃偟鐢昏箛顐ゅ弾娑擃厾娈戦悩鑸碘偓浣稿綁閸栨牭绱濇禒鍛躬濡偓濞村鍩屾禒?閺堫亜鐣幋?閸?瀹告彃鐣幋?閻ㄥ嫯娴嗛幑銏℃閹靛秶鏁撻幋鎰偓娆撯偓澶愩€嶉敍? * 閸楀厖濞囨导姘崇樈閻樿埖鈧胶娲块幒銉ょ矤鏉╂劘顢戦幀浣界儲閼峰啿姘ㄧ紒顏呪偓浣风瘍閼宠姤顒滅涵顔藉礋閼炬灚鈧? *
 * @param previousThreads - 娑撳﹣绔村▎鈥虫彥閻撗傝厬閻ㄥ嫮鍤庣粙瀣灙鐞? * @param nextThreads - 瑜版挸澧犺箛顐ゅ弾娑擃厾娈戠痪璺ㄢ柤閸掓銆? * @returns 閺傞楠囬悽鐔烘畱瀹告彃鐣幋鎰殠缁嬪鈧瑩鈧銆嶉弫鎵矋
 */
export function collectCompletedThreadCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): CompletedThreadCandidate[] {
  // 鐏忓棔绗傛稉鈧▎鈥虫彥閻撗勫瘻缁捐法鈻?ID 瀵よ櫣鐝涚槐銏犵穿閿涘奔绌舵禍搴℃彥闁喐鐓￠幍?  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: CompletedThreadCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    // 閺傛澘顤冮惃鍕殠缁嬪绱欐稉濠佺濞嗏€虫彥閻撗傝厬娑撳秴鐡ㄩ崷顭掔礆鐠哄疇绻冮敍灞肩瑝娴溠呮晸闁氨鐓?    if (!previousThread) {
      continue;
    }

    const completedAt = thread.latestTurn?.completedAt;
    // 瑜版挸澧犳潪顔筋偧鐏忔碍婀€瑰本鍨氶敍宀冪儲鏉?    if (!completedAt) {
      continue;
    }
    // 闁氨鐓￠悩鑸碘偓浣哥毣閺堫亞菙鐎规熬绱欐俊鍌滅椽閹烘帊绮涢崷銊ㄧ箥鐞涘矉绱氶敍宀冪儲鏉?    if (!isCompletionNotificationSettled(thread)) {
      continue;
    }
    // 娑撳﹣绔村▎鈥虫彥閻撗傝厬閺冦垺鐥呴張澶夌窗鐠囨繀淇婇幁顖ょ礉鏉烆喗顐兼稊鐔告弓鐎瑰本鍨氶垾鏂衡偓鏃囶嚛閺勫氦绻栭弰顖烆浕濞嗏€冲毉閻滃府绱濈捄瀹犵箖
    if (!previousThread.session && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    // 娑撳﹣绔村▎鈥虫彥閻撗傝厬鐠囥儳鍤庣粙瀣嚒婢跺嫪绨粙鍐茬暰鐎瑰本鍨氶幀浣风瑬濞屸剝婀侀張顏勭暚閹存劘鐤嗗▎鈽呯礉鐠囧瓨妲戦柅姘辩叀瀹告彃褰傛潻鍥风礉鐠哄疇绻?    if (!hadUnsettledTurn(previousThread) && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    // 閸氬奔绔存稉顏囩枂濞?ID 娑撴柧绗傛稉鈧▎鈥冲嚒缁嬪啿鐣鹃敍宀冾嚛閺勫孩妲搁柌宥咁槻闁氨鐓￠敍宀冪儲鏉?    if (
      previousThread.latestTurn?.turnId === thread.latestTurn?.turnId &&
      isCompletionNotificationSettled(previousThread)
    ) {
      continue;
    }

    // 闁俺绻冩禒銉ょ瑐閹碘偓閺堝绻冨銈嗘蒋娴犺绱濈涵顔款吇娑撶儤鏌婃禍褏鏁撻惃鍕暚閹存劒绨ㄦ禒?    candidates.push({
      threadId: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      completedAt,
      assistantSummary: summarizeLatestAssistantMessage(thread),
    });
  }

  return candidates;
}

/**
 * 鐟欙絾鐎介幐鍥х暰缂佸牏顏崷銊ョ秼閸撳秶鍤庣粙瀣Ц閹椒绗呴惃鍕讲鐟欏棗瀵查悩鑸碘偓浣碘偓? * 娴兼ê鍘涚痪褝绱癮ttention閿涘牓娓剁粩瀣祮閸忚櫕鏁為敍? running閿涘牐绻嶇悰灞艰厬閿? review閿涘牆绶熺€光剝鐓￠敍? idle閿涘牏鈹栭梻璇х礆閵? *
 * @param threadState - 缁捐法鈻奸惃鍕矒缁旑垶鈧氨鐓￠悩鑸碘偓浣告彥閻撗嶇礉閸欘垵鍏樻稉?undefined
 * @param terminalId - 閻╊喗鐖ｇ紒鍫㈩伂 ID
 * @returns 缂佸牏顏惃鍕讲鐟欏棗瀵查悩鑸碘偓? */
function resolveTerminalNotificationState(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): TerminalVisualState {
  if (!threadState) {
    return "idle";
  }
  // "attention" 娴兼ê鍘涚痪褎娓舵姗堢礉鐞涖劎銇氱紒鍫㈩伂闂団偓鐟曚胶鏁ら幋椋庣彌閸楀啿鍙у▔?  if (threadState.terminalAttentionStatesById?.[terminalId] === "attention") {
    return "attention";
  }
  // 缂佸牏顏锝呮躬鏉╂劘顢戦崨鎴掓姢
  if ((threadState.runningTerminalIds ?? []).includes(terminalId)) {
    return "running";
  }
  // 缂佸牏顏崨鎴掓姢瀹告彃鐣幋鎰剁礉缁涘绶熼悽銊﹀煕鐎光剝鐓℃潏鎾冲毉缂佹挻鐏?  if (threadState.terminalAttentionStatesById?.[terminalId] === "review") {
    return "review";
  }
  return "idle";
}

/**
 * 鐟欙絾鐎介幐鍥х暰缂佸牏顏惃鍕偓姘辩叀閺勫墽銇氶弽鍥暯閸?CLI 缁鐎烽妴? * 閺嶅洭顣芥导妯哄帥缁狙嶇窗閺嶅洭顣界憰鍡欐磰閸?> 閻劍鍩涢弽鍥╊劮 > CLI 缁鐎锋妯款吇閺嶅洭顣?> "Terminal"閵? *
 * @param threadState - 缁捐法鈻奸惃鍕矒缁旑垶鈧氨鐓￠悩鑸碘偓浣告彥閻撗嶇礉閸欘垵鍏樻稉?undefined
 * @param terminalId - 閻╊喗鐖ｇ紒鍫㈩伂 ID
 * @returns 閸栧懎鎯?CLI 缁鐎烽崪灞炬▔缁€鐑樼垼妫版娈戠€电钖? */
function resolveTerminalNotificationTitle(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): { cliKind: TerminalCliKind | null; title: string } {
  const cliKind = threadState?.terminalCliKindsById?.[terminalId] ?? null;
  // 閹稿绱崗鍫㈤獓娓氭繃顐肩亸婵婄槸閼惧嘲褰囬弽鍥暯閿涙俺顩惄鏍ㄧ垼妫?閳?閻劍鍩涢弽鍥╊劮 閳?CLI 姒涙顓婚弽鍥暯 閳?閸忔粌绨抽崐?  const title =
    threadState?.terminalTitleOverridesById?.[terminalId]?.trim() ||
    threadState?.terminalLabelsById?.[terminalId]?.trim() ||
    (cliKind ? defaultTerminalTitleForCliKind(cliKind) : "Terminal");
  return { cliKind, title };
}

/**
 * 鐎佃鐦崜宥呮倵娑撱倖顐肩紒鍫㈩伂閻樿埖鈧礁鎻╅悡褝绱濋弨鍫曟肠閺傞楠囬悽鐔烘畱瀹告彃鐣幋鎰矒缁旑垯鎹㈤崝鈥斥偓娆撯偓澶愩€嶉妴? * 娴犲懎缍嬬紒鍫㈩伂閻樿埖鈧椒绮犻棃?"review" 閸欐ü璐?"review" 閺冭绱濋幍宥堫吇娑撹桨鎹㈤崝鈥崇暚閹存劕鑻熼悽鐔稿灇閸婃瑩鈧銆嶉妴? *
 * @param previousByThreadId - 娑撳﹣绔村▎鈥虫彥閻撗傝厬閹稿鍤庣粙?ID 缁便垹绱╅惃鍕矒缁旑垳濮搁幀? * @param nextByThreadId - 瑜版挸澧犺箛顐ゅ弾娑擃厽瀵滅痪璺ㄢ柤 ID 缁便垹绱╅惃鍕矒缁旑垳濮搁幀? * @returns 閺傞楠囬悽鐔烘畱瀹告彃鐣幋鎰矒缁旑垯鎹㈤崝鈥斥偓娆撯偓澶愩€嶉弫鎵矋
 */
export function collectCompletedTerminalCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): CompletedTerminalCandidate[] {
  // 閸氬牆鑻熼崜宥呮倵娑撱倖顐艰箛顐ゅ弾閻ㄥ嫭澧嶉張澶屽殠缁?ID閿涘瞼鈥樻穱婵呯瑝闁绱?  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: CompletedTerminalCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    // 閸氬牆鑻熺拠銉у殠缁嬪绗呴崜宥呮倵娑撱倖顐艰箛顐ゅ弾閻ㄥ嫭澧嶉張澶岀矒缁?ID
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      // 娴犲懎缍嬮悩鑸碘偓浣稿綁娑?"review" 娑撴柧绠ｉ崜宥勭瑝閺?"review" 閺冭绱濋幍宥堫潒娑撶儤鏌婄€瑰本鍨氶惃鍕崲閸?      if (nextState !== "review" || previousState === "review") {
        continue;
      }
      const { cliKind, title } = resolveTerminalNotificationTitle(nextThreadState, terminalId);
      candidates.push({
        threadId: threadId as Thread["id"],
        terminalId,
        cliKind,
        title,
      });
    }
  }

  return candidates;
}

/**
 * 閺嶈宓佺€光剝澹掔拠閿嬬湴缁鐎烽悽鐔稿灇鐎电懓绨查惃鍕喅鐟曚焦寮挎潻鐗堟瀮閺堫兙鈧? *
 * @param requestKind - 鐎光剝澹掔拠閿嬬湴缁鐎? * @returns 娴滆櫣琚崣顖濐嚢閻ㄥ嫬顓搁幍瑙勬喅鐟曚焦鏋冮張? */
function approvalSummary(requestKind: "command" | "file-read" | "file-change"): string {
  switch (requestKind) {
    case "command":
      return "Command approval requested.";
    case "file-read":
      return "File-read approval requested.";
    case "file-change":
      return "File-change approval requested.";
  }
}

/**
 * 鐎佃鐦崜宥呮倵娑撱倖顐肩痪璺ㄢ柤韫囶偆鍙庨敍灞炬暪闂嗗棙鏌婃禍褏鏁撻惃鍕付鐟曚胶鏁ら幋宄板彠濞夈劎娈戠痪璺ㄢ柤閸婃瑩鈧銆嶉妴? * 閸栧懏瀚弬鏉垮毉閻滄壆娈戠€光剝澹掔拠閿嬬湴閸滃瞼鏁ら幋鐤翻閸忋儴顕Ч鍌︾礉闁俺绻冨В鏂款嚠鐠囬攱鐪?ID 閸樺鍣搁敍灞肩矌娣囨繄鏆€閺傛澘顤冩い骞库偓? * 缂佹挻鐏夐幐澶婂灡瀵ょ儤妞傞梻鏉戝磳鎼村繑甯撻崚妞尖偓? *
 * @param previousThreads - 娑撳﹣绔村▎鈥虫彥閻撗傝厬閻ㄥ嫮鍤庣粙瀣灙鐞? * @param nextThreads - 瑜版挸澧犺箛顐ゅ弾娑擃厾娈戠痪璺ㄢ柤閸掓銆? * @returns 閺傞楠囬悽鐔烘畱闂団偓閸忚櫕鏁炵痪璺ㄢ柤閸婃瑩鈧銆嶉弫鎵矋閿涘本瀵滈崚娑樼紦閺冨爼妫块崡鍥х碍閹烘帒鍨? */
export function collectThreadAttentionCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): ThreadAttentionCandidate[] {
  // 鐏忓棔绗傛稉鈧▎鈥虫彥閻撗勫瘻缁捐法鈻?ID 瀵よ櫣鐝涚槐銏犵穿
  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: ThreadAttentionCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    // 閺傛澘顤冪痪璺ㄢ柤鐠哄疇绻冮敍灞肩瑝娴溠呮晸閸忚櫕鏁為柅姘辩叀
    if (!previousThread) {
      continue;
    }

    // 閺€鍫曟肠娑撳﹣绔村▎鈥虫彥閻撗傝厬瀹告彃鐡ㄩ崷銊ф畱鐎光剝澹掔拠閿嬬湴 ID閿涘瞼鏁ゆ禍搴″箵闁?    const previousApprovalIds = new Set(
      derivePendingApprovals(previousThread.activities).map((approval) => approval.requestId),
    );
    // 閺€鍫曟肠娑撳﹣绔村▎鈥虫彥閻撗傝厬瀹告彃鐡ㄩ崷銊ф畱閻劍鍩涙潏鎾冲弳鐠囬攱鐪?ID閿涘瞼鏁ゆ禍搴″箵闁?    const previousUserInputIds = new Set(
      derivePendingUserInputs(previousThread.activities).map((request) => request.requestId),
    );

    // 濡偓閺屻儱缍嬮崜宥呮彥閻撗傝厬閻ㄥ嫬顓搁幍纭咁嚞濮瑰偊绱濈粵娑⑩偓澶婂毉閺傛澘顤冩い?    for (const approval of derivePendingApprovals(thread.activities)) {
      if (previousApprovalIds.has(approval.requestId)) {
        continue;
      }
      candidates.push({
        kind: "approval",
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        requestId: approval.requestId,
        createdAt: approval.createdAt,
        requestKind: approval.requestKind,
      });
    }

    // 濡偓閺屻儱缍嬮崜宥呮彥閻撗傝厬閻ㄥ嫮鏁ら幋鐤翻閸忋儴顕Ч鍌︾礉缁涙盯鈧鍤弬鏉款杻妞?    for (const request of derivePendingUserInputs(thread.activities)) {
      if (previousUserInputIds.has(request.requestId)) {
        continue;
      }
      candidates.push({
        kind: "user-input",
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        requestId: request.requestId,
        createdAt: request.createdAt,
      });
    }
  }

  // 閹稿鍨卞鐑樻闂傛潙宕屾惔蹇斿笓閸掓绱濈涵顔荤箽闁氨鐓￠幐澶嬫闂傛挳銆庢惔蹇擃槱閻?  return candidates.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * 鐎佃鐦崜宥呮倵娑撱倖顐肩紒鍫㈩伂閻樿埖鈧礁鎻╅悡褝绱濋弨鍫曟肠閺傞楠囬悽鐔烘畱闂団偓鐟曚胶鏁ら幋宄板彠濞夈劎娈戠紒鍫㈩伂閸婃瑩鈧銆嶉妴? * 娴犲懎缍嬬紒鍫㈩伂閻樿埖鈧椒绮犻棃?"attention" 閸欐ü璐?"attention" 閺冭绱濋幍宥堫吇娑撴椽娓剁憰浣稿彠濞夈劌鑻熼悽鐔稿灇閸婃瑩鈧銆嶉妴? *
 * @param previousByThreadId - 娑撳﹣绔村▎鈥虫彥閻撗傝厬閹稿鍤庣粙?ID 缁便垹绱╅惃鍕矒缁旑垳濮搁幀? * @param nextByThreadId - 瑜版挸澧犺箛顐ゅ弾娑擃厽瀵滅痪璺ㄢ柤 ID 缁便垹绱╅惃鍕矒缁旑垳濮搁幀? * @returns 閺傞楠囬悽鐔烘畱闂団偓閸忚櫕鏁炵紒鍫㈩伂閸婃瑩鈧銆嶉弫鎵矋
 */
export function collectTerminalAttentionCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): TerminalAttentionCandidate[] {
  // 閸氬牆鑻熼崜宥呮倵娑撱倖顐艰箛顐ゅ弾閻ㄥ嫭澧嶉張澶屽殠缁?ID
  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: TerminalAttentionCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    // 閸氬牆鑻熺拠銉у殠缁嬪绗呴崜宥呮倵娑撱倖顐艰箛顐ゅ弾閻ㄥ嫭澧嶉張澶岀矒缁?ID
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      // 娴犲懎缍嬮悩鑸碘偓浣稿綁娑?"attention" 娑撴柧绠ｉ崜宥勭瑝閺?"attention" 閺冭绱濋幍宥堫潒娑撶儤鏌婇惃鍕彠濞夈劋绨ㄦ禒?      if (nextState !== "attention" || previousState === "attention") {
        continue;
      }
      const { cliKind, title } = resolveTerminalNotificationTitle(nextThreadState, terminalId);
      candidates.push({
        threadId: threadId as Thread["id"],
        terminalId,
        cliKind,
        title,
      });
    }
  }

  return candidates;
}

/**
 * 閺嬪嫬缂撶痪璺ㄢ柤娴犺濮熺€瑰本鍨氶柅姘辩叀閻ㄥ嫭妯夌粈鐑樻瀮濡楀牄鈧? * 绾喕绻氬ù蹇氼潔閸?Toast 閸滃本鎼锋担婊呴兇缂佺喖鈧氨鐓℃担璺ㄦ暏娑撯偓閼峰娈戦弬鍥攳閸愬懎顔愰妴? *
 * @param candidate - 瀹告彃鐣幋鎰畱缁捐法鈻奸崐娆撯偓澶愩€? * @returns 閸栧懎鎯堥柅姘辩叀閺嶅洭顣介崪灞绢劀閺傚洨娈戠€电钖? */
export function buildTaskCompletionCopy(candidate: CompletedThreadCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  // 閺嶅洭顣芥稉铏光敄閺冩湹濞囬悽銊╃帛鐠併倖鏋冨?  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";

  return {
    title: threadLabel,
    // 娴兼ê鍘涙担璺ㄦ暏閸斺晜澧滃☉鍫熶紖閹芥顩﹂敍灞炬￥閹芥顩﹂弮鏈靛▏閻劑绮拋銈呯暚閹存劖鏋冨?    body: candidate.assistantSummary || "Finished working.",
  };
}

/**
 * 閺嬪嫬缂撶痪璺ㄢ柤闂団偓鐟曚胶鏁ら幋宄板彠濞夈劍妞傞惃鍕偓姘辩叀閺勫墽銇氶弬鍥攳閵? * 閸栧懏瀚€光剝澹掔拠閿嬬湴閸滃瞼鏁ら幋鐤翻閸忋儴顕Ч鍌欒⒈缁夊秴婧€閺咁垬鈧? *
 * @param candidate - 闂団偓閸忚櫕鏁為惃鍕殠缁嬪鈧瑩鈧銆? * @returns 閸栧懎鎯堥柅姘辩叀閺嶅洭顣介崪灞绢劀閺傚洨娈戠€电钖? */
export function buildThreadAttentionCopy(candidate: ThreadAttentionCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  // 閺嶅洭顣芥稉铏光敄閺冩湹濞囬悽銊╃帛鐠併倖鏋冨?  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";
  // 娴兼ê鍘涙担璺ㄦ暏閸婃瑩鈧銆嶉懛顏勭敨閻ㄥ嫭鎲崇憰渚婄礉閸氾箑鍨弽瑙勫祦缁鐎烽悽鐔稿灇姒涙顓婚幗妯款洣
  const summary =
    candidate.summary ??
    (candidate.kind === "approval"
      ? approvalSummary(candidate.requestKind ?? "command")
      : "User input requested.");

  return {
    title: "Input needed",
    body: `${threadLabel}: ${summary}`,
  };
}

/**
 * 閺嬪嫬缂撶紒鍫㈩伂娴犺濮熺€瑰本鍨氶柅姘辩叀閻ㄥ嫭妯夌粈鐑樻瀮濡楀牄鈧? *
 * @param candidate - 瀹告彃鐣幋鎰畱缂佸牏顏禒璇插閸婃瑩鈧銆? * @returns 閸栧懎鎯堥柅姘辩叀閺嶅洭顣介崪灞绢劀閺傚洨娈戠€电钖? */
export function buildTerminalCompletionCopy(candidate: CompletedTerminalCandidate): {
  title: string;
  body: string;
} {
  // 缂佸牏顏弽鍥暯娑撹櫣鈹栭弮鏈靛▏閻劑绮拋銈呪偓?  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal task completed",
    body: `${terminalLabel} finished working.`,
  };
}

/**
 * 閺嬪嫬缂撶紒鍫㈩伂闂団偓鐟曚胶鏁ら幋宄板彠濞夈劍妞傞惃鍕偓姘辩叀閺勫墽銇氶弬鍥攳閵? *
 * @param candidate - 闂団偓閸忚櫕鏁為惃鍕矒缁旑垰鈧瑩鈧銆? * @returns 閸栧懎鎯堥柅姘辩叀閺嶅洭顣介崪灞绢劀閺傚洨娈戠€电钖? */
export function buildTerminalAttentionCopy(candidate: TerminalAttentionCandidate): {
  title: string;
  body: string;
} {
  // 缂佸牏顏弽鍥暯娑撹櫣鈹栭弮鏈靛▏閻劑绮拋銈呪偓?  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal input needed",
    body: `${terminalLabel} needs your attention.`,
  };
}

/**
 * 閸掋倖鏌囬弰顖氭儊鎼存梹濮傞崚璺虹秼閸撳秴褰茬憴浣哄殠缁嬪娈戦柅姘辩叀閵? * 瑜版挸绨查悽銊х崶閸欙絽顦╂禍搴″閸欓绗栭惄顔界垼缁捐法鈻煎锝呮躬閸欘垵顫嗛崠鍝勭厵閺冭绱濋幎鎴濆煑闁氨鐓℃禒銉╀缉閸忓秵澧﹂幍鎵暏閹存灚鈧? *
 * @param input.threadId - 瀵板懎鍨介弬顓犳畱缁捐法鈻?ID
 * @param input.visibleThreadIds - 瑜版挸澧犻崣顖濐潌閻ㄥ嫮鍤庣粙?ID 闂嗗棗鎮? * @param input.windowForeground - 鎼存梻鏁ょ粣妤€褰涢弰顖氭儊婢跺嫪绨崜宥呭酱
 * @returns 閼汇儱绨查幎鎴濆煑闁氨鐓￠崚娆掔箲閸?true
 */
export function shouldSuppressVisibleThreadNotification(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
  windowForeground: boolean;
}): boolean {
  return input.windowForeground && input.visibleThreadIds.has(input.threadId);
}

/**
 * 閺€鍫曟肠"闂団偓鐟曚胶鏁ら幋鐤翻閸?閻ㄥ嫮鍤庣粙瀣偓娆撯偓澶愩€嶉敍鍧坥llectThreadAttentionCandidates 閻ㄥ嫬鍩嗛崥宥忕礆閵? * 娴ｈ法鏁ょ拠顓濈疅閸栨牕鎳￠崥宥勪簰閹绘劙鐝拫鍐暏閺傚湱娈戞禒锝囩垳閸欘垵顕伴幀褋鈧? */
export const collectInputNeededThreadCandidates = collectThreadAttentionCandidates;

/**
 * 閺嬪嫬缂?闂団偓鐟曚胶鏁ら幋鐤翻閸?闁氨鐓￠弬鍥攳閿涘潌uildThreadAttentionCopy 閻ㄥ嫬鍩嗛崥宥忕礆閵? * 娴ｈ法鏁ょ拠顓濈疅閸栨牕鎳￠崥宥勪簰閹绘劙鐝拫鍐暏閺傚湱娈戞禒锝囩垳閸欘垵顕伴幀褋鈧? */
export const buildInputNeededCopy = buildThreadAttentionCopy;

/**
 * 閸掋倖鏌囬崐娆撯偓澶嬫闂傚瓨鍩戦弰顖氭儊鐏炵偘绨張顒侇偧闁氨鐓℃潻鎰攽閺冨墎娈?閺備即鐭?娴滃娆㈤妴? * 濮樻潙鎮庨敍鍧攜dration閿涘绻冪粙瀣讲閼虫垝绱伴柌宥嗘杹閺冄呭殠缁嬪鏆熼幑顕嗙礉閸欘亝婀侀崷銊︽拱闁氨鐓℃潻鎰攽閺冭泛鎯庨崝銊ょ閸氬簼楠囬悽鐔烘畱閺冨爼妫块幋? * 閹靛秴绨茬悮顐ヮ潒娑撳搫鐤勯弮鏈电皑娴犺绱濋柆鍨帳鐎电懓宸婚崣鍙夋殶閹诡噣鍣告径宥埿曢崣鎴︹偓姘辩叀閵? *
 * @param candidateTimestamp - 閸婃瑩鈧绨ㄦ禒鍓佹畱閺冨爼妫块幋绛圭礄ISO 8601 閺嶇厧绱＄€涙顑佹稉璇х礆
 * @param runtimeStartedAtMs - 闁氨鐓℃潻鎰攽閺冨墎娈戦崥顖氬З閺冨爼妫块敍鍫燁嚑缁夋帞楠囬弮鍫曟？閹寸绱? * @returns 閼汇儲妞傞梻瀛樺煈閺呮矮绨潻鎰攽閺冭泛鎯庨崝銊︽闂傛潙鍨潻鏂挎礀 true閿涘矁銆冪粈鐑樻Ц閺備即鐭炴禍瀣╂閿? *          閼汇儰鎹㈡稉鈧崣鍌涙殶閺冪姵纭剁憴锝嗙€芥稉鐑樻箒閺佸牊鏆熺€涙ぞ绡冩潻鏂挎礀 true閿涘牅绻氱€瑰牏鐡ラ悾銉礆
 */
export function isNotificationRuntimeFreshTimestamp(
  candidateTimestamp: string,
  runtimeStartedAtMs: number,
): boolean {
  const candidateMs = Date.parse(candidateTimestamp);
  // 閼汇儲妞傞梻瀛樺煈閺冪姵纭剁憴锝嗙€介敍宀勫櫚閻劋绻氱€瑰牏鐡ラ悾銉潒娑撶儤鏌婃ご婊€绨ㄦ禒?  if (!Number.isFinite(candidateMs) || !Number.isFinite(runtimeStartedAtMs)) {
    return true;
  }
  return candidateMs > runtimeStartedAtMs;
}
