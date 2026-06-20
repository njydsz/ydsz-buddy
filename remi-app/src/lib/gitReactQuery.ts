/**
 * @file Git React Query 闆嗘垚妯″潡
 * @description 鎻愪緵 Git 鎿嶄綔鐨?React Query 鏌ヨ鍜屽彉鏇撮厤缃€? *              鍖呭惈鐘舵€佹煡璇€€佸垎鏀垪琛ㄣ€佸伐浣滄爲宸紓銆佹彁浜ゆ搷浣滅瓑銆? */

import type {
  GitReadWorkingTreeDiffInput,
  GitStackedAction,
  ProviderStartOptions,
} from "~/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";
import { buildPatchCacheKey } from "./diffRendering";

/** Git 鐘舵€佹煡璇㈣繃鏈熸椂闂达紙姣锛?*/
const GIT_STATUS_STALE_TIME_MS = 30_000;
/** Git 鐘舵€佹煡璇㈠埛鏂伴棿闅旓紙姣锛?*/
const GIT_STATUS_REFETCH_INTERVAL_MS = 60_000;
/** Git 鍒嗘敮鍒楄〃鏌ヨ杩囨湡鏃堕棿锛堟绉掞級 */
const GIT_BRANCHES_STALE_TIME_MS = 15_000;
/** Git 鍒嗘敮鍒楄〃鏌ヨ鍒锋柊闂撮殧锛堟绉掞級 */
const GIT_BRANCHES_REFETCH_INTERVAL_MS = 60_000;
/** Git 宸紓鎽樿缂撳瓨淇濈暀鏃堕棿锛堟绉掞紝30鍒嗛挓锛?*/
const GIT_DIFF_SUMMARY_GC_TIME_MS = 30 * 60_000;
/** Git 宸ヤ綔鏍戝樊寮傛煡璇㈣繃鏈熸椂闂达紙姣锛?*/
const GIT_WORKING_TREE_DIFF_STALE_TIME_MS = 5_000;
/** Git 宸ヤ綔鏍戝樊寮傚疄鏃跺埛鏂伴棿闅旓紙姣锛?*/
export const GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS = 4_000;

/**
 * Git 鏌ヨ閿伐鍘? * 鐢ㄤ簬鐢熸垚 React Query 鐨勬煡璇㈤敭
 */
export const gitQueryKeys = {
  /** 鎵€鏈?Git 鏌ヨ鐨勬牴閿?*/
  all: ["git"] as const,
  /** Git 鐘舵€佹煡璇㈤敭 */
  status: (cwd: string | null) => ["git", "status", cwd] as const,
  /** Git 鍒嗘敮鍒楄〃鏌ヨ閿?*/
  branches: (cwd: string | null) => ["git", "branches", cwd] as const,
  /** Git 宸ヤ綔鏍戝樊寮傛煡璇㈤敭 */
  workingTreeDiff: (
    cwd: string | null,
    scope: GitReadWorkingTreeDiffInput["scope"] = "workingTree",
  ) => ["git", "working-tree-diff", cwd, scope] as const,
  /** Git 宸紓鎽樿鏌ヨ閿?*/
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
 * Git 鍙樻洿閿伐鍘? * 鐢ㄤ簬鐢熸垚 React Query 鐨勫彉鏇撮敭
 */
export const gitMutationKeys = {
  /** Git 鍒濆鍖栧彉鏇撮敭 */
  init: (cwd: string | null) => ["git", "mutation", "init", cwd] as const,
  /** Git 妫€鍑哄彉鏇撮敭 */
  checkout: (cwd: string | null) => ["git", "mutation", "checkout", cwd] as const,
  /** Git 鍫嗗彔鎿嶄綔鍙樻洿閿?*/
  runStackedAction: (cwd: string | null) => ["git", "mutation", "run-stacked-action", cwd] as const,
  /** Git 鎷夊彇鍙樻洿閿?*/
  pull: (cwd: string | null) => ["git", "mutation", "pull", cwd] as const,
  /** Git 鍑嗗鎷夊彇璇锋眰绾跨▼鍙樻洿閿?*/
  preparePullRequestThread: (cwd: string | null) =>
    ["git", "mutation", "prepare-pull-request-thread", cwd] as const,
  /** Git 绾跨▼浜ゆ帴鍙樻洿閿?*/
  handoffThread: (cwd: string | null) => ["git", "mutation", "handoff-thread", cwd] as const,
};

/**
 * 浣挎墍鏈?Git 鏌ヨ澶辨晥
 * @param queryClient - React Query 瀹㈡埛绔? * @returns 澶辨晥鎿嶄綔鐨?Promise
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
 * 浣挎寚瀹氬伐浣滅洰褰曠殑 Git 鏌ヨ澶辨晥
 * 闄愬畾瀹炴椂鏂囦欢鍙樻洿鐨勫け鏁堣寖鍥达紝閬垮厤褰卞搷涓嶇浉鍏崇殑椤圭洰/宸ヤ綔鏍?Git 缂撳瓨
 * @param queryClient - React Query 瀹㈡埛绔? * @param cwds - 宸ヤ綔鐩綍鍒楄〃
 * @returns 澶辨晥鎿嶄綔鐨?Promise
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
 * Git 鐘舵€佹煡璇㈤€夐」
 * @param cwd - 宸ヤ綔鐩綍
 * @returns React Query 鏌ヨ閫夐」
 */
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
 * Git 鍒嗘敮鍒楄〃鏌ヨ閫夐」
 * @param cwd - 宸ヤ綔鐩綍
 * @returns React Query 鏌ヨ閫夐」
 */
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
 * Git 瑙ｆ瀽鎷夊彇璇锋眰鏌ヨ閫夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.reference - Git 寮曠敤锛堝垎鏀悕銆佹彁浜ゅ搱甯岀瓑锛? * @returns React Query 鏌ヨ閫夐」
 */
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
 * Git 宸ヤ綔鏍戝樊寮傛煡璇㈤€夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.scope - 宸紓鑼冨洿锛岄粯璁や负 "workingTree"
 * @param input.enabled - 鏄惁鍚敤鏌ヨ
 * @param input.refetchInterval - 鍒锋柊闂撮殧
 * @returns React Query 鏌ヨ閫夐」
 */
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
 * Git 宸紓鎽樿鏌ヨ閫夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.cacheScope - 缂撳瓨浣滅敤鍩? * @param input.patch - 琛ヤ竵鏂囨湰
 * @param input.model - 鏂囨湰鐢熸垚妯″瀷
 * @param input.codexHomePath - Codex 涓荤洰褰曡矾寰? * @param input.providerOptions - 鎻愪緵鍟嗛€夐」
 * @param input.enabled - 鏄惁鍚敤鏌ヨ
 * @returns React Query 鏌ヨ閫夐」
 */
export function gitSummarizeDiffQueryOptions(input: {
  cwd: string | null;
  cacheScope?: string | null;
  patch: string | null;
  model?: string | null;
  codexHomePath?: string | null;
  providerOptions?: ProviderStartOptions | null;
  enabled?: boolean;
}) {
  // 鎸夎ˉ涓佸搱甯岀紦瀛樻憳瑕侊紝閬垮厤閲嶆柊鎵撳紑鐩稿悓宸紓鏃堕噸鏂扮敓鎴?  const normalizedPatch = input.patch?.trim() ?? null;
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
 * Git 鍒濆鍖栧彉鏇撮€夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 妫€鍑哄彉鏇撮€夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 杩愯鍫嗗彔鎿嶄綔鍙樻洿閫夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.queryClient - React Query 瀹㈡埛绔? * @param input.model - 鏂囨湰鐢熸垚妯″瀷
 * @param input.codexHomePath - Codex 涓荤洰褰曡矾寰? * @param input.providerOptions - 鎻愪緵鍟嗛€夐」
 * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 鎷夊彇鍙樻洿閫夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 鍒涘缓宸ヤ綔鏍戝彉鏇撮€夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 鍒涘缓鍒嗙宸ヤ綔鏍戝彉鏇撮€夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 绉婚櫎宸ヤ綔鏍戝彉鏇撮€夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 鍑嗗鎷夊彇璇锋眰绾跨▼鍙樻洿閫夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
 * Git 绾跨▼浜ゆ帴鍙樻洿閫夐」
 * @param input - 杈撳叆鍙傛暟
 * @param input.cwd - 宸ヤ綔鐩綍
 * @param input.queryClient - React Query 瀹㈡埛绔? * @returns React Query 鍙樻洿閫夐」
 */
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
