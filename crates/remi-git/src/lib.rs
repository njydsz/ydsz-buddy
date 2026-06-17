//! Git operations for Remi Code.
//!
//! This crate provides git operations using git2-rs and CLI commands.

use git2::{Repository, StatusOptions};
use remi_contracts::{
    GitBranch, GitChangeStatus, GitCreateBranchResult, GitFileChange, GitListBranchesResult,
    GitStatusResult,
};
use remi_core::{Error, Result};
use tracing::info;

/// Git service.
pub struct GitService;

impl GitService {
    /// Get the status of a git repository.
    pub async fn status(repo_path: &str) -> Result<GitStatusResult> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| Error::Git(format!("Failed to get statuses: {}", e)))?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();

        for status in statuses.iter() {
            let path = status.path().unwrap_or("").to_string();
            let status_code = status.status();

            if status_code.is_index_new() {
                staged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Added,
                });
            } else if status_code.is_index_modified() {
                staged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Modified,
                });
            } else if status_code.is_index_deleted() {
                staged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Deleted,
                });
            }

            if status_code.is_wt_modified() {
                unstaged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Modified,
                });
            } else if status_code.is_wt_deleted() {
                unstaged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Deleted,
                });
            }

            if status_code.is_wt_new() {
                untracked.push(path);
            }
        }

        let current_branch = repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(String::from));

        let is_clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty();

        Ok(GitStatusResult {
            current_branch,
            is_clean,
            staged,
            unstaged,
            untracked,
        })
    }

    /// Create a new branch.
    pub async fn create_branch(
        repo_path: &str,
        branch_name: &str,
        base: Option<&str>,
        checkout: bool,
    ) -> Result<GitCreateBranchResult> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let commit = if let Some(base_ref) = base {
            repo.revparse_single(base_ref)
                .map_err(|e| Error::Git(format!("Failed to parse base ref: {}", e)))?
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("Failed to peel to commit: {}", e)))?
        } else {
            repo.head()
                .map_err(|e| Error::Git(format!("Failed to get HEAD: {}", e)))?
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("Failed to peel to commit: {}", e)))?
        };

        let branch = repo
            .branch(branch_name, &commit, false)
            .map_err(|e| Error::Git(format!("Failed to create branch: {}", e)))?;

        if checkout {
            let ref_name = branch
                .get()
                .name()
                .ok_or_else(|| Error::Git("Invalid branch name".to_string()))?;
            repo.set_head(ref_name)
                .map_err(|e| Error::Git(format!("Failed to checkout branch: {}", e)))?;
        }

        let commit_sha = commit.id().to_string();

        Ok(GitCreateBranchResult {
            branch_name: branch_name.to_string(),
            commit_sha,
        })
    }

    /// List branches.
    pub async fn list_branches(
        repo_path: &str,
        include_remote: bool,
    ) -> Result<GitListBranchesResult> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let mut branches = Vec::new();

        // Local branches
        for branch in repo
            .branches(Some(git2::BranchType::Local))
            .map_err(|e| Error::Git(format!("Failed to list local branches: {}", e)))?
        {
            let (branch, _) =
                branch.map_err(|e| Error::Git(format!("Failed to read branch: {}", e)))?;
            let name = branch
                .name()
                .map_err(|e| Error::Git(format!("Invalid branch name: {}", e)))?
                .unwrap_or("")
                .to_string();

            let commit = branch
                .get()
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("Failed to get commit: {}", e)))?;

            let is_current = repo
                .head()
                .ok()
                .and_then(|h| h.shorthand().map(|s| s == name))
                .unwrap_or(false);

            branches.push(GitBranch {
                name,
                is_current,
                is_remote: false,
                commit_sha: commit.id().to_string(),
            });
        }

        // Remote branches
        if include_remote {
            for branch in repo
                .branches(Some(git2::BranchType::Remote))
                .map_err(|e| Error::Git(format!("Failed to list remote branches: {}", e)))?
            {
                let (branch, _) =
                    branch.map_err(|e| Error::Git(format!("Failed to read branch: {}", e)))?;
                let name = branch
                    .name()
                    .map_err(|e| Error::Git(format!("Invalid branch name: {}", e)))?
                    .unwrap_or("")
                    .to_string();

                let commit = branch
                    .get()
                    .peel_to_commit()
                    .map_err(|e| Error::Git(format!("Failed to get commit: {}", e)))?;

                branches.push(GitBranch {
                    name,
                    is_current: false,
                    is_remote: true,
                    commit_sha: commit.id().to_string(),
                });
            }
        }

        Ok(GitListBranchesResult { branches })
    }

    /// Initialize a new git repository.
    pub async fn init(path: &str) -> Result<()> {
        Repository::init(path)
            .map_err(|e| Error::Git(format!("Failed to init repository: {}", e)))?;
        info!("Initialized git repository at {}", path);
        Ok(())
    }

    /// Checkout a branch or commit.
    pub async fn checkout(repo_path: &str, target: &str, create_branch: bool) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        if create_branch {
            // Create and checkout new branch
            let commit = repo
                .head()
                .map_err(|e| Error::Git(format!("Failed to get HEAD: {}", e)))?
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("Failed to peel to commit: {}", e)))?;

            let branch = repo
                .branch(target, &commit, false)
                .map_err(|e| Error::Git(format!("Failed to create branch: {}", e)))?;

            let ref_name = branch
                .get()
                .name()
                .ok_or_else(|| Error::Git("Invalid branch name".to_string()))?;

            repo.set_head(ref_name)
                .map_err(|e| Error::Git(format!("Failed to checkout branch: {}", e)))?;
        } else {
            // Checkout existing branch or commit
            let obj = repo
                .revparse_single(target)
                .map_err(|e| Error::Git(format!("Failed to parse target: {}", e)))?;

            repo.checkout_tree(&obj, None)
                .map_err(|e| Error::Git(format!("Failed to checkout tree: {}", e)))?;

            // Try to set HEAD to the target (if it's a branch)
            if let Ok(branch) = repo.find_branch(target, git2::BranchType::Local) {
                if let Some(name) = branch.get().name() {
                    repo.set_head(name)
                        .map_err(|e| Error::Git(format!("Failed to set HEAD: {}", e)))?;
                }
            } else {
                // Detached HEAD
                repo.set_head_detached(obj.id())
                    .map_err(|e| Error::Git(format!("Failed to detach HEAD: {}", e)))?;
            }
        }

        info!("Checked out {} in {}", target, repo_path);
        Ok(())
    }

    /// Pull from remote.
    pub async fn pull(repo_path: &str, remote: Option<&str>, branch: Option<&str>) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let remote_name = remote.unwrap_or("origin");
        
        // Use git2 to fetch
        let mut remote_obj = repo
            .find_remote(remote_name)
            .map_err(|e| Error::Git(format!("Failed to find remote: {}", e)))?;

        let branch_name = branch.unwrap_or("main");
        let refspec = format!("refs/heads/{}:refs/remotes/{}/{}", branch_name, remote_name, branch_name);

        remote_obj
            .fetch(&[&refspec], None, None)
            .map_err(|e| Error::Git(format!("Failed to fetch: {}", e)))?;

        info!("Pulled from {}:{} in {}", remote_name, branch_name, repo_path);
        Ok(())
    }

    /// Read working tree diff.
    pub async fn read_working_tree_diff(
        repo_path: &str,
        file_path: Option<&str>,
        include_staged: bool,
    ) -> Result<String> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let mut diff_opts = git2::DiffOptions::new();
        if let Some(path) = file_path {
            diff_opts.pathspec(path);
        }

        let diff = if include_staged {
            // Diff between index and HEAD
            let head = repo
                .head()
                .map_err(|e| Error::Git(format!("Failed to get HEAD: {}", e)))?;
            let head_tree = head
                .peel_to_tree()
                .map_err(|e| Error::Git(format!("Failed to peel to tree: {}", e)))?;
            
            repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut diff_opts))
                .map_err(|e| Error::Git(format!("Failed to diff: {}", e)))?
        } else {
            // Diff between working directory and index
            repo.diff_index_to_workdir(None, Some(&mut diff_opts))
                .map_err(|e| Error::Git(format!("Failed to diff: {}", e)))?
        };

        let mut diff_text = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(content) = std::str::from_utf8(line.content()) {
                diff_text.push_str(content);
            }
            true
        })
        .map_err(|e| Error::Git(format!("Failed to print diff: {}", e)))?;

        Ok(diff_text)
    }

    /// Stash current changes.
    pub async fn stash_save(repo_path: &str, message: Option<&str>) -> Result<()> {
        let mut repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let sig = repo
            .signature()
            .map_err(|e| Error::Git(format!("Failed to get signature: {}", e)))?;

        repo.stash_save(
            &sig,
            message.unwrap_or("WIP"),
            Some(git2::StashFlags::INCLUDE_UNTRACKED),
        )
        .map_err(|e| Error::Git(format!("Failed to stash changes: {}", e)))?;

        info!("Stashed changes in {}", repo_path);
        Ok(())
    }

    /// Stash info - list stashes.
    pub async fn stash_info(repo_path: &str) -> Result<Vec<remi_contracts::GitStashEntry>> {
        let mut repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let mut stashes = Vec::new();
        repo.stash_foreach(|index, message, _oid| {
            stashes.push(remi_contracts::GitStashEntry {
                index: index as u32,
                message: message.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(), // git2 doesn't provide timestamp easily
            });
            true
        })
        .map_err(|e| Error::Git(format!("Failed to list stashes: {}", e)))?;

        Ok(stashes)
    }

    /// Stash drop - remove a stash.
    pub async fn stash_drop(repo_path: &str, index: u32) -> Result<()> {
        let mut repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        repo.stash_drop(index as usize)
            .map_err(|e| Error::Git(format!("Failed to drop stash: {}", e)))?;

        info!("Dropped stash {} in {}", index, repo_path);
        Ok(())
    }

    /// Create worktree.
    pub async fn create_worktree(
        repo_path: &str,
        worktree_path: &str,
        branch_name: &str,
    ) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        repo.worktree(
            branch_name,
            std::path::Path::new(worktree_path),
            None,
        )
        .map_err(|e| Error::Git(format!("Failed to create worktree: {}", e)))?;

        info!("Created worktree {} at {}", branch_name, worktree_path);
        Ok(())
    }

    /// Remove worktree.
    pub async fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let worktree_name = std::path::Path::new(worktree_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| Error::Git("Invalid worktree path".to_string()))?;

        let worktree = repo
            .find_worktree(worktree_name)
            .map_err(|e| Error::Git(format!("Failed to find worktree: {}", e)))?;

        if force {
            worktree
                .prune(None)
                .map_err(|e| Error::Git(format!("Failed to prune worktree: {}", e)))?;
        } else {
            // git2 doesn't have a direct remove method, use prune instead
            worktree
                .prune(None)
                .map_err(|e| Error::Git(format!("Failed to remove worktree: {}", e)))?;
        }

        info!("Removed worktree at {}", worktree_path);
        Ok(())
    }

    /// Remove index lock.
    pub async fn remove_index_lock(repo_path: &str) -> Result<()> {
        let lock_path = std::path::Path::new(repo_path).join(".git").join("index.lock");
        if lock_path.exists() {
            std::fs::remove_file(&lock_path)
                .map_err(|e| Error::Git(format!("Failed to remove index lock: {}", e)))?;
            info!("Removed index lock in {}", repo_path);
        }
        Ok(())
    }

    /// Create detached worktree at a specific commit.
    pub async fn create_detached_worktree(
        repo_path: &str,
        worktree_path: &str,
        commit_sha: &str,
    ) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let commit = repo
            .revparse_single(commit_sha)
            .map_err(|e| Error::Git(format!("Failed to resolve commit: {}", e)))?
            .peel_to_commit()
            .map_err(|e| Error::Git(format!("Failed to peel to commit: {}", e)))?;

        let wt_name = std::path::Path::new(worktree_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| Error::Git("Invalid worktree path".to_string()))?;

        let mut opts = git2::WorktreeAddOptions::new();
        opts.reference(None);

        let worktree = repo
            .worktree(wt_name, std::path::Path::new(worktree_path), Some(&opts))
            .map_err(|e| Error::Git(format!("Failed to create worktree: {}", e)))?;

        let wt_repo = Repository::open_from_worktree(&worktree)
            .map_err(|e| Error::Git(format!("Failed to open worktree repository: {}", e)))?;
        wt_repo
            .set_head_detached(commit.id())
            .map_err(|e| Error::Git(format!("Failed to detach HEAD: {}", e)))?;
        wt_repo
            .checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .map_err(|e| Error::Git(format!("Failed to checkout commit: {}", e)))?;

        info!(
            "Created detached worktree {} at {} on {}",
            wt_name, worktree_path, commit_sha
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_init_and_status() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path();

        GitService::init(path.to_str().unwrap()).await.unwrap();

        let status = GitService::status(path.to_str().unwrap()).await.unwrap();
        assert!(status.is_clean);
    }
}
