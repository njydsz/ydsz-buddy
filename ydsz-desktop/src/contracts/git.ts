/**
 * @file Git 操作契约模块
 *
 * 本模块定义了 ydsz 工作区中与 Git 版本控制交互的所有 Schema，涵盖仓库状态查询、
 * 分支管理、提交、推送、Pull Request、Worktree 等操作。
 *
 * ## 核心契约
 *
 * - `GitStatusInput/Result`：仓库状态（分支、暂存、修改、未跟踪文件等）
 * - `GitBranchesInput/Result`：分支列表查询
 * - `GitCommitInput/Result`：提交操作
 * - `GitPushInput/Result`：推送操作
 * - `GitPullRequestInput/Result`：PR 创建（通过 GitHub CLI）
 * - `GitWorktreeInput/Result`：Worktree 创建/删除
 * - `GitTextGenerationInput/Result`：AI 生成提交信息 / PR 描述
 * - `GitHubAuthStatusResult`：GitHub 认证状态
 *
 * ## 协议流程
 *
 * 1. `gitStatus` 实时获取仓库状态，前端订阅状态变更事件
 * 2. AI 生成提交信息：`gitTextGeneration` → 人工确认 → `gitCommit`
 * 3. 推送并创建 PR：`gitPush` → `gitCreatePullRequest`
 * 4. Worktree 切换：`gitWorktreeCreate` → 在新 worktree 中继续工作
 *
 * ## 性能注意
 *
 * - `gitStatus` 在大型仓库中可能耗时较长，建议使用 `GitStatusBroadcaster` 缓存
 * - 提交信息生成应异步执行，避免阻塞 UI
 * - PR 创建依赖 `gh` CLI，需先检查 `GitHubAuthStatus`
 */

import { Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import { ProviderStartOptions } from "./orchestration";

const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;

// Domain Types

export const GitStackedAction = Schema.Literal(
  "commit",
  "push",
  "create_pr",
  "commit_push",
  "commit_push_pr",
);
export type GitStackedAction = typeof GitStackedAction.Type;
export const GitActionProgressPhase = Schema.Literal("branch", "commit", "push", "pr");
export type GitActionProgressPhase = typeof GitActionProgressPhase.Type;
export const GitActionProgressKind = Schema.Literal(
  "action_started",
  "phase_started",
  "hook_started",
  "hook_output",
  "hook_finished",
  "action_finished",
  "action_failed",
);
export type GitActionProgressKind = typeof GitActionProgressKind.Type;
export const GitActionProgressStream = Schema.Literal("stdout", "stderr");
export type GitActionProgressStream = typeof GitActionProgressStream.Type;
const GitCommitStepStatus = Schema.Literal(
  "created",
  "skipped_no_changes",
  "skipped_not_requested",
);
const GitPushStepStatus = Schema.Literal(
  "pushed",
  "skipped_not_requested",
  "skipped_up_to_date",
);
const GitBranchStepStatus = Schema.Literal("created", "skipped_not_requested");
const GitPrStepStatus = Schema.Literal("created", "opened_existing", "skipped_not_requested");
const GitStatusPrState = Schema.Literal("open", "closed", "merged");
const GitPullRequestReference = TrimmedNonEmptyStringSchema;
const GitPullRequestState = Schema.Literal("open", "closed", "merged");
const GitPreparePullRequestThreadMode = Schema.Literal("local", "worktree");
const GitHandoffThreadMode = Schema.Literal("local", "worktree");

export const GitBranch = Schema.Struct({
  name: TrimmedNonEmptyStringSchema,
  isRemote: Schema.optional(Schema.Boolean),
  remoteName: Schema.optional(TrimmedNonEmptyStringSchema),
  current: Schema.Boolean,
  isDefault: Schema.Boolean,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitBranch = typeof GitBranch.Type;

const GitWorktree = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
const GitDetachedWorktree = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  ref: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
const GitResolvedPullRequest = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitPullRequestState,
});
export type GitResolvedPullRequest = typeof GitResolvedPullRequest.Type;

/**
 * GitHub PR 摘要,与后端 `PullRequestSummary` (serde 默认 snake_case) 对齐。
 * 注意:后端结构体未启用 `rename_all = "camelCase"`,故字段保持 snake_case,
 * 与本文件 `GitReconcileWorktreeEntry` 的处理方式一致。
 */
export const GitPullRequestSummary = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  head_ref: TrimmedNonEmptyStringSchema,
  base_ref: TrimmedNonEmptyStringSchema,
  state: TrimmedNonEmptyStringSchema,
  is_draft: Schema.Boolean,
  author: Schema.NullOr(TrimmedNonEmptyStringSchema),
  url: Schema.String,
});
export type GitPullRequestSummary = typeof GitPullRequestSummary.Type;

/**
 * GitHub PR 详情,与后端 `PullRequestDetail` 对齐。
 * 后端 `summary` 字段通过 `#[serde(flatten)]` 扁平化,
 * 因此 JSON 输出为 summary 字段与 detail 自身字段的并集。
 */
export const GitPullRequestDetail = Schema.Struct({
  ...GitPullRequestSummary.fields,
  merge_commit_sha: Schema.NullOr(TrimmedNonEmptyStringSchema),
  body: Schema.String,
  labels: Schema.Array(TrimmedNonEmptyStringSchema),
  assignees: Schema.Array(TrimmedNonEmptyStringSchema),
  milestone: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitPullRequestDetail = typeof GitPullRequestDetail.Type;

/** GitHub CLI 认证状态,与后端 `GitHubAuthStatus` (serde 默认 snake_case) 对齐 */
export const GitHubAuthStatus = Schema.Struct({
  logged_in: Schema.Boolean,
  account: Schema.NullOr(TrimmedNonEmptyStringSchema),
  protocol: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitHubAuthStatus = typeof GitHubAuthStatus.Type;

/** PR 合并策略,与后端 `MergeMethod` 枚举对齐 */
export const GitMergeMethod = Schema.Literal("merge", "squash", "rebase");
export type GitMergeMethod = typeof GitMergeMethod.Type;

// RPC Inputs

export const GitStatusInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStatusInput = typeof GitStatusInput.Type;

export const GitReadWorkingTreeDiffInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  scope: Schema.optional(Schema.Literal("workingTree", "unstaged", "staged", "branch")).pipe(
    Schema.withConstructorDefault(() => "workingTree" as const),
  ),
});
export type GitReadWorkingTreeDiffInput = typeof GitReadWorkingTreeDiffInput.Type;

export const GitPullInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitPullInput = typeof GitPullInput.Type;

// Read-only diff summary requests reuse the shared git text-generation model settings.
export const GitSummarizeDiffInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  patch: Schema.String,
  codexHomePath: Schema.optional(TrimmedNonEmptyStringSchema),
  providerOptions: Schema.optional(ProviderStartOptions),
  textGenerationModel: Schema.optional(TrimmedNonEmptyStringSchema).pipe(
    Schema.withConstructorDefault(() => DEFAULT_GIT_TEXT_GENERATION_MODEL),
  ),
});
export type GitSummarizeDiffInput = typeof GitSummarizeDiffInput.Type;

export const GitRunStackedActionInput = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
  commitMessage: Schema.optional(TrimmedNonEmptyStringSchema.pipe(Schema.maxLength(10_000))),
  featureBranch: Schema.optional(Schema.Boolean),
  filePaths: Schema.Array(TrimmedNonEmptyStringSchema).pipe(
    Schema.minItems(1),
    Schema.optional,
  ),
  codexHomePath: Schema.optional(TrimmedNonEmptyStringSchema),
  providerOptions: Schema.optional(ProviderStartOptions),
  textGenerationModel: Schema.optional(TrimmedNonEmptyStringSchema).pipe(
    Schema.withConstructorDefault(() => DEFAULT_GIT_TEXT_GENERATION_MODEL),
  ),
});
export type GitRunStackedActionInput = typeof GitRunStackedActionInput.Type;

export const GitApplyPatchInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  patch: TrimmedNonEmptyStringSchema,
  cached: Schema.optional(Schema.Boolean),
});
export type GitApplyPatchInput = typeof GitApplyPatchInput.Type;

export const GitListBranchesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitListBranchesInput = typeof GitListBranchesInput.Type;

export const GitCreateWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  newBranch: Schema.optional(TrimmedNonEmptyStringSchema),
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),
  /**
   * 可选:关联的 AI Agent 线程 ID。
   * 后端 createWorktree handler 会将其写入 ManagedWorktreeService 注册表,
   * 以便后续 server.listWorktrees / getWorktreeByThread 反查。
   */
  threadId: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type GitCreateWorktreeInput = typeof GitCreateWorktreeInput.Type;

export const GitCreateDetachedWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  ref: TrimmedNonEmptyStringSchema,
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitCreateDetachedWorktreeInput = typeof GitCreateDetachedWorktreeInput.Type;

export const GitPullRequestRefInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
});
export type GitPullRequestRefInput = typeof GitPullRequestRefInput.Type;

export const GitPreparePullRequestThreadInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
  mode: GitPreparePullRequestThreadMode,
});
export type GitPreparePullRequestThreadInput = typeof GitPreparePullRequestThreadInput.Type;

export const GitHandoffThreadInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  targetMode: GitHandoffThreadMode,
  currentBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  worktreePath: Schema.NullOr(TrimmedNonEmptyStringSchema),
  associatedWorktreePath: Schema.NullOr(TrimmedNonEmptyStringSchema),
  associatedWorktreeBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  associatedWorktreeRef: Schema.NullOr(TrimmedNonEmptyStringSchema),
  preferredLocalBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  preferredWorktreeBaseBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  preferredNewWorktreeName: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitHandoffThreadInput = typeof GitHandoffThreadInput.Type;

export const GitRemoveWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  path: TrimmedNonEmptyStringSchema,
  force: Schema.optional(Schema.Boolean),
});
export type GitRemoveWorktreeInput = typeof GitRemoveWorktreeInput.Type;

/**
 * `git.reconcileWorktrees` 入参。
 *
 * 前端在打开 workspace 时调用,触发后端扫描 `git worktree list --porcelain`,
 * 同步 ManagedWorktreeService 内存注册表(注册孤儿、移除悬空),
 * 返回对账后的活跃 worktree 列表。
 */
export const GitReconcileWorktreesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitReconcileWorktreesInput = typeof GitReconcileWorktreesInput.Type;

/**
 * 对账结果中的单个 worktree 记录,与后端 `ManagedWorktree` 序列化对齐。
 */
export const GitReconcileWorktreeEntry = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  thread_id: Schema.NullOr(TrimmedNonEmptyStringSchema),
  created_at: TrimmedNonEmptyStringSchema,
  last_active_at: TrimmedNonEmptyStringSchema,
});
export type GitReconcileWorktreeEntry = typeof GitReconcileWorktreeEntry.Type;

/**
 * `git.reconcileWorktrees` 返回值。
 *
 * - `registered`: 本次新注册的孤儿 worktree 数量
 * - `removed`: 本次移除的悬空 worktree 记录数量
 * - `worktrees`: 对账后的活跃 worktree 列表
 */
export const GitReconcileWorktreesResult = Schema.Struct({
  registered: Schema.Number,
  removed: Schema.Number,
  worktrees: Schema.Array(GitReconcileWorktreeEntry),
});
export type GitReconcileWorktreesResult = typeof GitReconcileWorktreesResult.Type;

export const GitCreateBranchInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  publish: Schema.optional(Schema.Boolean),
});
export type GitCreateBranchInput = typeof GitCreateBranchInput.Type;

export const GitCheckoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitCheckoutInput = typeof GitCheckoutInput.Type;

export const GitStashAndCheckoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitStashAndCheckoutInput = typeof GitStashAndCheckoutInput.Type;

export const GitStashDropInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStashDropInput = typeof GitStashDropInput.Type;

export const GitStashInfoInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStashInfoInput = typeof GitStashInfoInput.Type;

export const GitRemoveIndexLockInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitRemoveIndexLockInput = typeof GitRemoveIndexLockInput.Type;

export const GitInitInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitInitInput = typeof GitInitInput.Type;

// RPC Results

const GitStatusPr = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitStatusPrState,
});

export const GitStatusResult = Schema.Struct({
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  hasWorkingTreeChanges: Schema.Boolean,
  workingTree: Schema.Struct({
    files: Schema.Array(
      Schema.Struct({
        path: TrimmedNonEmptyStringSchema,
        insertions: NonNegativeInt,
        deletions: NonNegativeInt,
      }),
    ),
    insertions: NonNegativeInt,
    deletions: NonNegativeInt,
  }),
  hasUpstream: Schema.Boolean,
  upstreamBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitStatusPr),
});
export type GitStatusResult = typeof GitStatusResult.Type;

export const GitStatusLocalResult = Schema.Struct({
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  hasWorkingTreeChanges: Schema.Boolean,
  workingTree: GitStatusResult.fields.workingTree,
});
export type GitStatusLocalResult = typeof GitStatusLocalResult.Type;

export const GitStatusRemoteResult = Schema.Struct({
  hasUpstream: Schema.Boolean,
  upstreamBranch: GitStatusResult.fields.upstreamBranch,
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitStatusPr),
});
export type GitStatusRemoteResult = typeof GitStatusRemoteResult.Type;

export const GitStatusStreamEvent = Schema.Union(
  Schema.TaggedStruct("snapshot", {
    local: GitStatusLocalResult,
    remote: Schema.NullOr(GitStatusRemoteResult),
  }),
  Schema.TaggedStruct("localUpdated", {
    local: GitStatusLocalResult,
  }),
  Schema.TaggedStruct("remoteUpdated", {
    remote: Schema.NullOr(GitStatusRemoteResult),
  }),
);
export type GitStatusStreamEvent = typeof GitStatusStreamEvent.Type;

export const GitReadWorkingTreeDiffResult = Schema.Struct({
  patch: Schema.String,
});
export type GitReadWorkingTreeDiffResult = typeof GitReadWorkingTreeDiffResult.Type;

export const GitListBranchesResult = Schema.Struct({
  branches: Schema.Array(GitBranch),
  isRepo: Schema.Boolean,
  hasOriginRemote: Schema.Boolean,
});
export type GitListBranchesResult = typeof GitListBranchesResult.Type;

export const GitCreateWorktreeResult = Schema.Struct({
  worktree: GitWorktree,
});
export type GitCreateWorktreeResult = typeof GitCreateWorktreeResult.Type;

export const GitCreateDetachedWorktreeResult = Schema.Struct({
  worktree: GitDetachedWorktree,
});
export type GitCreateDetachedWorktreeResult = typeof GitCreateDetachedWorktreeResult.Type;

export const GitStashInfoResult = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  stashRef: TrimmedNonEmptyStringSchema,
  message: TrimmedNonEmptyStringSchema,
  files: Schema.Array(TrimmedNonEmptyStringSchema),
});
export type GitStashInfoResult = typeof GitStashInfoResult.Type;

export const GitResolvePullRequestResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
});
export type GitResolvePullRequestResult = typeof GitResolvePullRequestResult.Type;

export const GitPreparePullRequestThreadResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
  branch: TrimmedNonEmptyStringSchema,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPreparePullRequestThreadResult = typeof GitPreparePullRequestThreadResult.Type;

export const GitHandoffThreadResult = Schema.Struct({
  targetMode: GitHandoffThreadMode,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  associatedWorktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  associatedWorktreeBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  associatedWorktreeRef: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  changesTransferred: Schema.Boolean,
  conflictsDetected: Schema.Boolean,
  message: Schema.NullOr(Schema.String),
});
export type GitHandoffThreadResult = typeof GitHandoffThreadResult.Type;

export const GitRunStackedActionResult = Schema.Struct({
  action: GitStackedAction,
  branch: Schema.Struct({
    status: GitBranchStepStatus,
    name: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
  commit: Schema.Struct({
    status: GitCommitStepStatus,
    commitSha: Schema.optional(TrimmedNonEmptyStringSchema),
    subject: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
  push: Schema.Struct({
    status: GitPushStepStatus,
    branch: Schema.optional(TrimmedNonEmptyStringSchema),
    upstreamBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    setUpstream: Schema.optional(Schema.Boolean),
  }),
  pr: Schema.Struct({
    status: GitPrStepStatus,
    url: Schema.optional(Schema.String),
    number: Schema.optional(PositiveInt),
    baseBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    headBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    title: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
});
export type GitRunStackedActionResult = typeof GitRunStackedActionResult.Type;

export const GitPullResult = Schema.Struct({
  status: Schema.Literal("pulled", "skipped_up_to_date"),
  branch: TrimmedNonEmptyStringSchema,
  upstreamBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPullResult = typeof GitPullResult.Type;

export const GitSummarizeDiffResult = Schema.Struct({
  summary: TrimmedNonEmptyStringSchema,
});
export type GitSummarizeDiffResult = typeof GitSummarizeDiffResult.Type;

const GitActionProgressBase = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
});

const GitActionStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_started"),
  phases: Schema.Array(GitActionProgressPhase),
});
const GitActionPhaseStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("phase_started"),
  phase: GitActionProgressPhase,
  label: TrimmedNonEmptyStringSchema,
});
const GitActionHookStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_started"),
  hookName: TrimmedNonEmptyStringSchema,
});
const GitActionHookOutputEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_output"),
  hookName: Schema.NullOr(TrimmedNonEmptyStringSchema),
  stream: GitActionProgressStream,
  text: TrimmedNonEmptyStringSchema,
});
const GitActionHookFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_finished"),
  hookName: TrimmedNonEmptyStringSchema,
  exitCode: Schema.NullOr(Schema.Int),
  durationMs: Schema.NullOr(NonNegativeInt),
});
const GitActionFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_finished"),
  result: GitRunStackedActionResult,
});
const GitActionFailedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_failed"),
  phase: Schema.NullOr(GitActionProgressPhase),
  message: TrimmedNonEmptyStringSchema,
});

export const GitActionProgressEvent = Schema.Union(
  GitActionStartedEvent,
  GitActionPhaseStartedEvent,
  GitActionHookStartedEvent,
  GitActionHookOutputEvent,
  GitActionHookFinishedEvent,
  GitActionFinishedEvent,
  GitActionFailedEvent,
);
export type GitActionProgressEvent = typeof GitActionProgressEvent.Type;

// ===== GitHub PR 管理 RPC =====
// 与后端 ydsz-server/src/rpc_methods/handlers/git.rs 中
// git.listPullRequests / viewPullRequest / mergePullRequest /
// commentPullRequest / diffPullRequest / closePullRequest /
// reopenPullRequest / authStatus / createPullRequest 对齐。

// git.listPullRequests — 列出 PR,返回 PullRequestSummary 数组
export const GitListPullRequestsInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  state: Schema.optional(TrimmedNonEmptyStringSchema),
  limit: Schema.optional(PositiveInt),
});
export type GitListPullRequestsInput = typeof GitListPullRequestsInput.Type;
export const GitListPullRequestsResult = Schema.Array(GitPullRequestSummary);
export type GitListPullRequestsResult = typeof GitListPullRequestsResult.Type;

// git.viewPullRequest — 查看 PR 详情
export const GitViewPullRequestInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  prNumber: PositiveInt,
});
export type GitViewPullRequestInput = typeof GitViewPullRequestInput.Type;
export const GitViewPullRequestResult = GitPullRequestDetail;
export type GitViewPullRequestResult = typeof GitViewPullRequestResult.Type;

// git.mergePullRequest — 合并 PR
export const GitMergePullRequestInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  prNumber: PositiveInt,
  method: GitMergeMethod,
  deleteBranch: Schema.optional(Schema.Boolean),
});
export type GitMergePullRequestInput = typeof GitMergePullRequestInput.Type;
export const GitMergePullRequestResult = Schema.Null;
export type GitMergePullRequestResult = typeof GitMergePullRequestResult.Type;

// git.commentPullRequest — 给 PR 添加评论
export const GitCommentPullRequestInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  prNumber: PositiveInt,
  body: TrimmedNonEmptyStringSchema,
});
export type GitCommentPullRequestInput = typeof GitCommentPullRequestInput.Type;
export const GitCommentPullRequestResult = Schema.Null;
export type GitCommentPullRequestResult = typeof GitCommentPullRequestResult.Type;

// git.diffPullRequest — 获取 PR 的 diff
export const GitDiffPullRequestInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  prNumber: PositiveInt,
});
export type GitDiffPullRequestInput = typeof GitDiffPullRequestInput.Type;
export const GitDiffPullRequestResult = Schema.Struct({
  diff: Schema.String,
});
export type GitDiffPullRequestResult = typeof GitDiffPullRequestResult.Type;

// git.closePullRequest — 关闭 PR
export const GitClosePullRequestInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  prNumber: PositiveInt,
});
export type GitClosePullRequestInput = typeof GitClosePullRequestInput.Type;
export const GitClosePullRequestResult = Schema.Null;
export type GitClosePullRequestResult = typeof GitClosePullRequestResult.Type;

// git.reopenPullRequest — 重新打开 PR
export const GitReopenPullRequestInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  prNumber: PositiveInt,
});
export type GitReopenPullRequestInput = typeof GitReopenPullRequestInput.Type;
export const GitReopenPullRequestResult = Schema.Null;
export type GitReopenPullRequestResult = typeof GitReopenPullRequestResult.Type;

// git.authStatus — 查询 gh CLI 认证状态
// 注意:后端 handler 忽略入参,保留 cwd 以与其他 git 方法保持一致
export const GitAuthStatusInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitAuthStatusInput = typeof GitAuthStatusInput.Type;
export const GitAuthStatusResult = GitHubAuthStatus;
export type GitAuthStatusResult = typeof GitAuthStatusResult.Type;

// git.createPullRequest — 通过 gh CLI 创建 PR
export const GitCreatePullRequestInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  title: TrimmedNonEmptyStringSchema,
  body: Schema.optional(TrimmedNonEmptyStringSchema),
  base: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type GitCreatePullRequestInput = typeof GitCreatePullRequestInput.Type;
export const GitCreatePullRequestResult = Schema.Struct({
  url: Schema.String,
});
export type GitCreatePullRequestResult = typeof GitCreatePullRequestResult.Type;
