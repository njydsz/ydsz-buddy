/**
 * @file Git React Query 集成模块
 * @description 提供 Git 操作�?React Query 查询和变更配置�? *              包含状态查询、分支列表、工作树差异、提交操作等�? */

import type {
  GitReadWorkingTreeDiffInput,
  GitStackedAction,
  ProviderStartOptions,
} from "~/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";
import { buildPatchCacheKey } from "./diffRendering";

/** Git 状态查询过期时间（毫秒�?*/
const GIT_STATUS_STALE_TIME_MS = 30_000;
/** Git 状态查询刷新间隔（毫秒�?*/
const GIT_STATUS_REFETCH_INTERVAL_MS = 60_000;
/** Git 分支列表查询过期时间（毫秒） */
const GIT_BRANCHES_STALE_TIME_MS = 15_000;
/** Git 分支列表查询刷新间隔（毫秒） */
const GIT_BRANCHES_REFETCH_INTERVAL_MS = 60_000;
/** Git 差异摘要缓存保留时间（毫秒，30分钟�?*/
const GIT_DIFF_SUMMARY_GC_TIME_MS = 30 * 60_000;
/** Git 工作树差异查询过期时间（毫秒�?*/
const GIT_WORKING_TREE_DIFF_STALE_TIME_MS = 5_000;
/** Git 工作树差异实时刷新间隔（毫秒�?*/
export const GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS = 4_000;

/**
 * Git 查询键工�? * 用于生成 React Query 的查询键
 */
export const gitQueryKeys = {
  /** 所�?Git 查询的根�?*/
  all: ["git"] as const,
  /** Git 状态查询键 */
  status: (cwd: string | null) => ["git", "status", cwd] as const,
  /** Git 分支列表查询�?*/
  branches: (cwd: string | null) => ["git", "branches", cwd] as const,
  /** Git 工作树差异查询键 */
  workingTreeDiff: (
    cwd: string | null,
    scope: GitReadWorkingTreeDiffInput["scope"] = "workingTree",
  ) => ["git", "working-tree-diff", cwd, scope] as const,
  /** Git 差异摘要查询�?*/
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
 * Git 变更键工�? * 用于生成 React Query 的变更键
 */
export const gitMutationKeys = {
  /** Git 初始化变更键 */
  init: (cwd: string | null) => ["git", "mutation", "init", cwd] as const,
  /** Git 检出变更键 */
  checkout: (cwd: string | null) => ["git", "mutation", "checkout", cwd] as const,
  /** Git 堆叠操作变更�?*/
  runStackedAction: (cwd: string | null) => ["git", "mutation", "run-stacked-action", cwd] as const,
  /** Git 拉取变更�?*/
  pull: (cwd: string | null) => ["git", "mutation", "pull", cwd] as const,
  /** Git 准备拉取请求线程变更�?*/
  preparePullRequestThread: (cwd: string | null) =>
    ["git", "mutation", "prepare-pull-request-thread", cwd] as const,
  /** Git 线程交接变更�?*/
  handoffThread: (cwd: string | null) => ["git", "mutation", "handoff-thread", cwd] as const,
};

/**
 * 使所�?Git 查询失效
 * @param queryClient - React Query 客户�? * @returns 失效操作�?Promise
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
 * 使指定工作目录的 Git 查询失效
 * 限定实时文件变更的失效范围，避免影响不相关的项目/工作�?Git 缓存
 * @param queryClient - React Query 客户�? * @param cwds - 工作目录列表
 * @returns 失效操作�?Promise
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
 * Git 状态查询选项
 * @param cwd - 工作目录
 * @returns React Query 查询选项
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
 * Git 分支列表查询选项
 * @param cwd - 工作目录
 * @returns React Query 查询选项
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
 * Git 解析拉取请求查询选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.reference - Git 引用（分支名、提交哈希等�? * @returns React Query 查询选项
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
 * Git 工作树差异查询选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.scope - 差异范围，默认为 "workingTree"
 * @param input.enabled - 是否启用查询
 * @param input.refetchInterval - 刷新间隔
 * @returns React Query 查询选项
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
 * Git 差异摘要查询选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.cacheScope - 缓存作用�? * @param input.patch - 补丁文本
 * @param input.model - 文本生成模型
 * @param input.codexHomePath - Codex 主目录路�? * @param input.providerOptions - 提供商选项
 * @param input.enabled - 是否启用查询
 * @returns React Query 查询选项
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
  // 按补丁哈希缓存摘要，避免重新打开相同差异时重新生�?  const normalizedPatch = input.patch?.trim() ?? null;
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
 * Git 初始化变更选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
 * Git 检出变更选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
 * Git 运行堆叠操作变更选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.queryClient - React Query 客户�? * @param input.model - 文本生成模型
 * @param input.codexHomePath - Codex 主目录路�? * @param input.providerOptions - 提供商选项
 * @returns React Query 变更选项
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
 * Git 拉取变更选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
 * Git 创建工作树变更选项
 * @param input - 输入参数
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
 * Git 创建分离工作树变更选项
 * @param input - 输入参数
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
 * Git 移除工作树变更选项
 * @param input - 输入参数
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
 * Git 准备拉取请求线程变更选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
 * Git 线程交接变更选项
 * @param input - 输入参数
 * @param input.cwd - 工作目录
 * @param input.queryClient - React Query 客户�? * @returns React Query 变更选项
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
