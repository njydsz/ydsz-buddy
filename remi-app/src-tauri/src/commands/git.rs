use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct GitStatus {
    pub branch: String,
    pub changes: Vec<GitChange>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Serialize)]
pub struct GitChange {
    pub path: String,
    pub status: String,
}

#[tauri::command]
pub async fn git_status(cwd: String) -> Result<GitStatus, String> {
    let repo = Repository::open(&cwd).map_err(|e| e.to_string())?;
    
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    
    let mut status_opts = git2::StatusOptions::new();
    status_opts.include_untracked(true);
    
    let statuses = repo.statuses(Some(&mut status_opts)).map_err(|e| e.to_string())?;
    
    let changes: Vec<GitChange> = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?.to_string();
            let status = entry.status();
            let status_str = if status.contains(git2::Status::INDEX_NEW) {
                "added"
            } else if status.contains(git2::Status::INDEX_MODIFIED) {
                "modified"
            } else if status.contains(git2::Status::INDEX_DELETED) {
                "deleted"
            } else if status.contains(git2::Status::WT_MODIFIED) {
                "modified"
            } else if status.contains(git2::Status::WT_NEW) {
                "untracked"
            } else {
                "unknown"
            };
            Some(GitChange {
                path,
                status: status_str.to_string(),
            })
        })
        .collect();

    // Calculate ahead/behind
    let (ahead, behind) = if let Ok(head) = repo.head() {
        if let Ok(head_commit) = head.peel_to_commit() {
            if let Ok(upstream) = repo.branch_upstream_remote(head.shorthand().unwrap_or("")) {
                if let Ok(upstream_branch) = repo.find_branch(&upstream, git2::BranchType::Remote) {
                    if let Ok(upstream_oid) = upstream_branch.get().target().ok_or(()) {
                        if let Ok(upstream_commit) = repo.find_commit(upstream_oid) {
                            repo.graph_ahead_behind(head_commit.id(), upstream_commit.id())
                                .unwrap_or((0, 0))
                        } else {
                            (0, 0)
                        }
                    } else {
                        (0, 0)
                    }
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        }
    } else {
        (0, 0)
    };

    Ok(GitStatus {
        branch,
        changes,
        ahead,
        behind,
    })
}

#[tauri::command]
pub async fn git_list_branches(cwd: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&cwd).map_err(|e| e.to_string())?;
    let branches = repo.branches(None).map_err(|e| e.to_string())?;
    
    let branch_names: Vec<String> = branches
        .filter_map(|b| b.ok())
        .filter_map(|(branch, _)| branch.name().ok().flatten().map(String::from))
        .collect();
    
    Ok(branch_names)
}

#[tauri::command]
pub async fn git_checkout(cwd: String, branch: String) -> Result<(), String> {
    let repo = Repository::open(&cwd).map_err(|e| e.to_string())?;
    
    let (object, reference) = repo
        .revparse_ext(&branch)
        .map_err(|e| e.to_string())?;
    
    repo.checkout_tree(&object, None).map_err(|e| e.to_string())?;
    
    match reference {
        Some(gref) => repo.set_head(gref.name().unwrap()).map_err(|e| e.to_string()),
        None => repo.set_head_detached(object.id()).map_err(|e| e.to_string()),
    }?;
    
    Ok(())
}

#[tauri::command]
pub async fn git_commit(cwd: String, message: String) -> Result<(), String> {
    let repo = Repository::open(&cwd).map_err(|e| e.to_string())?;
    
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    
    let signature = repo.signature().map_err(|e| e.to_string())?;
    
    let parent_commit = repo.head().ok().and_then(|head| {
        head.peel_to_commit().ok()
    });
    
    let parents: Vec<&git2::Commit> = parent_commit.as_ref().map(|c| vec![c]).unwrap_or_default();
    
    repo.commit(Some("HEAD"), &signature, &signature, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
