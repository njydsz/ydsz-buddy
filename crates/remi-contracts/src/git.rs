//! Git operation schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Input for git status operation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStatusInput {
    /// Repository path.
    pub repo_path: String,
}

/// Result of git status operation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStatusResult {
    /// Current branch name.
    pub current_branch: Option<String>,
    /// Whether the repository is in a clean state.
    pub is_clean: bool,
    /// Staged changes.
    pub staged: Vec<GitFileChange>,
    /// Unstaged changes.
    pub unstaged: Vec<GitFileChange>,
    /// Untracked files.
    pub untracked: Vec<String>,
}

/// A file change in git.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitFileChange {
    /// File path.
    pub path: String,
    /// Change status.
    pub status: GitChangeStatus,
}

/// Git change status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "UPPERCASE")]
pub enum GitChangeStatus {
    /// Added.
    Added,
    /// Modified.
    Modified,
    /// Deleted.
    Deleted,
    /// Renamed.
    Renamed,
    /// Copied.
    Copied,
    /// Unmerged.
    Unmerged,
}

/// Input for git checkout operation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCheckoutInput {
    /// Repository path.
    pub repo_path: String,
    /// Branch or commit to checkout.
    pub target: String,
    /// Whether to create a new branch.
    #[serde(default)]
    pub create_branch: bool,
}

/// Input for creating a branch.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateBranchInput {
    /// Repository path.
    pub repo_path: String,
    /// Branch name.
    pub branch_name: String,
    /// Base branch or commit (optional).
    pub base: Option<String>,
    /// Whether to checkout the new branch immediately.
    #[serde(default)]
    pub checkout: bool,
}

/// Result of creating a branch.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateBranchResult {
    /// Branch name.
    pub branch_name: String,
    /// Commit SHA.
    pub commit_sha: String,
}

/// Input for listing branches.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitListBranchesInput {
    /// Repository path.
    pub repo_path: String,
    /// Whether to include remote branches.
    #[serde(default)]
    pub include_remote: bool,
}

/// Result of listing branches.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitListBranchesResult {
    /// Branches.
    pub branches: Vec<GitBranch>,
}

/// A git branch.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitBranch {
    /// Branch name.
    pub name: String,
    /// Whether this is the current branch.
    pub is_current: bool,
    /// Whether this is a remote branch.
    pub is_remote: bool,
    /// Commit SHA.
    pub commit_sha: String,
}

/// Input for git pull operation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPullInput {
    /// Repository path.
    pub repo_path: String,
    /// Remote name (default: "origin").
    pub remote: Option<String>,
    /// Branch name (optional).
    pub branch: Option<String>,
}

/// Result of git pull operation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPullResult {
    /// Number of commits pulled.
    pub commits_pulled: u32,
    /// Whether there were conflicts.
    pub has_conflicts: bool,
}

/// Input for reading working tree diff.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitReadWorkingTreeDiffInput {
    /// Repository path.
    pub repo_path: String,
    /// File path (optional, for specific file).
    pub file_path: Option<String>,
    /// Whether to include staged changes.
    #[serde(default)]
    pub include_staged: bool,
}

/// Result of reading working tree diff.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitReadWorkingTreeDiffResult {
    /// Diff content (unified diff format).
    pub diff: String,
}

/// Git action progress event.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitActionProgressEvent {
    /// Operation ID.
    pub operation_id: Uuid,
    /// Progress percentage (0-100).
    pub progress: u8,
    /// Status message.
    pub message: String,
}

/// Input for creating a worktree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateWorktreeInput {
    /// Repository path.
    pub repo_path: String,
    /// Worktree path.
    pub worktree_path: String,
    /// Branch name.
    pub branch_name: String,
    /// Whether to create a detached worktree.
    #[serde(default)]
    pub detached: bool,
}

/// Result of creating a worktree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateWorktreeResult {
    /// Worktree path.
    pub worktree_path: String,
    /// Branch name.
    pub branch_name: String,
}

/// Input for creating a detached worktree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateDetachedWorktreeInput {
    /// Repository path.
    pub repo_path: String,
    /// Worktree path.
    pub worktree_path: String,
    /// Commit SHA.
    pub commit_sha: String,
}

/// Result of creating a detached worktree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitCreateDetachedWorktreeResult {
    /// Worktree path.
    pub worktree_path: String,
}

/// Input for removing a worktree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitRemoveWorktreeInput {
    /// Repository path.
    pub repo_path: String,
    /// Worktree path.
    pub worktree_path: String,
    /// Whether to force removal.
    #[serde(default)]
    pub force: bool,
}

/// Input for initializing a git repository.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitInitInput {
    /// Directory path.
    pub path: String,
}

/// Input for summarizing a diff.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitSummarizeDiffInput {
    /// Repository path.
    pub repo_path: String,
    /// Diff content.
    pub diff: String,
}

/// Result of summarizing a diff.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitSummarizeDiffResult {
    /// Summary text.
    pub summary: String,
    /// Number of files changed.
    pub files_changed: u32,
    /// Number of insertions.
    pub insertions: u32,
    /// Number of deletions.
    pub deletions: u32,
}

/// Input for removing index lock.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitRemoveIndexLockInput {
    /// Repository path.
    pub repo_path: String,
}

/// Input for stash operations.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashInfoInput {
    /// Repository path.
    pub repo_path: String,
}

/// Result of stash info.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashInfoResult {
    /// Stash entries.
    pub stashes: Vec<GitStashEntry>,
}

/// A git stash entry.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashEntry {
    /// Stash index.
    pub index: u32,
    /// Stash message.
    pub message: String,
    /// Timestamp (ISO 8601).
    pub timestamp: String,
}

/// Input for dropping a stash.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashDropInput {
    /// Repository path.
    pub repo_path: String,
    /// Stash index.
    pub index: u32,
}

/// Input for stash and checkout.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStashAndCheckoutInput {
    /// Repository path.
    pub repo_path: String,
    /// Branch to checkout.
    pub branch: String,
    /// Stash message (optional).
    pub message: Option<String>,
}

/// Input for running stacked action.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitRunStackedActionInput {
    /// Repository path.
    pub repo_path: String,
    /// Action type.
    pub action: String,
    /// Action parameters.
    pub params: serde_json::Value,
}

/// Input for preparing a pull request.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPreparePullRequestThreadInput {
    /// Repository path.
    pub repo_path: String,
    /// Base branch.
    pub base_branch: String,
    /// Head branch.
    pub head_branch: String,
    /// PR title.
    pub title: String,
    /// PR description.
    pub description: Option<String>,
}

/// Result of preparing a pull request.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPreparePullRequestThreadResult {
    /// PR number.
    pub pr_number: u32,
    /// PR URL.
    pub pr_url: String,
}

/// Input for resolving a pull request.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitResolvePullRequestResult {
    /// Repository path.
    pub repo_path: String,
    /// PR number.
    pub pr_number: u32,
}

/// Input for pull request ref.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitPullRequestRefInput {
    /// Repository path.
    pub repo_path: String,
    /// PR number.
    pub pr_number: u32,
}

/// Input for handing off a thread.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitHandoffThreadInput {
    /// Thread ID.
    pub thread_id: uuid::Uuid,
    /// Target worktree path.
    pub worktree_path: String,
}

/// Result of handing off a thread.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitHandoffThreadResult {
    /// New thread ID.
    pub new_thread_id: uuid::Uuid,
}
