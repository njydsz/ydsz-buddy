//! Git 操作的模式定义
//!
//! 覆盖本地仓库操作（status/checkout/branch/pull/diff）、工作树（worktree）管理、
//! 暂存（stash）以及 PR 协作等完整 DTO。
//!
//! # 命名规范
//! - 状态枚举（[`GitChangeStatus`]）使用 `UPPERCASE` 序列化，与 `git status --porcelain` 风格一致。
//! - 路径字段统一命名为 `repo_path`（仓库根）或 `path`（自由路径）。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Git 状态查询的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusInput {
    /// 仓库路径
    pub repo_path: String,
}

/// Git 状态查询的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    /// 当前分支名称（detached HEAD 时为 `None`）
    pub current_branch: Option<String>,
    /// 仓库是否处于干净状态
    pub is_clean: bool,
    /// 已暂存（`git add`）的变更
    pub staged: Vec<GitFileChange>,
    /// 未暂存的变更
    pub unstaged: Vec<GitFileChange>,
    /// 未跟踪的文件（`??`）
    pub untracked: Vec<String>,
}

/// 单个文件的 Git 变更
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    /// 文件路径
    pub path: String,
    /// 变更状态
    pub status: GitChangeStatus,
}

/// Git 文件变更状态
///
/// 序列化采用 `UPPERCASE`，与 `git status --porcelain` 输出一致。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "UPPERCASE")]
pub enum GitChangeStatus {
    /// 新增
    Added,
    /// 修改
    Modified,
    /// 删除
    Deleted,
    /// 重命名
    Renamed,
    /// 复制
    Copied,
    /// 未合并（存在冲突）
    Unmerged,
}

/// Git 切换操作（checkout）的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckoutInput {
    /// 仓库路径
    pub repo_path: String,
    /// 要切换的分支或提交
    pub target: String,
    /// 是否创建新分支（`git checkout -b`）
    #[serde(default)]
    pub create_branch: bool,
}

/// 创建分支的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateBranchInput {
    /// 仓库路径
    pub repo_path: String,
    /// 分支名称
    pub branch_name: String,
    /// 基准分支或提交（可选，默认基于 `HEAD`）
    pub base: Option<String>,
    /// 是否立即切换到新分支
    #[serde(default)]
    pub checkout: bool,
}

/// 创建分支的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateBranchResult {
    /// 新分支名称
    pub branch_name: String,
    /// 指向的提交 SHA
    pub commit_sha: String,
}

/// 列出分支的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitListBranchesInput {
    /// 仓库路径
    pub repo_path: String,
    /// 是否包含远程分支
    #[serde(default)]
    pub include_remote: bool,
}

/// 列出分支的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitListBranchesResult {
    /// 分支列表
    pub branches: Vec<GitBranch>,
}

/// Git 分支信息
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    /// 分支名称
    pub name: String,
    /// 是否为当前分支
    pub is_current: bool,
    /// 是否为远程分支
    pub is_remote: bool,
    /// 分支指向的提交 SHA
    pub commit_sha: String,
}

/// Git 拉取（pull）操作的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitPullInput {
    /// 仓库路径
    pub repo_path: String,
    /// 远程名称（默认 `"origin"`）
    pub remote: Option<String>,
    /// 分支名称（可选，默认与本地当前分支对应的上游）
    pub branch: Option<String>,
}

/// Git 拉取操作的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    /// 拉取的提交数量
    pub commits_pulled: u32,
    /// 是否存在冲突
    pub has_conflicts: bool,
}

/// 读取工作树差异（diff）的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitReadWorkingTreeDiffInput {
    /// 仓库路径
    pub repo_path: String,
    /// 文件路径（可选，指定后仅返回该文件的 diff）
    pub file_path: Option<String>,
    /// 是否包含已暂存的变更
    #[serde(default)]
    pub include_staged: bool,
}

/// 读取工作树差异的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitReadWorkingTreeDiffResult {
    /// 差异内容（unified diff 格式）
    pub diff: String,
}

/// Git 操作进度事件（通过 WebSocket 推送给前端）
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitActionProgressEvent {
    /// 操作 ID（用于关联请求/响应）
    pub operation_id: Uuid,
    /// 进度百分比（0-100）
    pub progress: u8,
    /// 状态消息
    pub message: String,
}

/// 创建工作树（worktree）的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateWorktreeInput {
    /// 主仓库路径
    pub repo_path: String,
    /// 工作树路径
    pub worktree_path: String,
    /// 工作树对应的分支名称
    pub branch_name: String,
    /// 是否创建分离（detached）工作树
    #[serde(default)]
    pub detached: bool,
}

/// 创建工作树的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateWorktreeResult {
    /// 工作树路径
    pub worktree_path: String,
    /// 工作树对应的分支名称
    pub branch_name: String,
}

/// 创建分离（detached）工作树的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateDetachedWorktreeInput {
    /// 主仓库路径
    pub repo_path: String,
    /// 工作树路径
    pub worktree_path: String,
    /// 工作树指向的提交 SHA
    pub commit_sha: String,
}

/// 创建分离工作树的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateDetachedWorktreeResult {
    /// 工作树路径
    pub worktree_path: String,
}

/// 移除工作树的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoveWorktreeInput {
    /// 主仓库路径
    pub repo_path: String,
    /// 工作树路径
    pub worktree_path: String,
    /// 是否强制移除（即便工作树有未提交修改）
    #[serde(default)]
    pub force: bool,
}

/// 初始化 Git 仓库的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitInitInput {
    /// 要初始化的目录路径
    pub path: String,
}

/// 差异摘要（summarize）的入参
///
/// 后端会将 diff 发送给 AI 服务，生成自然语言摘要及基础度量。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitSummarizeDiffInput {
    /// 仓库路径
    pub repo_path: String,
    /// 差异内容
    pub diff: String,
}

/// 差异摘要的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitSummarizeDiffResult {
    /// AI 生成的摘要文本
    pub summary: String,
    /// 变更的文件数量
    pub files_changed: u32,
    /// 新增行数
    pub insertions: u32,
    /// 删除行数
    pub deletions: u32,
}

/// 移除 Git 索引锁的入参
///
/// 在异常崩溃后 `.git/index.lock` 可能残留，导致后续命令失败。
/// 调用此接口可强制清理。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoveIndexLockInput {
    /// 仓库路径
    pub repo_path: String,
}

/// 查询暂存列表的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStashInfoInput {
    /// 仓库路径
    pub repo_path: String,
}

/// 暂存列表的查询结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStashInfoResult {
    /// 暂存条目列表
    pub stashes: Vec<GitStashEntry>,
}

/// 单个 Git 暂存条目
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStashEntry {
    /// 暂存索引（`stash@{0}` 中的 `0`）
    pub index: u32,
    /// 暂存消息
    pub message: String,
    /// 创建时间戳（ISO 8601 字符串）
    pub timestamp: String,
}

/// 删除指定暂存条目的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStashDropInput {
    /// 仓库路径
    pub repo_path: String,
    /// 要删除的暂存索引
    pub index: u32,
}

/// 暂存当前修改并切换分支的入参
///
/// 用于"在切换分支前自动保存工作区修改"的快捷动作。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitStashAndCheckoutInput {
    /// 仓库路径
    pub repo_path: String,
    /// 目标分支
    pub branch: String,
    /// 暂存消息（可选）
    pub message: Option<String>,
}

/// 运行堆叠 Git 操作的入参
///
/// 通过 `action` + `params` 提供灵活的扩展点，避免为每种操作定义独立 RPC。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitRunStackedActionInput {
    /// 仓库路径
    pub repo_path: String,
    /// 操作类型（如 `"commit"`、`"push"` 等）
    pub action: String,
    /// 操作参数（任意 JSON）
    pub params: serde_json::Value,
}

/// 准备创建 PR 的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitPreparePullRequestThreadInput {
    /// 仓库路径
    pub repo_path: String,
    /// 基础分支（目标分支）
    pub base_branch: String,
    /// 头部分支（来源分支）
    pub head_branch: String,
    /// PR 标题
    pub title: String,
    /// PR 描述（可选）
    pub description: Option<String>,
}

/// 准备创建 PR 的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitPreparePullRequestThreadResult {
    /// PR 编号
    pub pr_number: u32,
    /// PR URL
    pub pr_url: String,
}

/// 解析（resolve）PR 评论的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitResolvePullRequestResult {
    /// 仓库路径
    pub repo_path: String,
    /// PR 编号
    pub pr_number: u32,
}

/// 查询 PR 引用的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestRefInput {
    /// 仓库路径
    pub repo_path: String,
    /// PR 编号
    pub pr_number: u32,
}

/// 移交线程到指定工作树的入参
///
/// 上下文（线程、checkpoint 等）会被序列化并写入目标工作树，便于在新环境中继续会话。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitHandoffThreadInput {
    /// 待移交的线程 ID
    pub thread_id: uuid::Uuid,
    /// 目标工作树路径
    pub worktree_path: String,
}

/// 移交线程的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GitHandoffThreadResult {
    /// 新线程 ID（在目标工作树中重新生成）
    pub new_thread_id: uuid::Uuid,
}
