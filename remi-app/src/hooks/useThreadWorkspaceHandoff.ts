/**
 * @file useThreadWorkspaceHandoff.ts
 * @description 缁捐法鈻煎銉ょ稊閸栬桨姘﹂幒?Hook - 婢跺嫮鎮婄痪璺ㄢ柤閸︺劍婀伴崷鏉挎嫲瀹搞儰缍旈弽鎴滅闂傚娈戦崚鍥ㄥ床
 * @module hooks/useThreadWorkspaceHandoff
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OrchestrationShellSnapshot, ThreadId } from "~/contracts";
import { resolveWorktreeHandoffIntent } from "~/shared/worktreeHandoff";
import { useCallback, useState } from "react";
import { gitHandoffThreadMutationOptions } from "~/lib/gitReactQuery";
import { buildSuggestedWorktreeName } from "../components/ChatView.logic";
import { toastManager } from "../components/ui/toast";
import { newCommandId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { setupProjectScript } from "../projectScripts";
import type { Project, ProjectScript, Thread, ThreadWorkspacePatch } from "../types";

/**
 * 缁捐法鈻煎銉ょ稊閸栬桨姘﹂幒?Hook
 *
 * @description
 * 婢跺嫮鎮婄痪璺ㄢ柤閸︺劍婀伴崷鎵箚婢у喛绱檒ocal閿涘鎷板銉ょ稊閺嶆垹骞嗘晶鍐跨礄worktree閿涘绠ｉ梻瀵告畱閸掑洦宕查妴? * 閺€顖涘瘮閿? * - 閸掑洦宕查崚鐗堟拱閸︾増膩瀵骏绱欓惄瀛樺复閸︺劑銆嶉惄顔炬窗瑜版洖浼愭担婊愮礆
 * - 閸掑洦宕查崚鏉夸紣娴ｆ粍鐖插Ο鈥崇础閿涘牆婀悪顒傜彌閻?git worktree 娑擃厼浼愭担婊愮礆
 * - 閼奉亜濮╁Λ鈧ù瀣讲婢跺秶鏁ら惃鍕彠閼辨柨浼愭担婊勭埐
 * - 瀹搞儰缍旈弽鎴濇嚒閸氬秴顕拠婵囶攱
 * - 娴溿倖甯撮崥搴ゅ殰閸斻劍澧界悰宀勩€嶉惄顔款啎缂冾喛鍓奸張? *
 * @param input - 鏉堟挸鍙嗛崣鍌涙殶鐎电钖? * @param input.activeProject - 瑜版挸澧犲ú璇插З妞ゅ湱娲? * @param input.activeThread - 瑜版挸澧犲ú璇插З缁捐法鈻? * @param input.activeRootBranch - 瑜版挸澧犻弽鐟板瀻閺€? * @param input.activeThreadAssociatedWorktree - 缁捐法鈻奸崗瀹犱粓閻ㄥ嫬浼愭担婊勭埐娣団剝浼? * @param input.isServerThread - 閺勵垰鎯佹稉鐑樻箛閸斺€虫珤缁捐法鈻? * @param input.stopActiveThreadSession - 閸嬫粍顒涜ぐ鎾冲缁捐法鈻兼导姘崇樈閻ㄥ嫭鏌熷▔? * @param input.runProjectScript - 鏉╂劘顢戞い鍦窗閼存碍婀伴惃鍕煙濞? * @param input.setStoreThreadWorkspace - 鐠佸墽鐤嗙痪璺ㄢ柤瀹搞儰缍旈崠铏规畱閺傝纭? * @param input.syncServerShellSnapshot - 閸氬本顒?Shell 韫囶偆鍙庨惃鍕煙濞? *
 * @returns 瀹搞儰缍旈崠杞版唉閹恒儳娴夐崗宕囨畱閻樿埖鈧礁鎷伴弬瑙勭《
 *
 * @example
 * ```tsx
 * const {
 *   onHandoffToWorktree,
 *   onHandoffToLocal,
 *   handoffBusy,
 *   worktreeHandoffDialogOpen,
 * } = useThreadWorkspaceHandoff({ ... });
 * ```
 */
export function useThreadWorkspaceHandoff(input: {
  activeProject: Project | undefined;
  activeThread: Thread | undefined;
  activeRootBranch: string | null;
  activeThreadAssociatedWorktree: {
    associatedWorktreePath: string | null;
    associatedWorktreeBranch: string | null;
    associatedWorktreeRef: string | null;
  };
  isServerThread: boolean;
  stopActiveThreadSession: () => Promise<void>;
  runProjectScript: (
    script: ProjectScript,
    options?: {
      cwd?: string;
      worktreePath?: string | null;
      rememberAsLastInvoked?: boolean;
      env?: Record<string, string>;
    },
  ) => Promise<void>;
  setStoreThreadWorkspace: (threadId: ThreadId, patch: ThreadWorkspacePatch) => void;
  syncServerShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void;
}) {
  const queryClient = useQueryClient();
  const handoffThreadMutation = useMutation(
    gitHandoffThreadMutationOptions({ cwd: input.activeProject?.cwd ?? null, queryClient }),
  );
  const [worktreeHandoffDialogOpen, setWorktreeHandoffDialogOpen] = useState(false);
  const [worktreeHandoffName, setWorktreeHandoffName] = useState("");

  /**
   * 閹笛嗩攽瀹搞儰缍旈崠杞版唉閹?   *
   * @description
   * 閺嶇绺炬禍銈嗗复闁槒绶敍?   * 1. 閸嬫粍顒涜ぐ鎾冲缁捐法鈻兼导姘崇樈
   * 2. 閹笛嗩攽 git 娴溿倖甯撮幙宥勭稊閿涘牆鍨忛幑銏犲瀻閺€?worktree閿?   * 3. 閺囧瓨鏌婄痪璺ㄢ柤閸忓啯鏆熼幑?   * 4. 閸氬本顒?Shell 韫囶偆鍙?   * 5. 閸︺劌浼愭担婊勭埐濡€崇础娑撳澧界悰宀勩€嶉惄顔款啎缂冾喛鍓奸張?   *
   * @param targetMode - 閻╊喗鐖ｅΟ鈥崇础閿?local" 閹?"worktree"
   * @param options - 閸欘垶鈧寮弫甯礄妫ｆ牠鈧浼愭担婊勭埐閸氬秶袨閿?   * @returns 閺勵垰鎯佹禍銈嗗复閹存劕濮?   */
  const handoffThread = useCallback(
    async (targetMode: "local" | "worktree", options?: { preferredWorktreeName?: string }) => {
      const api = readNativeApi();
      if (
        !api ||
        !input.activeProject ||
        !input.activeThread ||
        !input.isServerThread ||
        handoffThreadMutation.isPending
      ) {
        return false;
      }

      try {
        // 閸嬫粍顒涜ぐ鎾冲缁捐法鈻兼导姘崇樈
        await input.stopActiveThreadSession();
        
        // 閹笛嗩攽 git 娴溿倖甯撮幙宥勭稊
        const result = await handoffThreadMutation.mutateAsync({
          targetMode,
          currentBranch: input.activeThread.branch ?? null,
          worktreePath: input.activeThread.worktreePath ?? null,
          associatedWorktreePath: input.activeThreadAssociatedWorktree.associatedWorktreePath,
          associatedWorktreeBranch: input.activeThreadAssociatedWorktree.associatedWorktreeBranch,
          associatedWorktreeRef: input.activeThreadAssociatedWorktree.associatedWorktreeRef,
          preferredLocalBranch: input.activeRootBranch ?? input.activeThread.branch ?? null,
          preferredWorktreeBaseBranch:
            input.activeRootBranch ??
            input.activeThreadAssociatedWorktree.associatedWorktreeBranch ??
            input.activeThread.branch ??
            null,
          preferredNewWorktreeName: options?.preferredWorktreeName ?? null,
        });

        // 閺嬪嫬缂撳銉ょ稊閸栭缚藟娑?        const workspacePatch = {
          envMode: result.targetMode,
          branch: result.branch,
          worktreePath: result.worktreePath,
          associatedWorktreePath: result.associatedWorktreePath,
          associatedWorktreeBranch: result.associatedWorktreeBranch,
          associatedWorktreeRef: result.associatedWorktreeRef,
          ...(targetMode === "worktree" ? { createBranchFlowCompleted: false } : {}),
        } as const;

        // 閺囧瓨鏌婇張宥呭閸ｃ劎顏惃鍕殠缁嬪鍘撻弫鐗堝祦
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: input.activeThread.id,
          ...workspacePatch,
        });
        // 閺囧瓨鏌婇張顒€婀寸€涙ê鍋嶉惃鍕殠缁嬪浼愭担婊冨隘娣団剝浼?        input.setStoreThreadWorkspace(input.activeThread.id, workspacePatch);

        // 閸氬本顒?Shell 韫囶偆鍙?        const snapshot = await api.orchestration.getShellSnapshot();
        input.syncServerShellSnapshot(snapshot);

        // 閸︺劌浼愭担婊勭埐濡€崇础娑撳澧界悰宀勩€嶉惄顔款啎缂冾喛鍓奸張?        if (targetMode === "worktree" && result.worktreePath) {
          const setupScript = setupProjectScript(input.activeProject.scripts);
          if (setupScript) {
            await input.runProjectScript(setupScript, {
              cwd: result.worktreePath,
              worktreePath: result.worktreePath,
              rememberAsLastInvoked: false,
            });
          }
        }

        // 閺勫墽銇氭禍銈嗗复缂佹挻鐏夐柅姘辩叀
        toastManager.add({
          type: result.conflictsDetected ? "warning" : "success",
          title:
            targetMode === "worktree"
              ? "Thread handed off to worktree"
              : "Thread handed off to local",
          ...(result.message ? { description: result.message } : {}),
        });
        return true;
      } catch (error) {
        toastManager.add({
          type: "error",
          title:
            targetMode === "worktree"
              ? "Could not hand off to worktree"
              : "Could not hand off to local",
          description:
            error instanceof Error ? error.message : "An error occurred during the handoff.",
        });
        return false;
      }
    },
    [handoffThreadMutation, input],
  );

  /**
   * 婢跺嫮鎮婃禍銈嗗复閸掓澘浼愭担婊勭埐
   *
   * @description
   * 濡偓閺屻儲妲搁崥锕€褰叉禒銉ヮ槻閻劌鍑￠張澶屾畱閸忓疇浠堝銉ょ稊閺嶆埊绱?   * - 婵″倹鐏夐崣顖欎簰婢跺秶鏁ら敍宀€娲块幒銉﹀⒔鐞涘奔姘﹂幒?   * - 閸氾箑鍨幍鎾崇磻閸涜棄鎮曠€电鐦藉鍡氼唨閻劍鍩涙潏鎾冲弳瀹搞儰缍旈弽鎴濇倳缁?   */
  const onHandoffToWorktree = useCallback(() => {
    if (!input.activeThread) {
      return;
    }

    // 鐟欙絾鐎藉銉ょ稊閺嶆垳姘﹂幒銉﹀壈閸?    const worktreeIntent = resolveWorktreeHandoffIntent({
      associatedWorktreePath: input.activeThreadAssociatedWorktree.associatedWorktreePath,
      associatedWorktreeBranch: input.activeThreadAssociatedWorktree.associatedWorktreeBranch,
      associatedWorktreeRef: input.activeThreadAssociatedWorktree.associatedWorktreeRef,
      preferredWorktreeBaseBranch: input.activeRootBranch,
      currentBranch: input.activeThread.branch ?? null,
    });
    
    // 婵″倹鐏夐崣顖欎簰婢跺秶鏁ら崗瀹犱粓瀹搞儰缍旈弽鎴礉閻╁瓨甯撮幍褑顢戞禍銈嗗复
    if (worktreeIntent?.kind === "reuse-associated") {
      void handoffThread("worktree");
      return;
    }

    // 閸氾箑鍨幍鎾崇磻閸涜棄鎮曠€电鐦藉?    setWorktreeHandoffName(
      buildSuggestedWorktreeName({
        associatedWorktreeBranch:
          input.activeThreadAssociatedWorktree.associatedWorktreeBranch ??
          input.activeThread.branch ??
          null,
        title: input.activeThread.title,
      }),
    );
    setWorktreeHandoffDialogOpen(true);
  }, [handoffThread, input]);

  /**
   * 绾喛顓诲銉ょ稊閺嶆垳姘﹂幒?   *
   * @description
   * 娴ｈ法鏁ら悽銊﹀煕鏉堟挸鍙嗛惃鍕紣娴ｆ粍鐖查崥宥囆為幍褑顢戞禍銈嗗复
   */
  const confirmWorktreeHandoff = useCallback(async () => {
    const normalizedWorktreeName = buildSuggestedWorktreeName({
      associatedWorktreeBranch: worktreeHandoffName,
    });
    setWorktreeHandoffName(normalizedWorktreeName);
    const succeeded = await handoffThread("worktree", {
      preferredWorktreeName: normalizedWorktreeName,
    });
    if (succeeded) {
      setWorktreeHandoffDialogOpen(false);
    }
  }, [handoffThread, worktreeHandoffName]);

  /**
   * 婢跺嫮鎮婃禍銈嗗复閸掔増婀伴崷鎵箚婢?   */
  const onHandoffToLocal = useCallback(async () => {
    await handoffThread("local");
  }, [handoffThread]);

  return {
    /** 娴溿倖甯撮幙宥勭稊閺勵垰鎯佸锝呮躬鏉╂稖顢戞稉?*/
    handoffBusy: handoffThreadMutation.isPending,
    /** 瀹搞儰缍旈弽鎴滄唉閹恒儱顕拠婵囶攱閺勵垰鎯侀幍鎾崇磻 */
    worktreeHandoffDialogOpen,
    /** 鐠佸墽鐤嗗銉ょ稊閺嶆垳姘﹂幒銉ヮ嚠鐠囨繃顢嬮惃鍕ⅵ瀵偓閻樿埖鈧?*/
    setWorktreeHandoffDialogOpen,
    /** 瀹搞儰缍旈弽鎴濇倳缁?*/
    worktreeHandoffName,
    /** 鐠佸墽鐤嗗銉ょ稊閺嶆垵鎮曠粔?*/
    setWorktreeHandoffName,
    /** 娴溿倖甯村銉ょ稊閺嶆垵顦╅悶鍡楀毐閺?*/
    onHandoffToWorktree,
    /** 娴溿倖甯撮張顒€婀存径鍕倞閸戣姤鏆?*/
    onHandoffToLocal,
    /** 绾喛顓诲銉ょ稊閺嶆垳姘﹂幒?*/
    confirmWorktreeHandoff,
  };
}
