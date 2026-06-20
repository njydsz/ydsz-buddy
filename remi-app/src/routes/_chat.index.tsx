/**
 * @file 鑱婂ぉ绱㈠紩璺敱妯″潡
 * @description 搴旂敤鍚姩鏃舵仮澶嶄笂娆¤亰澶╄矾鐢憋紝鑻ユ棤鍙敤璁板綍鍒欏垱寤烘柊鐨勫搴亰澶╄崏绋? * @layer 璺敱灞? * @depends sidebar UI 鎸佷箙鍖栥€佸叡浜殑鏂板缓鑱婂ぉ澶勭悊鍣紙鐢ㄤ簬绌虹姸鎬佸洖閫€锛? */

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
 * 鑱婂ぉ绱㈠紩璺敱瑙嗗浘缁勪欢
 * @description 搴旂敤鍚姩鏃剁殑鍏ュ彛璺敱锛岃礋璐ｆ仮澶嶄笂娆＄殑鑱婂ぉ浼氳瘽鎴栧垱寤烘柊浼氳瘽
 * 宸ヤ綔娴佺▼锛? * 1. 绛夊緟绾跨▼鍜屽垎鍓茶鍥炬暟鎹按鍚堝畬鎴? * 2. 灏濊瘯浠庢湰鍦板瓨鍌ㄦ仮澶嶄笂娆＄殑绾跨▼璺敱
 * 3. 鑻ユ棤娉曟仮澶嶏紝鍒欏垱寤烘柊鐨勮亰澶╀細璇? * 4. 鑻ュ垱寤哄け璐ワ紝灞曠ず閿欒淇℃伅骞舵彁渚涢噸璇曟寜閽? */
function ChatIndexRouteView() {
  const { handleNewChat } = useHandleNewChat();
  const navigate = useNavigate();
  /** 绾跨▼鏁版嵁鏄惁宸蹭粠鎸佷箙鍖栧瓨鍌ㄥ姞杞藉畬鎴?*/
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  /** 鎵€鏈夊彲鐢ㄧ殑绾跨▼ ID 鍒楄〃 */
  const threadIds = useStore((state) => state.threadIds ?? []);
  /** 鍒嗗壊瑙嗗浘鏁版嵁鏄惁宸叉按鍚?*/
  const splitViewsHydrated = useSplitViewStore((state) => state.hasHydrated);
  /** 鎵€鏈夊垎鍓茶鍥剧殑鏄犲皠琛?*/
  const splitViewsById = useSplitViewStore((state) => state.splitViewsById);
  /** 杩囨护鍑烘湁鏁堢殑鍒嗗壊瑙嗗浘 ID 鍒楄〃 */
  const splitViewIds = useMemo(
    () => Object.keys(splitViewsById).filter((splitViewId) => splitViewsById[splitViewId]),
    [splitViewsById],
  );
  /** 閲嶈瘯璁℃暟鍣紝姣忔閲嶈瘯鏃堕€掑浠ヨЕ鍙?useEffect 閲嶆柊鎵ц */
  const [attempt, setAttempt] = useState(0);
  /** 閿欒淇℃伅锛岀敤浜庡湪鍚姩灞忓箷灞曠ず澶辫触鍘熷洜 */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // 绛夊緟鏁版嵁姘村悎瀹屾垚鍚庡啀鎵ц鎭㈠閫昏緫
    if (!threadsHydrated || !splitViewsHydrated) {
      return;
    }

    let cancelled = false;
    setErrorMessage(null);

    void (async () => {
      // 灏濊瘯浠庢湰鍦板瓨鍌ㄦ仮澶嶄笂娆＄殑绾跨▼璺敱
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

      // 鏃犳硶鎭㈠鏃讹紝鍒涘缓鏂扮殑鑱婂ぉ浼氳瘽
      const result = await handleNewChat({ fresh: true });
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
 * 鑱婂ぉ绱㈠紩璺敱瀹氫箟
 * @description 瀹氫箟 /_chat/ 璺敱锛屼綔涓哄簲鐢ㄥ惎鍔ㄦ椂鐨勯粯璁ゅ叆鍙? */
export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
