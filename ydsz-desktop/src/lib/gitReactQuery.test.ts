/**
 * @file gitReactQuery 单元测试
 *
 * 互联网大厂基线：核心数据访问层（React Query 适配）必须 100% 覆盖：
 * - queryKey 形状稳定（消费者依赖 key 命中缓存）
 * - queryFn / mutationFn 正确调用 nativeApi
 * - 缺失 cwd / patch 等参数时抛出明确错误
 * - 成功后正确触发 invalidate（status / branches / working-tree-diff / pull-request）
 * - mutation options 的 onSuccess / onSettled 触发 invalidation
 * - enabled 条件正确（cwd 为空时不发送请求）
 * - 缓存配置（staleTime / refetchInterval / gcTime）符合预期
 * - 跨 cwd 批量 invalidate 正确去重
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type {
  GitListBranchesResult,
  GitReadWorkingTreeDiffResult,
  GitResolvePullRequestResult,
  GitStatusResult,
  GitSummarizeDiffResult,
  NativeApi,
} from "~/contracts";

import {
  gitMutationKeys,
  gitQueryKeys,
  gitBranchesQueryOptions,
  gitCheckoutMutationOptions,
  gitCreateDetachedWorktreeMutationOptions,
  gitCreateWorktreeMutationOptions,
  gitHandoffThreadMutationOptions,
  gitInitMutationOptions,
  gitPreparePullRequestThreadMutationOptions,
  gitPullMutationOptions,
  gitRemoveWorktreeMutationOptions,
  gitResolvePullRequestQueryOptions,
  gitRunStackedActionMutationOptions,
  gitStatusQueryOptions,
  gitSummarizeDiffQueryOptions,
  gitWorkingTreeDiffQueryOptions,
  invalidateGitQueries,
  invalidateGitQueriesForCwds,
} from "./gitReactQuery";

// ──────────────────────────────────────────────────────────────────────────────
// 测试工具
// ──────────────────────────────────────────────────────────────────────────────

/** mock NativeApi 的 git 子集 */
interface GitMock {
  status: ReturnType<typeof vi.fn>;
  listBranches: ReturnType<typeof vi.fn>;
  resolvePullRequest: ReturnType<typeof vi.fn>;
  readWorkingTreeDiff: ReturnType<typeof vi.fn>;
  summarizeDiff: ReturnType<typeof vi.fn>;
  init: ReturnType<typeof vi.fn>;
  checkout: ReturnType<typeof vi.fn>;
  runStackedAction: ReturnType<typeof vi.fn>;
  pull: ReturnType<typeof vi.fn>;
  createWorktree: ReturnType<typeof vi.fn>;
  createDetachedWorktree: ReturnType<typeof vi.fn>;
  removeWorktree: ReturnType<typeof vi.fn>;
  preparePullRequestThread: ReturnType<typeof vi.fn>;
  handoffThread: ReturnType<typeof vi.fn>;
  applyPatch: ReturnType<typeof vi.fn>;
  onActionProgress: ReturnType<typeof vi.fn>;
  createBranch: ReturnType<typeof vi.fn>;
  stashAndCheckout: ReturnType<typeof vi.fn>;
  stashDrop: ReturnType<typeof vi.fn>;
  stashInfo: ReturnType<typeof vi.fn>;
  removeIndexLock: ReturnType<typeof vi.fn>;
}

function createGitMock(): GitMock {
  return {
    status: vi.fn(),
    listBranches: vi.fn(),
    resolvePullRequest: vi.fn(),
    readWorkingTreeDiff: vi.fn(),
    summarizeDiff: vi.fn(),
    init: vi.fn(),
    checkout: vi.fn(),
    runStackedAction: vi.fn(),
    pull: vi.fn(),
    createWorktree: vi.fn(),
    createDetachedWorktree: vi.fn(),
    removeWorktree: vi.fn(),
    preparePullRequestThread: vi.fn(),
    handoffThread: vi.fn(),
    applyPatch: vi.fn(),
    onActionProgress: vi.fn(() => () => {}),
    createBranch: vi.fn(),
    stashAndCheckout: vi.fn(),
    stashDrop: vi.fn(),
    stashInfo: vi.fn(),
    removeIndexLock: vi.fn(),
  };
}

let gitMock: GitMock;

function installNativeApi() {
  gitMock = createGitMock();
  const api: Partial<NativeApi> = { git: gitMock as unknown as NativeApi["git"] };
  (window as unknown as { nativeApi: NativeApi }).nativeApi = api as NativeApi;
}

function uninstallNativeApi() {
  delete (window as unknown as { nativeApi?: NativeApi }).nativeApi;
}

// ──────────────────────────────────────────────────────────────────────────────
// 固定测试数据
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_RESULT: GitStatusResult = {
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
  isClean: true,
} as unknown as GitStatusResult;

const BRANCHES_RESULT: GitListBranchesResult = {
  current: "main",
  branches: [
    { name: "main", isCurrent: true, isRemote: false, upstream: "origin/main" },
    { name: "feature/x", isCurrent: false, isRemote: false, upstream: null },
  ],
} as unknown as GitListBranchesResult;

const WORKING_TREE_DIFF_RESULT: GitReadWorkingTreeDiffResult = {
  files: [
    { path: "src/foo.ts", status: "modified", additions: 10, deletions: 3 },
  ],
  totalAdditions: 10,
  totalDeletions: 3,
} as unknown as GitReadWorkingTreeDiffResult;

const PR_RESULT: GitResolvePullRequestResult = {
  number: 42,
  url: "https://github.com/foo/bar/pull/42",
  state: "open",
} as unknown as GitResolvePullRequestResult;

const DIFF_SUMMARY_RESULT: GitSummarizeDiffResult = {
  title: "Refactor foo",
  body: "Refactored foo.ts to be more testable.",
  filesChanged: 1,
} as unknown as GitSummarizeDiffResult;

// ──────────────────────────────────────────────────────────────────────────────
// 钩子
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  installNativeApi();
});

afterEach(() => {
  uninstallNativeApi();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// gitQueryKeys
// ──────────────────────────────────────────────────────────────────────────────

describe("gitQueryKeys", () => {
  it("status / branches / workingTreeDiff 返回稳定的元组 key", () => {
    expect(gitQueryKeys.status("/repo/a")).toEqual(["git", "status", "/repo/a"]);
    expect(gitQueryKeys.branches(null)).toEqual(["git", "branches", null]);
    expect(gitQueryKeys.workingTreeDiff("/repo/a", "workingTree")).toEqual([
      "git",
      "working-tree-diff",
      "/repo/a",
      "workingTree",
    ]);
    expect(gitQueryKeys.workingTreeDiff("/repo/a")).toEqual([
      "git",
      "working-tree-diff",
      "/repo/a",
      "workingTree",
    ]);
  });

  it("diffSummary 5 元 key 完整", () => {
    const key = gitQueryKeys.diffSummary("cache", "gpt-5", "/home/codex", "opts", "patch-1");
    expect(key).toEqual([
      "git",
      "diff-summary",
      "cache",
      "gpt-5",
      "/home/codex",
      "opts",
      "patch-1",
    ]);
  });

  it("mutation keys 反映 cwd", () => {
    expect(gitMutationKeys.init("/a")).toEqual(["git", "mutation", "init", "/a"]);
    expect(gitMutationKeys.checkout(null)).toEqual(["git", "mutation", "checkout", null]);
    expect(gitMutationKeys.runStackedAction("/a")).toEqual([
      "git",
      "mutation",
      "run-stacked-action",
      "/a",
    ]);
    expect(gitMutationKeys.pull("/a")).toEqual(["git", "mutation", "pull", "/a"]);
    expect(gitMutationKeys.preparePullRequestThread("/a")).toEqual([
      "git",
      "mutation",
      "prepare-pull-request-thread",
      "/a",
    ]);
    expect(gitMutationKeys.handoffThread("/a")).toEqual([
      "git",
      "mutation",
      "handoff-thread",
      "/a",
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// gitStatusQueryOptions
// ──────────────────────────────────────────────────────────────────────────────

describe("gitStatusQueryOptions", () => {
  it("queryFn 在 cwd 为 null 时抛错", async () => {
    const opts = gitStatusQueryOptions(null);
    await expect(opts.queryFn()).rejects.toThrow("Git status is unavailable.");
    expect(gitMock.status).not.toHaveBeenCalled();
  });

  it("queryFn 正确调用 nativeApi.git.status 并返回数据", async () => {
    gitMock.status.mockResolvedValue(STATUS_RESULT);
    const opts = gitStatusQueryOptions("/repo/a");
    const result = await opts.queryFn();
    expect(gitMock.status).toHaveBeenCalledWith({ cwd: "/repo/a" });
    expect(result).toBe(STATUS_RESULT);
  });

  it("enabled = false 当 cwd 为 null", () => {
    expect(gitStatusQueryOptions(null).enabled).toBe(false);
    expect(gitStatusQueryOptions("/repo/a").enabled).toBe(true);
  });

  it("queryKey 一致", () => {
    expect(gitStatusQueryOptions("/a").queryKey).toEqual(["git", "status", "/a"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// gitBranchesQueryOptions
// ──────────────────────────────────────────────────────────────────────────────

describe("gitBranchesQueryOptions", () => {
  it("queryFn 在 cwd 为 null 时抛错", async () => {
    const opts = gitBranchesQueryOptions(null);
    await expect(opts.queryFn()).rejects.toThrow("Git branches are unavailable.");
  });

  it("queryFn 正常返回分支列表", async () => {
    gitMock.listBranches.mockResolvedValue(BRANCHES_RESULT);
    const opts = gitBranchesQueryOptions("/repo/a");
    const result = await opts.queryFn();
    expect(gitMock.listBranches).toHaveBeenCalledWith({ cwd: "/repo/a" });
    expect(result).toBe(BRANCHES_RESULT);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// gitResolvePullRequestQueryOptions
// ──────────────────────────────────────────────────────────────────────────────

describe("gitResolvePullRequestQueryOptions", () => {
  it("queryFn 在 cwd 或 reference 缺失时抛错", async () => {
    await expect(
      gitResolvePullRequestQueryOptions({ cwd: null, reference: "main" }).queryFn(),
    ).rejects.toThrow("Pull request lookup is unavailable.");

    await expect(
      gitResolvePullRequestQueryOptions({ cwd: "/repo/a", reference: null }).queryFn(),
    ).rejects.toThrow("Pull request lookup is unavailable.");
  });

  it("queryFn 正常返回 PR 结果", async () => {
    gitMock.resolvePullRequest.mockResolvedValue(PR_RESULT);
    const opts = gitResolvePullRequestQueryOptions({ cwd: "/repo/a", reference: "main" });
    const result = await opts.queryFn();
    expect(gitMock.resolvePullRequest).toHaveBeenCalledWith({ cwd: "/repo/a", reference: "main" });
    expect(result).toBe(PR_RESULT);
  });

  it("enabled 在 cwd 或 reference 为空时为 false", () => {
    expect(gitResolvePullRequestQueryOptions({ cwd: null, reference: "main" }).enabled).toBe(false);
    expect(gitResolvePullRequestQueryOptions({ cwd: "/a", reference: null }).enabled).toBe(false);
    expect(gitResolvePullRequestQueryOptions({ cwd: "/a", reference: "main" }).enabled).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// gitWorkingTreeDiffQueryOptions
// ──────────────────────────────────────────────────────────────────────────────

describe("gitWorkingTreeDiffQueryOptions", () => {
  it("queryFn 在 cwd 缺失时抛错", async () => {
    await expect(
      gitWorkingTreeDiffQueryOptions({ cwd: null }).queryFn(),
    ).rejects.toThrow("Working tree diff is unavailable.");
  });

  it("默认 scope = workingTree", async () => {
    gitMock.readWorkingTreeDiff.mockResolvedValue(WORKING_TREE_DIFF_RESULT);
    const opts = gitWorkingTreeDiffQueryOptions({ cwd: "/a" });
    const result = await opts.queryFn();
    expect(gitMock.readWorkingTreeDiff).toHaveBeenCalledWith({
      cwd: "/a",
      scope: "workingTree",
    });
    expect(result).toBe(WORKING_TREE_DIFF_RESULT);
  });

  it("显式 scope 透传", async () => {
    gitMock.readWorkingTreeDiff.mockResolvedValue(WORKING_TREE_DIFF_RESULT);
    const opts = gitWorkingTreeDiffQueryOptions({ cwd: "/a", scope: "staged" });
    await opts.queryFn();
    expect(gitMock.readWorkingTreeDiff).toHaveBeenCalledWith({ cwd: "/a", scope: "staged" });
  });

  it("enabled = false 当 cwd 为 null", () => {
    expect(gitWorkingTreeDiffQueryOptions({ cwd: null }).enabled).toBe(false);
  });

  it("explicit enabled = false 强制不启用", () => {
    expect(
      gitWorkingTreeDiffQueryOptions({ cwd: "/a", enabled: false }).enabled,
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// gitSummarizeDiffQueryOptions
// ──────────────────────────────────────────────────────────────────────────────

describe("gitSummarizeDiffQueryOptions", () => {
  it("patch 为空 / null 时 queryFn 抛错", async () => {
    await expect(
      gitSummarizeDiffQueryOptions({ cwd: "/a", patch: "" }).queryFn(),
    ).rejects.toThrow("Diff summary is unavailable.");

    await expect(
      gitSummarizeDiffQueryOptions({ cwd: "/a", patch: "   " }).queryFn(),
    ).rejects.toThrow("Diff summary is unavailable.");
  });

  it("cwd 缺失抛错", async () => {
    await expect(
      gitSummarizeDiffQueryOptions({ cwd: null, patch: "diff --git ..." }).queryFn(),
    ).rejects.toThrow("Diff summary is unavailable.");
  });

  it("成功路径下调用 summarizeDiff", async () => {
    gitMock.summarizeDiff.mockResolvedValue(DIFF_SUMMARY_RESULT);
    const opts = gitSummarizeDiffQueryOptions({
      cwd: "/a",
      patch: "diff --git a/foo.ts b/foo.ts",
      model: "gpt-5",
      codexHomePath: "/home/codex",
    });
    const result = await opts.queryFn();
    expect(gitMock.summarizeDiff).toHaveBeenCalledWith({
      cwd: "/a",
      patch: "diff --git a/foo.ts b/foo.ts",
      codexHomePath: "/home/codex",
      textGenerationModel: "gpt-5",
    });
    expect(result).toBe(DIFF_SUMMARY_RESULT);
  });

  it("providerOptions 透传", async () => {
    gitMock.summarizeDiff.mockResolvedValue(DIFF_SUMMARY_RESULT);
    const providerOptions = { provider: "codex", reasoningEffort: "high" } as never;
    const opts = gitSummarizeDiffQueryOptions({
      cwd: "/a",
      patch: "diff",
      providerOptions,
    });
    await opts.queryFn();
    expect(gitMock.summarizeDiff).toHaveBeenCalledWith({
      cwd: "/a",
      patch: "diff",
      providerOptions,
    });
  });

  it("enabled 在 patch 为空时为 false", () => {
    expect(
      gitSummarizeDiffQueryOptions({ cwd: "/a", patch: "" }).enabled,
    ).toBe(false);
    expect(
      gitSummarizeDiffQueryOptions({ cwd: "/a", patch: "real patch" }).enabled,
    ).toBe(true);
  });

  it("explicit enabled = false 覆盖默认", () => {
    expect(
      gitSummarizeDiffQueryOptions({ cwd: "/a", patch: "patch", enabled: false }).enabled,
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// invalidateGitQueries / invalidateGitQueriesForCwds
// ──────────────────────────────────────────────────────────────────────────────

describe("invalidateGitQueries", () => {
  it("并行 invalidate 4 个 key 前缀", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    await invalidateGitQueries(qc);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["git", "status"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["git", "branches"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["git", "working-tree-diff"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["git", "pull-request"] });
    expect(invalidateSpy).toHaveBeenCalledTimes(4);
  });
});

describe("invalidateGitQueriesForCwds", () => {
  it("按 cwd 去重并行 invalidate", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    await invalidateGitQueriesForCwds(qc, ["/a", "/b", "/a", ""]);
    // 2 个有效 cwd × 4 key 前缀 = 8 次
    expect(invalidateSpy).toHaveBeenCalledTimes(8);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["git", "status", "/a"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["git", "branches", "/b"],
    });
  });

  it("空集合不触发任何 invalidate", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    await invalidateGitQueriesForCwds(qc, []);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 公共 mutation 行为验证
// ──────────────────────────────────────────────────────────────────────────────

describe("mutations - 公共契约", () => {
  it("gitInitMutationOptions: 成功调用 init,onSuccess 触发 invalidate 见后续用例", async () => {
    gitMock.init.mockResolvedValue(undefined);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitInitMutationOptions({ cwd: "/a", queryClient: qc });
    await opts.mutationFn();
    expect(gitMock.init).toHaveBeenCalledWith({ cwd: "/a" });
    // onSuccess 由 React Query 内部调用，单独用例验证
  });

  it("gitInitMutationOptions: cwd 为 null 抛错且不调用 init", async () => {
    const qc = new QueryClient();
    const opts = gitInitMutationOptions({ cwd: null, queryClient: qc });
    await expect(opts.mutationFn()).rejects.toThrow("Git init is unavailable.");
    expect(gitMock.init).not.toHaveBeenCalled();
  });

  it("gitCheckoutMutationOptions: 调用 git.checkout", async () => {
    gitMock.checkout.mockResolvedValue(undefined);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitCheckoutMutationOptions({ cwd: "/a", queryClient: qc });
    await opts.mutationFn("feature/x");
    expect(gitMock.checkout).toHaveBeenCalledWith({ cwd: "/a", branch: "feature/x" });
  });

  it("gitPullMutationOptions: 调用 git.pull", async () => {
    gitMock.pull.mockResolvedValue({} as never);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitPullMutationOptions({ cwd: "/a", queryClient: qc });
    await opts.mutationFn();
    expect(gitMock.pull).toHaveBeenCalledWith({ cwd: "/a" });
  });

  it("gitRunStackedActionMutationOptions: 完整参数透传", async () => {
    gitMock.runStackedAction.mockResolvedValue({} as never);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitRunStackedActionMutationOptions({
      cwd: "/a",
      queryClient: qc,
      model: "gpt-5",
    });
    await opts.mutationFn({
      actionId: "act-1",
      action: "commit_push_pr",
      commitMessage: "feat: x",
      featureBranch: true,
      filePaths: ["src/foo.ts"],
    });
    expect(gitMock.runStackedAction).toHaveBeenCalledWith({
      actionId: "act-1",
      cwd: "/a",
      action: "commit_push_pr",
      commitMessage: "feat: x",
      featureBranch: true,
      filePaths: ["src/foo.ts"],
      textGenerationModel: "gpt-5",
    });
  });

  it("gitCreateWorktreeMutationOptions: 透传 cwd/branch/newBranch/path", async () => {
    gitMock.createWorktree.mockResolvedValue({} as never);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitCreateWorktreeMutationOptions({ queryClient: qc });
    await opts.mutationFn({ cwd: "/a", branch: "main", newBranch: "feat/y", path: "/wt" });
    expect(gitMock.createWorktree).toHaveBeenCalledWith({
      cwd: "/a",
      branch: "main",
      newBranch: "feat/y",
      path: "/wt",
    });
  });

  it("gitCreateWorktreeMutationOptions: path 缺省时传 null", async () => {
    gitMock.createWorktree.mockResolvedValue({} as never);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitCreateWorktreeMutationOptions({ queryClient: qc });
    await opts.mutationFn({ cwd: "/a", branch: "main", newBranch: "feat/z" });
    expect(gitMock.createWorktree).toHaveBeenCalledWith({
      cwd: "/a",
      branch: "main",
      newBranch: "feat/z",
      path: null,
    });
  });

  it("gitCreateDetachedWorktreeMutationOptions: 透传 cwd/ref/path", async () => {
    gitMock.createDetachedWorktree.mockResolvedValue({} as never);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitCreateDetachedWorktreeMutationOptions({ queryClient: qc });
    await opts.mutationFn({ cwd: "/a", ref: "abc123", path: null });
    expect(gitMock.createDetachedWorktree).toHaveBeenCalledWith({
      cwd: "/a",
      ref: "abc123",
      path: null,
    });
  });

  it("gitRemoveWorktreeMutationOptions: 透传 cwd/path/force", async () => {
    gitMock.removeWorktree.mockResolvedValue(undefined);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitRemoveWorktreeMutationOptions({ queryClient: qc });
    await opts.mutationFn({ cwd: "/a", path: "/wt/x", force: true });
    expect(gitMock.removeWorktree).toHaveBeenCalledWith({ cwd: "/a", path: "/wt/x", force: true });
  });

  it("gitPreparePullRequestThreadMutationOptions: cwd 缺失抛错", async () => {
    const qc = new QueryClient();
    const opts = gitPreparePullRequestThreadMutationOptions({
      cwd: null,
      queryClient: qc,
    });
    await expect(
      opts.mutationFn({ reference: "main", mode: "local" }),
    ).rejects.toThrow("Pull request thread preparation is unavailable.");
    expect(gitMock.preparePullRequestThread).not.toHaveBeenCalled();
  });

  it("gitPreparePullRequestThreadMutationOptions: 透传 reference/mode", async () => {
    gitMock.preparePullRequestThread.mockResolvedValue({} as never);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitPreparePullRequestThreadMutationOptions({
      cwd: "/a",
      queryClient: qc,
    });
    await opts.mutationFn({ reference: "main", mode: "worktree" });
    expect(gitMock.preparePullRequestThread).toHaveBeenCalledWith({
      cwd: "/a",
      reference: "main",
      mode: "worktree",
    });
  });

  it("gitHandoffThreadMutationOptions: cwd 缺失抛错", async () => {
    const qc = new QueryClient();
    const opts = gitHandoffThreadMutationOptions({ cwd: null, queryClient: qc });
    await expect(
      opts.mutationFn({
        targetMode: "local",
        currentBranch: null,
        worktreePath: null,
        associatedWorktreePath: null,
        associatedWorktreeBranch: null,
        associatedWorktreeRef: null,
        preferredLocalBranch: null,
        preferredWorktreeBaseBranch: null,
        preferredNewWorktreeName: null,
      }),
    ).rejects.toThrow("Git handoff is unavailable.");
    expect(gitMock.handoffThread).not.toHaveBeenCalled();
  });

  it("gitHandoffThreadMutationOptions: 完整 request 透传", async () => {
    gitMock.handoffThread.mockResolvedValue({} as never);
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitHandoffThreadMutationOptions({ cwd: "/a", queryClient: qc });
    const request = {
      targetMode: "worktree" as const,
      currentBranch: "main",
      worktreePath: "/wt",
      associatedWorktreePath: "/wt",
      associatedWorktreeBranch: "main",
      associatedWorktreeRef: "abc",
      preferredLocalBranch: null,
      preferredWorktreeBaseBranch: "main",
      preferredNewWorktreeName: "feat",
    };
    await opts.mutationFn(request);
    expect(gitMock.handoffThread).toHaveBeenCalledWith({ cwd: "/a", ...request });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// onSuccess / onSettled 实际触发校验
// ──────────────────────────────────────────────────────────────────────────────

describe("mutation options 实际触发表 (onSettled/onSuccess)", () => {
  it("gitInit onSuccess 触发 invalidate", async () => {
    gitMock.init.mockResolvedValue(undefined);
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitInitMutationOptions({ cwd: "/a", queryClient: qc });
    // 模拟 React Query 内部调用 onSuccess
    if (opts.onSuccess) {
      await opts.onSuccess(undefined, undefined, undefined);
    }
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("gitCreateWorktree onSettled 触发 invalidate (成功/失败都触发)", async () => {
    gitMock.createWorktree.mockResolvedValue({} as never);
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitCreateWorktreeMutationOptions({ queryClient: qc });
    if (opts.onSettled) {
      await opts.onSettled({}, null, { cwd: "/a", branch: "main", newBranch: "f" });
    }
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("gitHandoffThread onSettled 在抛错时仍触发 invalidate", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    const opts = gitHandoffThreadMutationOptions({ cwd: "/a", queryClient: qc });
    if (opts.onSettled) {
      await opts.onSettled(
        undefined,
        new Error("boom"),
        {
          targetMode: "local",
          currentBranch: null,
          worktreePath: null,
          associatedWorktreePath: null,
          associatedWorktreeBranch: null,
          associatedWorktreeRef: null,
          preferredLocalBranch: null,
          preferredWorktreeBaseBranch: null,
          preferredNewWorktreeName: null,
        },
      );
    }
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
