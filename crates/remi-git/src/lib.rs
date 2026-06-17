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
    pub async fn list_branches(repo_path: &str, include_remote: bool) -> Result<GitListBranchesResult> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("Failed to open repository: {}", e)))?;

        let mut branches = Vec::new();

        // Local branches
        for branch in repo.branches(Some(git2::BranchType::Local)).map_err(|e| {
            Error::Git(format!("Failed to list local branches: {}", e))
        })? {
            let (branch, _) = branch.map_err(|e| Error::Git(format!("Failed to read branch: {}", e)))?;
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
                .map_err(|e| {
                    Error::Git(format!("Failed to list remote branches: {}", e))
                })?
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
        Repository::init(path).map_err(|e| Error::Git(format!("Failed to init repository: {}", e)))?;
        info!("Initialized git repository at {}", path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
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
