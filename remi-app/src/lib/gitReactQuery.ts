/**
 * @file Git React Query 集成模块
 *
 * 本模块为 Git 操作（状态、提交、推送、PR、Worktree）提供 React Query 封装，
 * 统一前端对 Git 子系统的数据获取、缓存与失效管理。
 *
 * ## 核心导出
 *
 * - `useGitStatus`：订阅 Git 仓库状态
 * - `useGitBranches`：获取分支列表
 * - `useGitCommit`：提交变更（mutation）
 * - `useGitPush`：推送到远程
 * - `useGitCreatePullRequest`：创建 PR
 * - `useGitWorktreeCreate`：创建 worktree
 * - `useGitTextGeneration`：AI 生成提交信息 / PR 描述
 *
 * ## 使用场景
 *
 * - 侧边栏 Git 状态展示
 * - 工具栏的提交/推送按钮
 * - Worktree 切换对话框
 *
 * ## 注意事项
 *
 * - 状态变更会自动失效（`invalidateQueries(['git', 'status'])`）
 * - 错误通过 `QueryClient` 的默认错误处理机制展示
 * - 长时间操作使用 mutation 的 `isPending` 状态
 */

import type {
  GitReadWorkingTreeDiffInput,
  GitStackedAction,
  ProviderStartOptions,
} from "~/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";
import { buildPatchCacheKey } from "./diffRendering";

/** Git 閻樿埖鈧焦鐓＄拠銏ｇ箖閺堢喐妞傞梻杈剧礄濮ｎ偆顫楅敍?*/
const GIT_STATUS_STALE_TIME_MS = 30_000;
/** Git 閻樿埖鈧焦鐓＄拠銏犲煕閺備即妫块梾鏃撶礄濮ｎ偆顫楅敍?*/
const GIT_STATUS_REFETCH_INTERVAL_MS = 60_000;
/** Git 閸掑棙鏁崚妤勩€冮弻銉嚄鏉╁洦婀￠弮鍫曟？閿涘牊顕犵粔鎺炵礆 */
const GIT_BRANCHES_STALE_TIME_MS = 15_000;
/** Git 閸掑棙鏁崚妤勩€冮弻銉嚄閸掗攱鏌婇梻鎾閿涘牊顕犵粔鎺炵礆 */
const GIT_BRANCHES_REFETCH_INTERVAL_MS = 60_000;
/** Git 瀹割喖绱撻幗妯款洣缂傛挸鐡ㄦ穱婵堟殌閺冨爼妫块敍鍫燁嚑缁夋帪绱?0閸掑棝鎸撻敍?*/
const GIT_DIFF_SUMMARY_GC_TIME_MS = 30 * 60_000;
/** Git 瀹搞儰缍旈弽鎴濇▕瀵倹鐓＄拠銏ｇ箖閺堢喐妞傞梻杈剧礄濮ｎ偆顫楅敍?*/
const GIT_WORKING_TREE_DIFF_STALE_TIME_MS = 5_000;
/** Git 瀹搞儰缍旈弽鎴濇▕瀵倸鐤勯弮璺哄煕閺備即妫块梾鏃撶礄濮ｎ偆顫楅敍?*/
export const GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS = 4_000;

/**
 * Git 閺屻儴顕楅柨顔间紣閸? * 閻劋绨悽鐔稿灇 React Query 閻ㄥ嫭鐓＄拠銏ゆ暛
 */
export const gitQueryKeys = {
  /** 閹碘偓閺?Git 閺屻儴顕楅惃鍕壌闁?*/
  all: ["git"] as const,
  /** Git 閻樿埖鈧焦鐓＄拠銏ゆ暛 */
  status: (cwd: string | null) => ["git", "status", cwd] as const,
  /** Git 閸掑棙鏁崚妤勩€冮弻銉嚄闁?*/
  branches: (cwd: string | null) => ["git", "branches", cwd] as const,
  /** Git 瀹搞儰缍旈弽鎴濇▕瀵倹鐓＄拠銏ゆ暛 */
  workingTreeDiff: (
    cwd: string | null,
    scope: GitReadWorkingTreeDiffInput["scope"] = "workingTree",
  ) => ["git", "working-tree-diff", cwd, scope] as const,
  /** Git 瀹割喖绱撻幗妯款洣閺屻儴顕楅柨?*/
  diffSummary: (
    cacheScope: string | null,
    model: string | null,
    codexHomePath: string | null,
    providerOptionsKey: string | null,
    patchKey: string | null,
  ) =>
    [
      "git",
      "diff-summary",
      cacheScope,
      model,
      codexHomePath,
      providerOptionsKey,
      patchKey,
    ] as const,
};

/**
 * Git 閸欐ɑ娲块柨顔间紣閸? * 閻劋绨悽鐔稿灇 React Query 閻ㄥ嫬褰夐弴鎾暛
 */
export const gitMutationKeys = {
  /** Git 閸掓繂顫愰崠鏍у綁閺囨挳鏁?*/
  init: (cwd: string | null) => ["git", "mutation", "init", cwd] as const,
  /** Git 濡偓閸戝搫褰夐弴鎾暛 */
  checkout: (cwd: string | null) => ["git", "mutation", "checkout", cwd] as const,
  /** Git 閸棗褰旈幙宥勭稊閸欐ɑ娲块柨?*/
  runStackedAction: (cwd: string | null) => ["git", "mutation", "run-stacked-action", cwd] as const,
  /** Git 閹峰褰囬崣妯绘纯闁?*/
  pull: (cwd: string | null) => ["git", "mutation", "pull", cwd] as const,
  /** Git 閸戝棗顦幏澶婂絿鐠囬攱鐪扮痪璺ㄢ柤閸欐ɑ娲块柨?*/
  preparePullRequestThread: (cwd: string | null) =>
    ["git", "mutation", "prepare-pull-request-thread", cwd] as const,
  /** Git 缁捐法鈻兼禍銈嗗复閸欐ɑ娲块柨?*/
  handoffThread: (cwd: string | null) => ["git", "mutation", "handoff-thread", cwd] as const,
};

/**
 * 娴ｆ寧澧嶉張?Git 閺屻儴顕楁径杈ㄦ櫏
 * @param queryClient - React Query 鐎广垺鍩涚粩? * @returns 婢惰鲸鏅ラ幙宥勭稊閻?Promise
 */
export function invalidateGitQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["git", "status"] as const }),
    queryClient.invalidateQueries({ queryKey: ["git", "branches"] as const }),
    queryClient.invalidateQueries({ queryKey: ["git", "working-tree-diff"] as const }),
    queryClient.invalidateQueries({ queryKey: ["git", "pull-request"] as const }),
  ]);
}

/**
 * 娴ｆ寧瀵氱€规艾浼愭担婊呮窗瑜版洜娈?Git 閺屻儴顕楁径杈ㄦ櫏
 * 闂勬劕鐣剧€圭偞妞傞弬鍥︽閸欐ɑ娲块惃鍕亼閺佸牐瀵栭崶杈剧礉闁灝鍘よぐ鍗炴惙娑撳秶娴夐崗宕囨畱妞ゅ湱娲?瀹搞儰缍旈弽?Git 缂傛挸鐡? * @param queryClient - React Query 鐎广垺鍩涚粩? * @param cwds - 瀹搞儰缍旈惄顔肩秿閸掓銆? * @returns 婢惰鲸鏅ラ幙宥勭稊閻?Promise
 */
export function invalidateGitQueriesForCwds(queryClient: QueryClient, cwds: Iterable<string>) {
  const uniqueCwds = [...new Set([...cwds].filter((cwd) => cwd.length > 0))];
  return Promise.all(
    uniqueCwds.flatMap((cwd) => [
      queryClient.invalidateQueries({ queryKey: gitQueryKeys.status(cwd) }),
      queryClient.invalidateQueries({ queryKey: gitQueryKeys.branches(cwd) }),
      queryClient.invalidateQueries({ queryKey: ["git", "working-tree-diff", cwd] as const }),
      queryClient.invalidateQueries({ queryKey: ["git", "pull-request", cwd] as const }),
    ]),
  );
}

/**
 * Git 閻樿埖鈧焦鐓＄拠銏も偓澶愩€? * @param cwd - 瀹搞儰缍旈惄顔肩秿
 * @returns React Query 閺屻儴顕楅柅澶愩€? */
export function gitStatusQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.status(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git status is unavailable.");
      return api.git.status({ cwd });
    },
    enabled: cwd !== null,
    staleTime: GIT_STATUS_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
    refetchInterval: GIT_STATUS_REFETCH_INTERVAL_MS,
  });
}

/**
 * Git 閸掑棙鏁崚妤勩€冮弻銉嚄闁銆? * @param cwd - 瀹搞儰缍旈惄顔肩秿
 * @returns React Query 閺屻儴顕楅柅澶愩€? */
export function gitBranchesQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.branches(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git branches are unavailable.");
      return api.git.listBranches({ cwd });
    },
    enabled: cwd !== null,
    staleTime: GIT_BRANCHES_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: GIT_BRANCHES_REFETCH_INTERVAL_MS,
  });
}

/**
 * Git 鐟欙絾鐎介幏澶婂絿鐠囬攱鐪伴弻銉嚄闁銆? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.reference - Git 瀵洜鏁ら敍鍫濆瀻閺€顖氭倳閵嗕焦褰佹禍銈呮惐鐢瞼鐡戦敍? * @returns React Query 閺屻儴顕楅柅澶愩€? */
export function gitResolvePullRequestQueryOptions(input: {
  cwd: string | null;
  reference: string | null;
}) {
  return queryOptions({
    queryKey: ["git", "pull-request", input.cwd, input.reference] as const,
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd || !input.reference) {
        throw new Error("Pull request lookup is unavailable.");
      }
      return api.git.resolvePullRequest({ cwd: input.cwd, reference: input.reference });
    },
    enabled: input.cwd !== null && input.reference !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Git 瀹搞儰缍旈弽鎴濇▕瀵倹鐓＄拠銏も偓澶愩€? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.scope - 瀹割喖绱撻懠鍐ㄦ纯閿涘矂绮拋銈勮礋 "workingTree"
 * @param input.enabled - 閺勵垰鎯侀崥顖滄暏閺屻儴顕? * @param input.refetchInterval - 閸掗攱鏌婇梻鎾
 * @returns React Query 閺屻儴顕楅柅澶愩€? */
export function gitWorkingTreeDiffQueryOptions(input: {
  cwd: string | null;
  scope?: GitReadWorkingTreeDiffInput["scope"];
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  const scope = input.scope ?? "workingTree";
  const refetchInterval = input.refetchInterval;
  return queryOptions({
    queryKey: gitQueryKeys.workingTreeDiff(input.cwd, scope),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Working tree diff is unavailable.");
      }
      return api.git.readWorkingTreeDiff({ cwd: input.cwd, scope });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: GIT_WORKING_TREE_DIFF_STALE_TIME_MS,
    ...(refetchInterval !== undefined ? { refetchInterval } : {}),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * Git 瀹割喖绱撻幗妯款洣閺屻儴顕楅柅澶愩€? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.cacheScope - 缂傛挸鐡ㄦ担婊呮暏閸? * @param input.patch - 鐞涖儰绔甸弬鍥ㄦ拱
 * @param input.model - 閺傚洦婀伴悽鐔稿灇濡€崇€? * @param input.codexHomePath - Codex 娑撹崵娲拌ぐ鏇＄熅瀵? * @param input.providerOptions - 閹绘劒绶甸崯鍡涒偓澶愩€? * @param input.enabled - 閺勵垰鎯侀崥顖滄暏閺屻儴顕? * @returns React Query 閺屻儴顕楅柅澶愩€? */
export function gitSummarizeDiffQueryOptions(input: {
  cwd: string | null;
  cacheScope?: string | null;
  patch: string | null;
  model?: string | null;
  codexHomePath?: string | null;
  providerOptions?: ProviderStartOptions | null;
  enabled?: boolean;
}) {
  // Normalize the patch input to a trimmed string or null when empty/missing.
  const normalizedPatch = input.patch?.trim() ?? null;
  const patchKey =
    normalizedPatch && normalizedPatch.length > 0
      ? buildPatchCacheKey(normalizedPatch, "git-diff-summary")
      : null;

  const providerOptionsKey = input.providerOptions ? JSON.stringify(input.providerOptions) : null;

  return queryOptions({
    queryKey: gitQueryKeys.diffSummary(
      input.cacheScope ?? input.cwd,
      input.model ?? null,
      input.codexHomePath ?? null,
      providerOptionsKey,
      patchKey,
    ),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd || !normalizedPatch) {
        throw new Error("Diff summary is unavailable.");
      }
      return api.git.summarizeDiff({
        cwd: input.cwd,
        patch: normalizedPatch,
        ...(input.codexHomePath ? { codexHomePath: input.codexHomePath } : {}),
        ...(input.model ? { textGenerationModel: input.model } : {}),
        ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.cwd !== null &&
      normalizedPatch !== null &&
      normalizedPatch.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: GIT_DIFF_SUMMARY_GC_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Git 閸掓繂顫愰崠鏍у綁閺囨挳鈧銆? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitInitMutationOptions(input: { cwd: string | null; queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: gitMutationKeys.init(input.cwd),
    mutationFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git init is unavailable.");
      return api.git.init({ cwd: input.cwd });
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 濡偓閸戝搫褰夐弴鎾偓澶愩€? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitCheckoutMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.checkout(input.cwd),
    mutationFn: async (branch: string) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git checkout is unavailable.");
      return api.git.checkout({ cwd: input.cwd, branch });
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 鏉╂劘顢戦崼鍡楀綌閹垮秳缍旈崣妯绘纯闁銆? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @param input.model - 閺傚洦婀伴悽鐔稿灇濡€崇€? * @param input.codexHomePath - Codex 娑撹崵娲拌ぐ鏇＄熅瀵? * @param input.providerOptions - 閹绘劒绶甸崯鍡涒偓澶愩€? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitRunStackedActionMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
  model?: string | null;
  codexHomePath?: string | null;
  providerOptions?: ProviderStartOptions | null;
}) {
  return mutationOptions({
    mutationKey: gitMutationKeys.runStackedAction(input.cwd),
    mutationFn: async ({
      actionId,
      action,
      commitMessage,
      featureBranch,
      filePaths,
    }: {
      actionId: string;
      action: GitStackedAction;
      commitMessage?: string;
      featureBranch?: boolean;
      filePaths?: string[];
    }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git action is unavailable.");
      return api.git.runStackedAction({
        actionId,
        cwd: input.cwd,
        action,
        ...(commitMessage ? { commitMessage } : {}),
        ...(featureBranch ? { featureBranch } : {}),
        ...(filePaths ? { filePaths } : {}),
        ...(input.codexHomePath ? { codexHomePath: input.codexHomePath } : {}),
        ...(input.model ? { textGenerationModel: input.model } : {}),
        ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
      });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 閹峰褰囬崣妯绘纯闁銆? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitPullMutationOptions(input: { cwd: string | null; queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: gitMutationKeys.pull(input.cwd),
    mutationFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git pull is unavailable.");
      return api.git.pull({ cwd: input.cwd });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 閸掓稑缂撳銉ょ稊閺嶆垵褰夐弴鎾偓澶愩€? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitCreateWorktreeMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationFn: async ({
      cwd,
      branch,
      newBranch,
      path,
    }: {
      cwd: string;
      branch: string;
      newBranch: string;
      path?: string | null;
    }) => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git worktree creation is unavailable.");
      return api.git.createWorktree({ cwd, branch, newBranch, path: path ?? null });
    },
    mutationKey: ["git", "mutation", "create-worktree"] as const,
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 閸掓稑缂撻崚鍡欘瀲瀹搞儰缍旈弽鎴濆綁閺囨挳鈧銆? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitCreateDetachedWorktreeMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationFn: async ({ cwd, ref, path }: { cwd: string; ref: string; path?: string | null }) => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git worktree creation is unavailable.");
      return api.git.createDetachedWorktree({ cwd, ref, path: path ?? null });
    },
    mutationKey: ["git", "mutation", "create-detached-worktree"] as const,
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 缁夊娅庡銉ょ稊閺嶆垵褰夐弴鎾偓澶愩€? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitRemoveWorktreeMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationFn: async ({ cwd, path, force }: { cwd: string; path: string; force?: boolean }) => {
      const api = ensureNativeApi();
      if (!cwd) throw new Error("Git worktree removal is unavailable.");
      return api.git.removeWorktree({ cwd, path, force });
    },
    mutationKey: ["git", "mutation", "remove-worktree"] as const,
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 閸戝棗顦幏澶婂絿鐠囬攱鐪扮痪璺ㄢ柤閸欐ɑ娲块柅澶愩€? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitPreparePullRequestThreadMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({ reference, mode }: { reference: string; mode: "local" | "worktree" }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Pull request thread preparation is unavailable.");
      return api.git.preparePullRequestThread({
        cwd: input.cwd,
        reference,
        mode,
      });
    },
    mutationKey: gitMutationKeys.preparePullRequestThread(input.cwd),
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

/**
 * Git 缁捐法鈻兼禍銈嗗复閸欐ɑ娲块柅澶愩€? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.cwd - 瀹搞儰缍旈惄顔肩秿
 * @param input.queryClient - React Query 鐎广垺鍩涚粩? * @returns React Query 閸欐ɑ娲块柅澶愩€? */
export function gitHandoffThreadMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (request: {
      targetMode: "local" | "worktree";
      currentBranch: string | null;
      worktreePath: string | null;
      associatedWorktreePath: string | null;
      associatedWorktreeBranch: string | null;
      associatedWorktreeRef: string | null;
      preferredLocalBranch: string | null;
      preferredWorktreeBaseBranch: string | null;
      preferredNewWorktreeName: string | null;
    }) => {
      const api = ensureNativeApi();
      if (!input.cwd) throw new Error("Git handoff is unavailable.");
      return api.git.handoffThread({
        cwd: input.cwd,
        ...request,
      });
    },
    mutationKey: gitMutationKeys.handoffThread(input.cwd),
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}
