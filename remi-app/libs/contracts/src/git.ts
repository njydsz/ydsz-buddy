/**
 * Git 操作相关的 Schema 定义文件
 * 
 * 本文件定义了与 Git 操作相关的所有类型和 Schema，包括：
 * - Git 分支、工作树、Pull Request 相关类型
 * - Git 状态查询、差异读取、提交操作等输入输出类型
 * - Git 操作的进度事件类型
 * 
 * 这些类型用于 RPC 通信，确保 Git 操作的类型安全
 */

import { Option, Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import { ProviderStartOptions } from "./orchestration";

const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;

// ============================================
// 领域类型定义 - Git 操作的基础枚举和常量
// ============================================

/** Git 堆叠操作类型：提交、推送、创建 PR 等组合操作 */
export const GitStackedAction = Schema.Literals([
  "commit",
  "push",
  "create_pr",
  "commit_push",
  "commit_push_pr",
]);
export type GitStackedAction = typeof GitStackedAction.Type;

/** Git 操作进度阶段：分支、提交、推送、PR */
export const GitActionProgressPhase = Schema.Literals(["branch", "commit", "push", "pr"]);
export type GitActionProgressPhase = typeof GitActionProgressPhase.Type;

/** Git 操作进度事件类型：动作开始/结束、阶段开始、钩子执行等 */
export const GitActionProgressKind = Schema.Literals([
  "action_started",
  "phase_started",
  "hook_started",
  "hook_output",
  "hook_finished",
  "action_finished",
  "action_failed",
]);
export type GitActionProgressKind = typeof GitActionProgressKind.Type;

/** Git 操作进度输出流类型：标准输出或标准错误 */
export const GitActionProgressStream = Schema.Literals(["stdout", "stderr"]);
export type GitActionProgressStream = typeof GitActionProgressStream.Type;

/** Git 提交步骤状态：已创建、无变更跳过、未请求跳过 */
const GitCommitStepStatus = Schema.Literals([
  "created",
  "skipped_no_changes",
  "skipped_not_requested",
]);

/** Git 推送步骤状态：已推送、未请求跳过、已是最新跳过 */
const GitPushStepStatus = Schema.Literals([
  "pushed",
  "skipped_not_requested",
  "skipped_up_to_date",
]);

/** Git 分支步骤状态：已创建、未请求跳过 */
const GitBranchStepStatus = Schema.Literals(["created", "skipped_not_requested"]);

/** Git PR 步骤状态：已创建、已打开现有 PR、未请求跳过 */
const GitPrStepStatus = Schema.Literals(["created", "opened_existing", "skipped_not_requested"]);

/** Git 状态中 PR 的状态：开放、已关闭、已合并 */
const GitStatusPrState = Schema.Literals(["open", "closed", "merged"]);

/** Git Pull Request 引用标识 */
const GitPullRequestReference = TrimmedNonEmptyStringSchema;

/** Git Pull Request 状态：开放、已关闭、已合并 */
const GitPullRequestState = Schema.Literals(["open", "closed", "merged"]);

/** Git 准备 PR 线程的模式：本地或工作树 */
const GitPreparePullRequestThreadMode = Schema.Literals(["local", "worktree"]);

/** Git 交接线程的模式：本地或工作树 */
const GitHandoffThreadMode = Schema.Literals(["local", "worktree"]);

// ============================================
// Git 分支和工作树结构定义
// ============================================

/** Git 分支信息结构 */
export const GitBranch = Schema.Struct({
  name: TrimmedNonEmptyStringSchema,
  isRemote: Schema.optional(Schema.Boolean),
  remoteName: Schema.optional(TrimmedNonEmptyStringSchema),
  current: Schema.Boolean,
  isDefault: Schema.Boolean,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitBranch = typeof GitBranch.Type;

/** Git 工作树结构：包含路径和分支信息 */
const GitWorktree = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});

/** Git 分离工作树结构：包含路径、引用和可选分支 */
const GitDetachedWorktree = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  ref: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});

/** Git 已解析的 Pull Request 结构：包含 PR 的完整信息 */
const GitResolvedPullRequest = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitPullRequestState,
});
export type GitResolvedPullRequest = typeof GitResolvedPullRequest.Type;

// ============================================
// RPC 输入类型 - Git 操作的请求参数
// ============================================

/** Git 状态查询输入：指定工作目录 */
export const GitStatusInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStatusInput = typeof GitStatusInput.Type;

/** Git 读取工作树差异输入：指定工作目录和差异范围 */
export const GitReadWorkingTreeDiffInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  scope: Schema.optional(Schema.Literals(["workingTree", "unstaged", "staged", "branch"])).pipe(
    Schema.withConstructorDefault(() => Option.some("workingTree" as const)),
  ),
});
export type GitReadWorkingTreeDiffInput = typeof GitReadWorkingTreeDiffInput.Type;

/** Git 拉取操作输入：指定工作目录 */
export const GitPullInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitPullInput = typeof GitPullInput.Type;

/** Git 差异摘要输入：使用 AI 模型对差异进行总结 */
export const GitSummarizeDiffInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  patch: Schema.String,
  codexHomePath: Schema.optional(TrimmedNonEmptyStringSchema),
  providerOptions: Schema.optional(ProviderStartOptions),
  textGenerationModel: Schema.optional(TrimmedNonEmptyStringSchema).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_GIT_TEXT_GENERATION_MODEL)),
  ),
});
export type GitSummarizeDiffInput = typeof GitSummarizeDiffInput.Type;

/** Git 堆叠操作输入：执行提交、推送、创建 PR 等组合操作 */
export const GitRunStackedActionInput = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
  commitMessage: Schema.optional(TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(10_000))),
  featureBranch: Schema.optional(Schema.Boolean),
  filePaths: Schema.optional(
    Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
  ),
  codexHomePath: Schema.optional(TrimmedNonEmptyStringSchema),
  providerOptions: Schema.optional(ProviderStartOptions),
  textGenerationModel: Schema.optional(TrimmedNonEmptyStringSchema).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_GIT_TEXT_GENERATION_MODEL)),
  ),
});
export type GitRunStackedActionInput = typeof GitRunStackedActionInput.Type;

/** Git 列出分支输入：指定工作目录 */
export const GitListBranchesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitListBranchesInput = typeof GitListBranchesInput.Type;

/** Git 创建工作树输入：指定工作目录、分支和路径 */
export const GitCreateWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  newBranch: Schema.optional(TrimmedNonEmptyStringSchema),
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitCreateWorktreeInput = typeof GitCreateWorktreeInput.Type;

/** Git 创建分离工作树输入：基于引用创建工作树 */
export const GitCreateDetachedWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  ref: TrimmedNonEmptyStringSchema,
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitCreateDetachedWorktreeInput = typeof GitCreateDetachedWorktreeInput.Type;

/** Git Pull Request 引用输入：通过引用标识操作 PR */
export const GitPullRequestRefInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
});
export type GitPullRequestRefInput = typeof GitPullRequestRefInput.Type;

/** Git 准备 PR 线程输入：为 PR 创建或切换到合适的工作线程 */
export const GitPreparePullRequestThreadInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
  mode: GitPreparePullRequestThreadMode,
});
export type GitPreparePullRequestThreadInput = typeof GitPreparePullRequestThreadInput.Type;

/** Git 交接线程输入：在不同工作模式间转移当前变更 */
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

/** Git 移除工作树输入：删除指定的工作树 */
export const GitRemoveWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  path: TrimmedNonEmptyStringSchema,
  force: Schema.optional(Schema.Boolean),
});
export type GitRemoveWorktreeInput = typeof GitRemoveWorktreeInput.Type;

/** Git 创建分支输入：创建新分支并可选推送到远程 */
export const GitCreateBranchInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  publish: Schema.optional(Schema.Boolean),
});
export type GitCreateBranchInput = typeof GitCreateBranchInput.Type;

/** Git 检出输入：切换到指定分支 */
export const GitCheckoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitCheckoutInput = typeof GitCheckoutInput.Type;

/** Git 暂存并检出输入：暂存当前变更后切换到指定分支 */
export const GitStashAndCheckoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitStashAndCheckoutInput = typeof GitStashAndCheckoutInput.Type;

/** Git 暂存删除输入：删除最新的暂存记录 */
export const GitStashDropInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStashDropInput = typeof GitStashDropInput.Type;

/** Git 暂存信息查询输入：获取当前暂存信息 */
export const GitStashInfoInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStashInfoInput = typeof GitStashInfoInput.Type;

/** Git 移除索引锁输入：删除 Git 索引锁文件 */
export const GitRemoveIndexLockInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitRemoveIndexLockInput = typeof GitRemoveIndexLockInput.Type;

/** Git 初始化输入：初始化新的 Git 仓库 */
export const GitInitInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitInitInput = typeof GitInitInput.Type;

// ============================================
// RPC 结果类型 - Git 操作的返回结果
// ============================================

/** Git 状态中的 PR 信息结构 */
const GitStatusPr = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitStatusPrState,
});

/** Git 状态查询结果：包含分支、工作树变更、远程同步状态和 PR 信息 */
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

/** Git 本地状态结果：仅包含分支和工作树变更信息 */
export const GitStatusLocalResult = Schema.Struct({
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  hasWorkingTreeChanges: Schema.Boolean,
  workingTree: GitStatusResult.fields.workingTree,
});
export type GitStatusLocalResult = typeof GitStatusLocalResult.Type;

/** Git 远程状态结果：包含远程同步和 PR 信息 */
export const GitStatusRemoteResult = Schema.Struct({
  hasUpstream: Schema.Boolean,
  upstreamBranch: GitStatusResult.fields.upstreamBranch,
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitStatusPr),
});
export type GitStatusRemoteResult = typeof GitStatusRemoteResult.Type;

/** Git 状态流事件：用于实时推送状态更新 */
export const GitStatusStreamEvent = Schema.Union([
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
]);
export type GitStatusStreamEvent = typeof GitStatusStreamEvent.Type;

/** Git 读取工作树差异结果：返回差异补丁文本 */
export const GitReadWorkingTreeDiffResult = Schema.Struct({
  patch: Schema.String,
});
export type GitReadWorkingTreeDiffResult = typeof GitReadWorkingTreeDiffResult.Type;

/** Git 列出分支结果：包含分支列表和仓库信息 */
export const GitListBranchesResult = Schema.Struct({
  branches: Schema.Array(GitBranch),
  isRepo: Schema.Boolean,
  hasOriginRemote: Schema.Boolean,
});
export type GitListBranchesResult = typeof GitListBranchesResult.Type;

/** Git 创建工作树结果：返回创建的工作树信息 */
export const GitCreateWorktreeResult = Schema.Struct({
  worktree: GitWorktree,
});
export type GitCreateWorktreeResult = typeof GitCreateWorktreeResult.Type;

/** Git 创建分离工作树结果：返回创建的分离工作树信息 */
export const GitCreateDetachedWorktreeResult = Schema.Struct({
  worktree: GitDetachedWorktree,
});
export type GitCreateDetachedWorktreeResult = typeof GitCreateDetachedWorktreeResult.Type;

/** Git 暂存信息结果：包含暂存引用的详细信息 */
export const GitStashInfoResult = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  stashRef: TrimmedNonEmptyStringSchema,
  message: TrimmedNonEmptyStringSchema,
  files: Schema.Array(TrimmedNonEmptyStringSchema),
});
export type GitStashInfoResult = typeof GitStashInfoResult.Type;

/** Git 解析 Pull Request 结果：返回 PR 的完整信息 */
export const GitResolvePullRequestResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
});
export type GitResolvePullRequestResult = typeof GitResolvePullRequestResult.Type;

/** Git 准备 PR 线程结果：返回 PR 信息和线程路径 */
export const GitPreparePullRequestThreadResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
  branch: TrimmedNonEmptyStringSchema,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPreparePullRequestThreadResult = typeof GitPreparePullRequestThreadResult.Type;

/** Git 交接线程结果：包含线程切换的详细信息和状态 */
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

/** Git 堆叠操作结果：包含分支、提交、推送、PR 各步骤的执行状态 */
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

/** Git 拉取结果：包含拉取状态和分支信息 */
export const GitPullResult = Schema.Struct({
  status: Schema.Literals(["pulled", "skipped_up_to_date"]),
  branch: TrimmedNonEmptyStringSchema,
  upstreamBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPullResult = typeof GitPullResult.Type;

/** Git 差异摘要结果：返回 AI 生成的差异总结 */
export const GitSummarizeDiffResult = Schema.Struct({
  summary: TrimmedNonEmptyStringSchema,
});
export type GitSummarizeDiffResult = typeof GitSummarizeDiffResult.Type;

// ============================================
// Git 操作进度事件类型 - 用于实时反馈操作进度
// ============================================

/** Git 操作进度基础结构：包含操作 ID、工作目录和操作类型 */
const GitActionProgressBase = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
});

/** Git 操作开始事件：包含将要执行的阶段列表 */
const GitActionStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_started"),
  phases: Schema.Array(GitActionProgressPhase),
});

/** Git 操作阶段开始事件：标识某个阶段的开始 */
const GitActionPhaseStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("phase_started"),
  phase: GitActionProgressPhase,
  label: TrimmedNonEmptyStringSchema,
});

/** Git 操作钩子开始事件：标识 Git 钩子的开始执行 */
const GitActionHookStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_started"),
  hookName: TrimmedNonEmptyStringSchema,
});

/** Git 操作钩子输出事件：捕获钩子的标准输出或错误输出 */
const GitActionHookOutputEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_output"),
  hookName: Schema.NullOr(TrimmedNonEmptyStringSchema),
  stream: GitActionProgressStream,
  text: TrimmedNonEmptyStringSchema,
});

/** Git 操作钩子完成事件：标识钩子执行完成及退出状态 */
const GitActionHookFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_finished"),
  hookName: TrimmedNonEmptyStringSchema,
  exitCode: Schema.NullOr(Schema.Int),
  durationMs: Schema.NullOr(NonNegativeInt),
});

/** Git 操作完成事件：包含操作的最终结果 */
const GitActionFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_finished"),
  result: GitRunStackedActionResult,
});

/** Git 操作失败事件：包含失败阶段和错误信息 */
const GitActionFailedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_failed"),
  phase: Schema.NullOr(GitActionProgressPhase),
  message: TrimmedNonEmptyStringSchema,
});

/** Git 操作进度事件联合类型：包含所有可能的进度事件 */
export const GitActionProgressEvent = Schema.Union([
  GitActionStartedEvent,
  GitActionPhaseStartedEvent,
  GitActionHookStartedEvent,
  GitActionHookOutputEvent,
  GitActionHookFinishedEvent,
  GitActionFinishedEvent,
  GitActionFailedEvent,
]);
export type GitActionProgressEvent = typeof GitActionProgressEvent.Type;

