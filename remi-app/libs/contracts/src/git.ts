/**
 * Git 操作相关的类型定义文件
 *
 * 本文件定义了与 Git 操作相关的所有类型，包括：
 * - Git 分支、工作树、Pull Request 相关类型
 * - Git 状态查询、差异读取、提交操作等输入输出类型
 * - Git 操作的进度事件类型
 *
 * 这些类型用于 RPC 通信，确保 Git 操作的类型安全
 */

import type { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";
import type { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import type { ProviderStartOptions } from "./orchestration";

// ============================================
// 领域类型定义 - Git 操作的基础枚举和常量
// ============================================

/** Git 堆叠操作类型：提交、推送、创建 PR 等组合操作 */
export type GitStackedAction =
  | "commit"
  | "push"
  | "create_pr"
  | "commit_push"
  | "commit_push_pr";

/** Git 操作进度阶段：分支、提交、推送、PR */
export type GitActionProgressPhase = "branch" | "commit" | "push" | "pr";

/** Git 操作进度事件类型：动作开始/结束、阶段开始、钩子执行等 */
export type GitActionProgressKind =
  | "action_started"
  | "phase_started"
  | "hook_started"
  | "hook_output"
  | "hook_finished"
  | "action_finished"
  | "action_failed";

/** Git 操作进度输出流类型：标准输出或标准错误 */
export type GitActionProgressStream = "stdout" | "stderr";

/** Git 提交步骤状态：已创建、无变更跳过、未请求跳过 */
type GitCommitStepStatus = "created" | "skipped_no_changes" | "skipped_not_requested";

/** Git 推送步骤状态：已推送、未请求跳过、已是最新跳过 */
type GitPushStepStatus = "pushed" | "skipped_not_requested" | "skipped_up_to_date";

/** Git 分支步骤状态：已创建、未请求跳过 */
type GitBranchStepStatus = "created" | "skipped_not_requested";

/** Git PR 步骤状态：已创建、已打开现有 PR、未请求跳过 */
type GitPrStepStatus = "created" | "opened_existing" | "skipped_not_requested";

/** Git 状态中 PR 的状态：开放、已关闭、已合并 */
type GitStatusPrState = "open" | "closed" | "merged";

/** Git Pull Request 引用标识 */
type GitPullRequestReference = TrimmedNonEmptyString;

/** Git Pull Request 状态：开放、已关闭、已合并 */
type GitPullRequestState = "open" | "closed" | "merged";

/** Git 准备 PR 线程的模式：本地或工作树 */
type GitPreparePullRequestThreadMode = "local" | "worktree";

/** Git 交接线程的模式：本地或工作树 */
type GitHandoffThreadMode = "local" | "worktree";

// ============================================
// Git 分支和工作树结构定义
// ============================================

/** Git 分支信息结构 */
export interface GitBranch {
  name: TrimmedNonEmptyString;
  isRemote?: boolean;
  remoteName?: TrimmedNonEmptyString;
  current: boolean;
  isDefault: boolean;
  worktreePath: TrimmedNonEmptyString | null;
}

/** Git 工作树结构：包含路径和分支信息 */
interface GitWorktree {
  path: TrimmedNonEmptyString;
  branch: TrimmedNonEmptyString;
}

/** Git 分离工作树结构：包含路径、引用和可选分支 */
interface GitDetachedWorktree {
  path: TrimmedNonEmptyString;
  ref: TrimmedNonEmptyString;
  branch: TrimmedNonEmptyString | null;
}

/** Git 已解析的 Pull Request 结构：包含 PR 的完整信息 */
export interface GitResolvedPullRequest {
  number: PositiveInt;
  title: TrimmedNonEmptyString;
  url: string;
  baseBranch: TrimmedNonEmptyString;
  headBranch: TrimmedNonEmptyString;
  state: GitPullRequestState;
}

// ============================================
// RPC 输入类型 - Git 操作的请求参数
// ============================================

/** Git 状态查询输入：指定工作目录 */
export interface GitStatusInput {
  cwd: TrimmedNonEmptyString;
}

/** Git 读取工作树差异输入：指定工作目录和差异范围 */
export interface GitReadWorkingTreeDiffInput {
  cwd: TrimmedNonEmptyString;
  scope?: "workingTree" | "unstaged" | "staged" | "branch";
}

/** Git 拉取操作输入：指定工作目录 */
export interface GitPullInput {
  cwd: TrimmedNonEmptyString;
}

/** Git 差异摘要输入：使用 AI 模型对差异进行总结 */
export interface GitSummarizeDiffInput {
  cwd: TrimmedNonEmptyString;
  patch: string;
  codexHomePath?: TrimmedNonEmptyString;
  providerOptions?: ProviderStartOptions;
  textGenerationModel?: TrimmedNonEmptyString;
}

/** Git 堆叠操作输入：执行提交、推送、创建 PR 等组合操作 */
export interface GitRunStackedActionInput {
  actionId: TrimmedNonEmptyString;
  cwd: TrimmedNonEmptyString;
  action: GitStackedAction;
  commitMessage?: TrimmedNonEmptyString;
  featureBranch?: boolean;
  filePaths?: TrimmedNonEmptyString[];
  codexHomePath?: TrimmedNonEmptyString;
  providerOptions?: ProviderStartOptions;
  textGenerationModel?: TrimmedNonEmptyString;
  /** PR 标题（未指定时使用 commitMessage） */
  prTitle?: TrimmedNonEmptyString;
  /** PR 描述 */
  prBody?: string;
  /** PR 目标分支（未指定时使用仓库默认分支） */
  prBase?: TrimmedNonEmptyString;
}

/** Git 列出分支输入：指定工作目录 */
export interface GitListBranchesInput {
  cwd: TrimmedNonEmptyString;
}

/** Git 创建工作树输入：指定工作目录、分支和路径 */
export interface GitCreateWorktreeInput {
  cwd: TrimmedNonEmptyString;
  branch: TrimmedNonEmptyString;
  newBranch?: TrimmedNonEmptyString;
  path: TrimmedNonEmptyString | null;
}

/** Git 创建分离工作树输入：基于引用创建工作树 */
export interface GitCreateDetachedWorktreeInput {
  cwd: TrimmedNonEmptyString;
  ref: TrimmedNonEmptyString;
  path: TrimmedNonEmptyString | null;
}

/** Git Pull Request 引用输入：通过引用标识操作 PR */
export interface GitPullRequestRefInput {
  cwd: TrimmedNonEmptyString;
  reference: GitPullRequestReference;
}

/** Git 准备 PR 线程输入：为 PR 创建或切换到合适的工作线程 */
export interface GitPreparePullRequestThreadInput {
  cwd: TrimmedNonEmptyString;
  reference: GitPullRequestReference;
  mode: GitPreparePullRequestThreadMode;
}

/** Git 交接线程输入：在不同工作模式间转移当前变更 */
export interface GitHandoffThreadInput {
  cwd: TrimmedNonEmptyString;
  targetMode: GitHandoffThreadMode;
  currentBranch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath: TrimmedNonEmptyString | null;
  associatedWorktreeBranch: TrimmedNonEmptyString | null;
  associatedWorktreeRef: TrimmedNonEmptyString | null;
  preferredLocalBranch: TrimmedNonEmptyString | null;
  preferredWorktreeBaseBranch: TrimmedNonEmptyString | null;
  preferredNewWorktreeName: TrimmedNonEmptyString | null;
}

/** Git 移除工作树输入：删除指定的工作树 */
export interface GitRemoveWorktreeInput {
  cwd: TrimmedNonEmptyString;
  path: TrimmedNonEmptyString;
  force?: boolean;
}

/** Git 创建分支输入：创建新分支并可选推送到远程 */
export interface GitCreateBranchInput {
  cwd: TrimmedNonEmptyString;
  branch: TrimmedNonEmptyString;
  publish?: boolean;
}

/** Git 检出输入：切换到指定分支 */
export interface GitCheckoutInput {
  cwd: TrimmedNonEmptyString;
  branch: TrimmedNonEmptyString;
}

/** Git 暂存并检出输入：暂存当前变更后切换到指定分支 */
export interface GitStashAndCheckoutInput {
  cwd: TrimmedNonEmptyString;
  branch: TrimmedNonEmptyString;
}

/** Git 暂存删除输入：删除最新的暂存记录 */
export interface GitStashDropInput {
  cwd: TrimmedNonEmptyString;
}

/** Git 暂存信息查询输入：获取当前暂存信息 */
export interface GitStashInfoInput {
  cwd: TrimmedNonEmptyString;
}

/** Git 移除索引锁输入：删除 Git 索引锁文件 */
export interface GitRemoveIndexLockInput {
  cwd: TrimmedNonEmptyString;
}

/** Git 初始化输入：初始化新的 Git 仓库 */
export interface GitInitInput {
  cwd: TrimmedNonEmptyString;
}

// ============================================
// RPC 结果类型 - Git 操作的返回结果
// ============================================

/** Git 状态中的 PR 信息结构 */
interface GitStatusPr {
  number: PositiveInt;
  title: TrimmedNonEmptyString;
  url: string;
  baseBranch: TrimmedNonEmptyString;
  headBranch: TrimmedNonEmptyString;
  state: GitStatusPrState;
}

/** Git 工作树文件变更信息 */
interface GitWorkingTreeFile {
  path: TrimmedNonEmptyString;
  insertions: NonNegativeInt;
  deletions: NonNegativeInt;
}

/** Git 工作树变更信息 */
interface GitWorkingTree {
  files: GitWorkingTreeFile[];
  insertions: NonNegativeInt;
  deletions: NonNegativeInt;
}

/** Git 状态查询结果：包含分支、工作树变更、远程同步状态和 PR 信息 */
export interface GitStatusResult {
  branch: TrimmedNonEmptyString | null;
  hasWorkingTreeChanges: boolean;
  workingTree: GitWorkingTree;
  hasUpstream: boolean;
  upstreamBranch: TrimmedNonEmptyString | null;
  aheadCount: NonNegativeInt;
  behindCount: NonNegativeInt;
  pr: GitStatusPr | null;
}

/** Git 本地状态结果：仅包含分支和工作树变更信息 */
export interface GitStatusLocalResult {
  branch: TrimmedNonEmptyString | null;
  hasWorkingTreeChanges: boolean;
  workingTree: GitWorkingTree;
}

/** Git 远程状态结果：包含远程同步和 PR 信息 */
export interface GitStatusRemoteResult {
  hasUpstream: boolean;
  upstreamBranch: TrimmedNonEmptyString | null;
  aheadCount: NonNegativeInt;
  behindCount: NonNegativeInt;
  pr: GitStatusPr | null;
}

/** Git 状态流事件：用于实时推送状态更新 */
export type GitStatusStreamEvent =
  | {
      _tag: "snapshot";
      local: GitStatusLocalResult;
      remote: GitStatusRemoteResult | null;
    }
  | {
      _tag: "localUpdated";
      local: GitStatusLocalResult;
    }
  | {
      _tag: "remoteUpdated";
      remote: GitStatusRemoteResult | null;
    };

/** Git 读取工作树差异结果：返回差异补丁文本 */
export interface GitReadWorkingTreeDiffResult {
  patch: string;
}

/** Git 列出分支结果：包含分支列表和仓库信息 */
export interface GitListBranchesResult {
  branches: GitBranch[];
  isRepo: boolean;
  hasOriginRemote: boolean;
}

/** Git 创建工作树结果：返回创建的工作树信息 */
export interface GitCreateWorktreeResult {
  worktree: GitWorktree;
}

/** Git 创建分离工作树结果：返回创建的分离工作树信息 */
export interface GitCreateDetachedWorktreeResult {
  worktree: GitDetachedWorktree;
}

/** Git 暂存信息结果：包含暂存引用的详细信息 */
export interface GitStashInfoResult {
  cwd: TrimmedNonEmptyString;
  branch: TrimmedNonEmptyString | null;
  stashRef: TrimmedNonEmptyString;
  message: TrimmedNonEmptyString;
  files: TrimmedNonEmptyString[];
}

/** Git 解析 Pull Request 结果：返回 PR 的完整信息 */
export interface GitResolvePullRequestResult {
  pullRequest: GitResolvedPullRequest;
}

/** Git 准备 PR 线程结果：返回 PR 信息和线程路径 */
export interface GitPreparePullRequestThreadResult {
  pullRequest: GitResolvedPullRequest;
  branch: TrimmedNonEmptyString;
  worktreePath: TrimmedNonEmptyString | null;
}

/** Git 交接线程结果：包含线程切换的详细信息和状态 */
export interface GitHandoffThreadResult {
  targetMode: GitHandoffThreadMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath: TrimmedNonEmptyString | null;
  associatedWorktreeBranch: TrimmedNonEmptyString | null;
  associatedWorktreeRef: TrimmedNonEmptyString | null;
  changesTransferred: boolean;
  conflictsDetected: boolean;
  message: string | null;
}

/** Git 堆叠操作结果：包含分支、提交、推送、PR 各步骤的执行状态 */
export interface GitRunStackedActionResult {
  action: GitStackedAction;
  branch: {
    status: GitBranchStepStatus;
    name?: TrimmedNonEmptyString;
  };
  commit: {
    status: GitCommitStepStatus;
    commitSha?: TrimmedNonEmptyString;
    subject?: TrimmedNonEmptyString;
  };
  push: {
    status: GitPushStepStatus;
    branch?: TrimmedNonEmptyString;
    upstreamBranch?: TrimmedNonEmptyString;
    setUpstream?: boolean;
  };
  pr: {
    status: GitPrStepStatus;
    url?: string;
    number?: PositiveInt;
    baseBranch?: TrimmedNonEmptyString;
    headBranch?: TrimmedNonEmptyString;
    title?: TrimmedNonEmptyString;
  };
}

/** Git 拉取结果：包含拉取状态和分支信息 */
export interface GitPullResult {
  status: "pulled" | "skipped_up_to_date";
  branch: TrimmedNonEmptyString;
  upstreamBranch: TrimmedNonEmptyString | null;
}

/** Git 差异摘要结果：返回 AI 生成的差异总结 */
export interface GitSummarizeDiffResult {
  summary: TrimmedNonEmptyString;
}

// ============================================
// Git 操作进度事件类型 - 用于实时反馈操作进度
// ============================================

/** Git 操作进度基础结构：包含操作 ID、工作目录和操作类型 */
interface GitActionProgressBase {
  actionId: TrimmedNonEmptyString;
  cwd: TrimmedNonEmptyString;
  action: GitStackedAction;
}

/** Git 操作开始事件：包含将要执行的阶段列表 */
interface GitActionStartedEvent extends GitActionProgressBase {
  kind: "action_started";
  phases: GitActionProgressPhase[];
}

/** Git 操作阶段开始事件：标识某个阶段的开始 */
interface GitActionPhaseStartedEvent extends GitActionProgressBase {
  kind: "phase_started";
  phase: GitActionProgressPhase;
  label: TrimmedNonEmptyString;
}

/** Git 操作钩子开始事件：标识 Git 钩子的开始执行 */
interface GitActionHookStartedEvent extends GitActionProgressBase {
  kind: "hook_started";
  hookName: TrimmedNonEmptyString;
}

/** Git 操作钩子输出事件：捕获钩子的标准输出或错误输出 */
interface GitActionHookOutputEvent extends GitActionProgressBase {
  kind: "hook_output";
  hookName: TrimmedNonEmptyString | null;
  stream: GitActionProgressStream;
  text: TrimmedNonEmptyString;
}

/** Git 操作钩子完成事件：标识钩子执行完成及退出状态 */
interface GitActionHookFinishedEvent extends GitActionProgressBase {
  kind: "hook_finished";
  hookName: TrimmedNonEmptyString;
  exitCode: number | null;
  durationMs: NonNegativeInt | null;
}

/** Git 操作完成事件：包含操作的最终结果 */
interface GitActionFinishedEvent extends GitActionProgressBase {
  kind: "action_finished";
  result: GitRunStackedActionResult;
}

/** Git 操作失败事件：包含失败阶段和错误信息 */
interface GitActionFailedEvent extends GitActionProgressBase {
  kind: "action_failed";
  phase: GitActionProgressPhase | null;
  message: TrimmedNonEmptyString;
}

/** Git 操作进度事件联合类型：包含所有可能的进度事件 */
export type GitActionProgressEvent =
  | GitActionStartedEvent
  | GitActionPhaseStartedEvent
  | GitActionHookStartedEvent
  | GitActionHookOutputEvent
  | GitActionHookFinishedEvent
  | GitActionFinishedEvent
  | GitActionFailedEvent;
