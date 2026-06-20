/**
 * @file useDisposableThreadLifecycle.ts
 * @description 濞戞挴鍋撴繛鍡忓墲閳ь儸鍛疇缂佸顑囬弫鎾诲川閽樺鍣柡鍫㈠枔椤撴悂鎮?Hook - 濠㈣泛瀚幃濠冪▔鐎涙ɑ顦х紒鎹愭硶閳诲ジ鎯冮崟顒傤伕闁荤偛妫楅幏浼存煥閳ь剙袙? * @module hooks/useDisposableThreadLifecycle
 */

import type { ThreadId } from "~/contracts";
import { useEffect, useRef } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { resolveDisposableThreadIdToDispose } from "../lib/disposableThread";
import { newCommandId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useSplitViewStore } from "../splitViewStore";
import { useStore } from "../store";
import { useTemporaryThreadStore } from "../temporaryThreadStore";
import { useTerminalStateStore } from "../terminalStateStore";
import { getThreadFromState } from "../threadDerivation";

/**
 * 濞戞挴鍋撴繛鍡忓墲閳ь儸鍛疇缂佸顑囬弫鎾诲川閽樺鍣柡鍫㈠枔椤撴悂鎮?Hook
 *
 * @description
 * 闁烩晜鍨剁敮璺好虹拠鎻捫楃紒鎹愭硶閳诲ジ鎯冮崟顐㈢秮闁告牗鐗槐婵娿亹閹炬惌姊炬繛鏉戭儏閸╁本绋夌€涙ɑ顦х紒鎹愭硶閳诲ジ妫侀埀顒傛啺娴ｇ瓔娼堕梺搴撳亾婵絼鐒﹀鍌炴晬鐏炴儳鈷旈悶娑樿嫰閻ｎ剟寮€靛憡鐣辨繛鎾虫噽閹﹤霉娴ｈ　鏌ら柨? * 1. 闁稿绮嶉娑氱棯鐠恒劉鏌ゅù鍏间亢閻︿粙鏁嶉崼婵愭搐闁哄绮嶉婊堝捶閵娿劎绠ラ悶娑樼焿缁? * 2. 闁稿繑濞婂Λ瀵哥磼閸埄浼傛鐐舵硾閸ㄥ綊姊介妶鍛潑闁告瑨灏鍥亹? * 3. 濞寸姴瀛╁﹢鍥礉閳ヨ櫕鐝ら柛鎺斿█濞呭海鐥捄銊㈡煠
 * 4. 婵炴挸鎳愰幃濠囧箥閳ь剟寮垫径灞剧ゲ闁稿繐纾▓鎴﹀嫉椤掆偓濠€鎾偐閼哥鍋撴笟濠勭闁艰棄顦辨灙闁靛棔鑳剁划鎾剁博椤栨粌笑闁诡兛闄嶉埀顑跨閸ㄥ海浠﹁箛姘兼綊闁搞儰鍕橀埀顑挎婢跺秹寮懜鐢靛灱閻犱礁搴滅槐? *
 * @param activeThreadId - 鐟滅増鎸告晶鐘裁虹拠鎻捫楅柣銊ュ閸ゅ海绮?ID闁挎稑濂旂拹?null 閻炴稏鍔庨妵姘跺籍閻樿櫕銇熼柛鏂诲妿閸ゅ海绮? *
 * @example
 * ```tsx
 * function App() {
 *   useDisposableThreadLifecycle(currentThreadId);
 *   return <div>...</div>;
 * }
 * ```
 *
 * @remarks
 * - 濞寸姴鎳庡﹢顏劽虹拠鎻捫楃紒鎹愭硶閳诲ジ宕ｅΟ鍝勵嚙闁哄啯鍎艰闁告瑦鍨堕ˉ鍛村蓟? * - 濞达綀娉曢弫?ref 闂傚啫寮堕娑㈡煂瀹ュ拋妲婚梺搴撳亾婵絼绀侀幃鎾寸▔閳ь剚绋夐鍡楁疇缂? * - 闁圭鍋撻柡鍫濐槹缁斿鎮堕崱妯绘儥濞达絾绮撻崗姗€寮伴姘辩＝婵縿鍎冲▓鎴︽晬鐏炲浜奸悹鎰╁劜濡炲倿妫冨▎鎾跺笡濠㈣泛瀚幃? */
export function useDisposableThreadLifecycle(activeThreadId: ThreadId | null): void {
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const removeThreadFromSplitViews = useSplitViewStore((store) => store.removeThreadFromSplitViews);
  const temporaryThreadIds = useTemporaryThreadStore((store) => store.temporaryThreadIds);
  const clearTemporaryThread = useTemporaryThreadStore((store) => store.clearTemporaryThread);
  
  // 閼惧嘲褰囬崚婵嗩潗閼藉顭堢痪璺ㄢ柤閻樿埖鈧緤绱欐禒鍛暏娴滃骸鍨垫慨瀣 ref閿?  const initialDraftThread =
    activeThreadId !== null
      ? useComposerDraftStore.getState().draftThreadsByThreadId[activeThreadId]
      : undefined;
  
  // 鐠虹喕閲滄稉濠佺娑擃亞鍤庣粙瀣畱閻樿埖鈧緤绱濋悽銊ょ艾濡偓濞村鍤庣粙瀣瀼閹?  const previousThreadStateRef = useRef<{
    threadId: ThreadId | null;
    wasTemporary: boolean;
  }>({
    threadId: activeThreadId,
    wasTemporary:
      (activeThreadId ? temporaryThreadIds[activeThreadId] === true : false) ||
      initialDraftThread?.isTemporary === true,
  });
  
  // 濮濓絽婀柨鈧В浣疯厬閻ㄥ嫮鍤庣粙?ID 闂嗗棗鎮庨敍宀勬Щ濮濄垽鍣告径宥夋敘濮?  const disposingThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    const previousThreadState = previousThreadStateRef.current;
    const draftThreadsByThreadId = useComposerDraftStore.getState().draftThreadsByThreadId;
    
    // 闁哄洤鐡ㄩ弻濠冪▔婵犱胶顏卞☉鎿冧簽閸ゅ海绮欑€ｎ剙笑闁诡兛妞掔拹鐔汇亹閹惧啿顤呯紒鎹愭硶閳?    previousThreadStateRef.current = {
      threadId: activeThreadId,
      wasTemporary: activeThreadId
        ? temporaryThreadIds[activeThreadId] === true ||
          draftThreadsByThreadId[activeThreadId]?.isTemporary === true
        : false,
    };

    // 閸掋倖鏌囬弰顖氭儊闂団偓鐟曚線鏀㈠В浣风瑐娑撯偓娑擃亞鍤庣粙?    const disposableThreadId = resolveDisposableThreadIdToDispose({
      previousThreadId: previousThreadState.threadId,
      nextThreadId: activeThreadId,
      previousThreadWasTemporary: previousThreadState.wasTemporary,
      draftThreadsByThreadId,
    });
    
    // 閺冪娀娓堕柨鈧В浣瑰灗濮濓絽婀柨鈧В浣疯厬閿涘瞼娲块幒銉ㄧ箲閸?    if (!disposableThreadId || disposingThreadIdsRef.current.has(disposableThreadId)) {
      return;
    }

    // 閺嶅洩顔囨稉鐑橆劀閸︺劑鏀㈠В?    disposingThreadIdsRef.current.add(disposableThreadId);
    
    // 闁圭瑳鍡╂斀鐎殿喖鍊归鐐层€掗崨顖涘€炴繛缈犺兌閳?    void (async () => {
      try {
        const api = readNativeApi();
        const storeState = useStore.getState();
        const serverThread = getThreadFromState(storeState, disposableThreadId) ?? null;

        if (api) {
          // 1. 闁稿绮嶉娑氱棯鐠恒劉鏌ゅù鍏间亢閻︿粙鏁嶉崼婵愭搐闁哄绮嶉婊堝捶閵娿劎绠ラ悶娑樼焿缁?          if (serverThread?.session && serverThread.session.status !== "closed") {
            await api.orchestration
              .dispatchCommand({
                type: "thread.session.stop",
                commandId: newCommandId(),
                threadId: disposableThreadId,
                createdAt: new Date().toISOString(),
              })
              .catch(() => undefined);
          }

          // 2. 閸忔娊妫寸紒鍫㈩伂楠炶泛鍨归梽銈呭坊閸欒尪顔囪ぐ?          await api.terminal
            .close({ threadId: disposableThreadId, deleteHistory: true })
            .catch(() => undefined);

          // 3. 濞寸姴瀛╁﹢鍥礉閳ヨ櫕鐝ら柛鎺斿█濞呭海鐥捄銊㈡煠
          if (serverThread) {
            await api.orchestration
              .dispatchCommand({
                type: "thread.delete",
                commandId: newCommandId(),
                threadId: disposableThreadId,
              })
              .catch(() => undefined);
            
            // 闁告艾鏈鐐哄嫉閳ь剟寮幍顔界暠 Shell 闊浂鍋嗛崣?            const snapshot = await api.orchestration.getShellSnapshot().catch(() => null);
            if (snapshot) {
              syncServerShellSnapshot(snapshot);
            }
          }
        }

        // 4. 濞撳懐鎮婇幍鈧張澶屾祲閸忓磭娈戦張顒€婀撮悩鑸碘偓渚婄礄閼藉顭堥妴浣虹矒缁旑垳濮搁幀浣碘偓浣稿瀻鐏炲繗顫嬮崶淇扁偓浣峰閺冭埖鐖ｇ拋甯礆
        clearDraftThread(disposableThreadId);
        clearTerminalState(disposableThreadId);
        removeThreadFromSplitViews(disposableThreadId);
        clearTemporaryThread(disposableThreadId);
      } finally {
        // 濞寸姴瀛╅婊堝捶閵娾晜鏁樻慨锝勭窔濞夛箓宕ラ崼婊嗗幀缂佸顭峰▍?        disposingThreadIdsRef.current.delete(disposableThreadId);
      }
    })();
  }, [
    activeThreadId,
    clearDraftThread,
    clearTerminalState,
    clearTemporaryThread,
    removeThreadFromSplitViews,
    syncServerShellSnapshot,
    temporaryThreadIds,
  ]);
}
