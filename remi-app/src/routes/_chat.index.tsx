/**
 * @file 閼卞﹤銇夌槐銏犵穿鐠侯垳鏁卞Ο鈥虫健
 * @description 鎼存梻鏁ら崥顖氬З閺冭埖浠径宥勭瑐濞喡や喊婢垛晞鐭鹃悽鎲嬬礉閼汇儲妫ら崣顖滄暏鐠佹澘缍嶉崚娆忓灡瀵ょ儤鏌婇惃鍕啀鎼搭叀浜版径鈺勫磸缁? * @layer 鐠侯垳鏁辩仦? * @depends sidebar UI 閹镐椒绠欓崠鏍モ偓浣稿彙娴滎偆娈戦弬鏉跨紦閼卞﹤銇夋径鍕倞閸ｎ煉绱欓悽銊ょ艾缁岃櫣濮搁幀浣告礀闁偓閿? */

import { ThreadId } from "~/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { SplashScreen } from "../components/SplashScreen";
import { readSidebarUiState } from "../components/Sidebar.uiState";
import { resolveRestorableThreadRoute } from "../chatRouteRestore";
import { useHandleNewChat } from "../hooks/useHandleNewChat";
import { useSplitViewStore } from "../splitViewStore";
import { useStore } from "../store";

/**
 * 閼卞﹤銇夌槐銏犵穿鐠侯垳鏁辩憴鍡楁禈缂佸嫪娆? * @description 鎼存梻鏁ら崥顖氬З閺冨墎娈戦崗銉ュ經鐠侯垳鏁遍敍宀冪鐠愶絾浠径宥勭瑐濞嗭紕娈戦懕濠傘亯娴兼俺鐦介幋鏍у灡瀵ょ儤鏌婃导姘崇樈
 * 瀹搞儰缍斿ù浣衡柤閿? * 1. 缁涘绶熺痪璺ㄢ柤閸滃苯鍨庨崜鑼额潒閸ョ偓鏆熼幑顔芥寜閸氬牆鐣幋? * 2. 鐏忔繆鐦禒搴㈡拱閸︽澘鐡ㄩ崒銊︿划婢跺秳绗傚▎锛勬畱缁捐法鈻肩捄顖滄暠
 * 3. 閼汇儲妫ゅ▔鏇熶划婢跺稄绱濋崚娆忓灡瀵ょ儤鏌婇惃鍕喊婢垛晙绱扮拠? * 4. 閼汇儱鍨卞鍝勩亼鐠愩儻绱濈仦鏇犮仛闁挎瑨顕ゆ穱鈩冧紖楠炶埖褰佹笟娑㈠櫢鐠囨洘瀵滈柦? */
function ChatIndexRouteView() {
  const { handleNewChat } = useHandleNewChat();
  const navigate = useNavigate();
  /** 缁捐法鈻奸弫鐗堝祦閺勵垰鎯佸韫矤閹镐椒绠欓崠鏍х摠閸屻劌濮炴潪钘夌暚閹?*/
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  /** 閹碘偓閺堝褰查悽銊ф畱缁捐法鈻?ID 閸掓銆?*/
  const threadIds = useStore((state) => state.threadIds ?? []);
  /** 閸掑棗澹婄憴鍡楁禈閺佺増宓侀弰顖氭儊瀹稿弶鎸夐崥?*/
  const splitViewsHydrated = useSplitViewStore((state) => state.hasHydrated);
  /** 閹碘偓閺堝鍨庨崜鑼额潒閸ュ墽娈戦弰鐘茬殸鐞?*/
  const splitViewsById = useSplitViewStore((state) => state.splitViewsById);
  /** 鏉╁洦鎶ら崙鐑樻箒閺佸牏娈戦崚鍡楀鐟欏棗娴?ID 閸掓銆?*/
  const splitViewIds = useMemo(
    () => Object.keys(splitViewsById).filter((splitViewId) => splitViewsById[splitViewId]),
    [splitViewsById],
  );
  /** 闁插秷鐦拋鈩冩殶閸ｎ煉绱濆В蹇旑偧闁插秷鐦弮鍫曗偓鎺戭杻娴犮儴袝閸?useEffect 闁插秵鏌婇幍褑顢?*/
  const [attempt, setAttempt] = useState(0);
  /** 闁挎瑨顕ゆ穱鈩冧紖閿涘瞼鏁ゆ禍搴℃躬閸氼垰濮╃仦蹇撶鐏炴洜銇氭径杈Е閸樼喎娲?*/
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // 缁涘绶熼弫鐗堝祦濮樻潙鎮庣€瑰本鍨氶崥搴″晙閹笛嗩攽閹垹顦查柅鏄忕帆
    if (!threadsHydrated || !splitViewsHydrated) {
      return;
    }

    let cancelled = false;
    setErrorMessage(null);

    void (async () => {
      // 鐏忔繆鐦禒搴㈡拱閸︽澘鐡ㄩ崒銊︿划婢跺秳绗傚▎锛勬畱缁捐法鈻肩捄顖滄暠
      const restorableRoute = resolveRestorableThreadRoute({
        lastThreadRoute: readSidebarUiState().lastThreadRoute,
        availableThreadIds: new Set(threadIds),
        availableSplitViewIds: new Set(splitViewIds),
      });
      if (restorableRoute) {
        if (cancelled) {
          return;
        }
        await navigate({
          to: "/$threadId",
          params: { threadId: ThreadId.makeUnsafe(restorableRoute.threadId) },
          replace: true,
          search: () => ({
            splitViewId: restorableRoute.splitViewId,
          }),
        });
        return;
      }

      // 閺冪姵纭堕幁銏狀槻閺冭绱濋崚娑樼紦閺傛壆娈戦懕濠傘亯娴兼俺鐦?      const result = await handleNewChat({ fresh: true });
      if (cancelled || result.ok) {
        return;
      }
      setErrorMessage(result.error);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    attempt,
    handleNewChat,
    navigate,
    splitViewIds,
    splitViewsHydrated,
    threadIds,
    threadsHydrated,
  ]);

  return (
    <SplashScreen
      errorMessage={errorMessage}
      onRetry={errorMessage ? () => setAttempt((value) => value + 1) : null}
    />
  );
}

/**
 * 閼卞﹤銇夌槐銏犵穿鐠侯垳鏁辩€规矮绠? * @description 鐎规矮绠?/_chat/ 鐠侯垳鏁遍敍灞肩稊娑撳搫绨查悽銊ユ儙閸斻劍妞傞惃鍕帛鐠併倕鍙嗛崣? */
export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
