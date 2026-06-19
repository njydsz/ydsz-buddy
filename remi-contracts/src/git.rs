//! Git 操作模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Git 状态查询的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStatusInput {
    /// 仓库路径。
    pub repo_path: String,
}

/// Git 状态查询的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStatusResult {
    /// 当前分支名称。
    pub current_branch: Option<String>,
    /// 仓库是否处于干净状态。
    pub is_clean: bool,
    /// 已暂存的变更。
    pub staged: Vec<GitFileChange>,
    /// 未暂存的变更。
    pub unstaged: Vec<GitFileChange>,
    /// 未跟踪的文件。
    pub untracked: Vec<String>,
}

/// Git 文件变更。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitFileChange {
    /// 文件路径。
    pub path: String,
    /// 变更状态。
    pub status: GitChangeStatus,
}

/// Git 变更状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "UPPERCASE")]
pub enum GitChangeStatus {
    /// 新增。
    Added,
    /// 修改。
    Modified,
    /// 删除。
    Deleted,
    /// 重命名。
    Renamed,
    /// 复制。
    Copied,
    /// 未合并。
    Unmerged,
}

/// Git 切换操作的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCheckoutInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 要切换的分支或提交。
    pub target: String,
    /// 是否创建新分支。
    #[serde(default)]
    pub create_branch: bool,
}

/// 创建分支的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateBranchInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 分支名称。
    pub branch_name: String,
    /// 基准分支或提交（可选）。
    pub base: Option<String>,
    /// 是否立即切换到新分支。
    #[serde(default)]
    pub checkout: bool,
}

/// 创建分支的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateBranchResult {
    /// 分支名称。
    pub branch_name: String,
    /// 提交 SHA。
    pub commit_sha: String,
}

/// 列出分支的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitListBranchesInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 是否包含远程分支。
    #[serde(default)]
    pub include_remote: bool,
}

/// 列出分支的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitListBranchesResult {
    /// 分支列表。
    pub branches: Vec<GitBranch>,
}

/// Git 分支。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitBranch {
    /// 分支名称。
    pub name: String,
    /// 是否为当前分支。
    pub is_current: bool,
    /// 是否为远程分支。
    pub is_remote: bool,
    /// 提交 SHA。
    pub commit_sha: String,
}

/// Git 拉取操作的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPullInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 远程名称（默认: "origin"）。
    pub remote: Option<String>,
    /// 分支名称（可选）。
    pub branch: Option<String>,
}

/// Git 拉取操作的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPullResult {
    /// 拉取的提交数量。
    pub commits_pulled: u32,
    /// 是否存在冲突。
    pub has_conflicts: bool,
}

/// 读取工作树差异的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitReadWorkingTreeDiffInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 文件路径（可选，用于指定特定文件）。
    pub file_path: Option<String>,
    /// 是否包含已暂存的变更。
    #[serde(default)]
    pub include_staged: bool,
}

/// 读取工作树差异的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitReadWorkingTreeDiffResult {
    /// 差异内容（unified diff 格式）。
    pub diff: String,
}

/// Git 操作进度事件。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitActionProgressEvent {
    /// 操作 ID。
    pub operation_id: Uuid,
    /// 进度百分比（0-100）。
    pub progress: u8,
    /// 状态消息。
    pub message: String,
}

/// 创建工作树的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateWorktreeInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 工作树路径。
    pub worktree_path: String,
    /// 分支名称。
    pub branch_name: String,
    /// 是否创建分离的工作树。
    #[serde(default)]
    pub detached: bool,
}

/// 创建工作树的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateWorktreeResult {
    /// 工作树路径。
    pub worktree_path: String,
    /// 分支名称。
    pub branch_name: String,
}

/// 创建分离工作树的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateDetachedWorktreeInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 工作树路径。
    pub worktree_path: String,
    /// 提交 SHA。
    pub commit_sha: String,
}

/// 创建分离工作树的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateDetachedWorktreeResult {
    /// 工作树路径。
    pub worktree_path: String,
}

/// 移除工作树的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitRemoveWorktreeInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 工作树路径。
    pub worktree_path: String,
    /// 是否强制移除。
    #[serde(default)]
    pub force: bool,
}

/// 初始化 Git 仓库的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitInitInput {
    /// 目录路径。
    pub path: String,
}

/// 差异摘要的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitSummarizeDiffInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 差异内容。
    pub diff: String,
}

/// 差异摘要的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitSummarizeDiffResult {
    /// 摘要文本。
    pub summary: String,
    /// 变更的文件数量。
    pub files_changed: u32,
    /// 新增行数。
    pub insertions: u32,
    /// 删除行数。
    pub deletions: u32,
}

/// 移除索引锁的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitRemoveIndexLockInput {
    /// 仓库路径。
    pub repo_path: String,
}

/// 暂存操作的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashInfoInput {
    /// 仓库路径。
    pub repo_path: String,
}

/// 暂存信息的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashInfoResult {
    /// 暂存条目列表。
    pub stashes: Vec<GitStashEntry>,
}

/// Git 暂存条目。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashEntry {
    /// 暂存索引。
    pub index: u32,
    /// 暂存消息。
    pub message: String,
    /// 时间戳（ISO 8601 格式）。
    pub timestamp: String,
}

/// 删除暂存的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashDropInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 暂存索引。
    pub index: u32,
}

/// 暂存并切换分支的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashAndCheckoutInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 要切换的分支。
    pub branch: String,
    /// 暂存消息（可选）。
    pub message: Option<String>,
}

/// 运行堆叠操作的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitRunStackedActionInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 操作类型。
    pub action: String,
    /// 操作参数。
    pub params: serde_json::Value,
}

/// 准备拉取请求的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPreparePullRequestThreadInput {
    /// 仓库路径。
    pub repo_path: String,
    /// 基础分支。
    pub base_branch: String,
    /// 头部 分支。
    pub head_branch: String,
    /// PR 标题。
    pub title: String,
    /// PR 描述。
    pub description: Option<String>,
}

/// 准备拉取请求的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPreparePullRequestThreadResult {
    /// PR 编号。
    pub pr_number: u32,
    /// PR URL。
    pub pr_url: String,
}

/// 解析拉取请求的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitResolvePullRequestResult {
    /// 仓库路径。
    pub repo_path: String,
    /// PR 编号。
    pub pr_number: u32,
}

/// 拉取请求引用查询的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPullRequestRefInput {
    /// 仓库路径。
    pub repo_path: String,
    /// PR 编号。
    pub pr_number: u32,
}

/// 移交线程的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitHandoffThreadInput {
    /// 线程 ID。
    pub thread_id: uuid::Uuid,
    /// 目标工作树路径。
    pub worktree_path: String,
}

/// 移交线程的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitHandoffThreadResult {
    /// 新线程 ID。
    pub new_thread_id: uuid::Uuid,
}
