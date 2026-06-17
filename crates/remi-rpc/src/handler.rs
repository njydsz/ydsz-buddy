//! RPC request handler.

use remi_contracts::RpcMethod;
use remi_core::{Error, Result};
use remi_orchestration::OrchestrationEngine;
use remi_persistence::repositories::project_repo::ProjectRepositoryTrait;
use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
use remi_persistence::repositories::{ProjectRepository, ThreadRepository};
use remi_providers::ProviderRegistry;
use remi_workspace::WorkspaceService;
use serde_json::Value;
use std::sync::Arc;
use tracing::{error, info};

use crate::WsState;

/// Application state for RPC handlers.
#[derive(Clone)]
pub struct RpcState {
    pub orchestration: Arc<OrchestrationEngine>,
    pub workspace: Arc<WorkspaceService>,
    pub provider_registry: Arc<ProviderRegistry>,
    pub ws_state: Arc<WsState>,
}

/// Handle an RPC method call.
pub async fn handle_method(
    method: &str,
    params: Option<Value>,
    state: &Arc<RpcState>,
) -> Result<Value> {
    // Parse the method
    let rpc_method: RpcMethod = match serde_json::from_value(serde_json::json!({
        "method": method,
        "params": params.unwrap_or(Value::Null)
    })) {
        Ok(m) => m,
        Err(e) => {
            error!("Failed to parse RPC method '{}': {}", method, e);
            return Err(Error::Internal(format!(
                "Failed to parse RPC method: {}",
                e
            )));
        }
    };

    info!("Handling RPC method: {}", method);

    // Route to appropriate handler
    match rpc_method {
        // Thread methods
        RpcMethod::ThreadList => handle_thread_list(state).await,
        RpcMethod::ThreadGet { thread_id } => handle_thread_get(thread_id, state).await,
        RpcMethod::ThreadCreate { project_id, title } => {
            handle_thread_create(project_id, title, state).await
        }
        RpcMethod::ThreadDelete { thread_id } => handle_thread_delete(thread_id, state).await,
        RpcMethod::ThreadListMessages { thread_id } => {
            handle_thread_list_messages(thread_id, state).await
        }
        RpcMethod::ThreadListTurns { thread_id } => {
            handle_thread_list_turns(thread_id, state).await
        }
        RpcMethod::ThreadSendMessage(input) => handle_thread_send_message(input, state).await,

        // Filesystem methods
        RpcMethod::FilesystemBrowse(input) => handle_filesystem_browse(input, state).await,

        // Git methods
        RpcMethod::GitStatus(input) => handle_git_status(input, state).await,
        RpcMethod::GitListBranches(input) => handle_git_list_branches(input, state).await,
        RpcMethod::GitInit(input) => handle_git_init(input, state).await,
        RpcMethod::GitCheckout(input) => handle_git_checkout(input, state).await,
        RpcMethod::GitCreateBranch(input) => handle_git_create_branch(input, state).await,
        RpcMethod::GitPull(input) => handle_git_pull(input, state).await,
        RpcMethod::GitReadWorkingTreeDiff(input) => {
            handle_git_read_working_tree_diff(input, state).await
        }
        RpcMethod::GitRemoveIndexLock(input) => handle_git_remove_index_lock(input, state).await,
        RpcMethod::GitStashInfo(input) => handle_git_stash_info(input, state).await,
        RpcMethod::GitStashDrop(input) => handle_git_stash_drop(input, state).await,
        RpcMethod::GitCreateWorktree(input) => handle_git_create_worktree(input, state).await,
        RpcMethod::GitRemoveWorktree(input) => handle_git_remove_worktree(input, state).await,
        RpcMethod::GitSummarizeDiff(input) => handle_git_summarize_diff(input, state).await,

        // Auth methods
        RpcMethod::AuthBootstrap(input) => handle_auth_bootstrap(input, state).await,
        RpcMethod::AuthCreatePairingCredential(input) => {
            handle_auth_create_pairing_credential(input, state).await
        }
        RpcMethod::AuthRevokePairingLink(_input) => handle_auth_revoke_pairing_link(state).await,
        RpcMethod::AuthRevokeClientSession(_input) => handle_auth_revoke_client_session(state).await,

        // Editor methods
        RpcMethod::EditorOpen(input) => handle_editor_open(input, state).await,

        // Git advanced methods
        RpcMethod::GitStashAndCheckout(input) => handle_git_stash_and_checkout(input, state).await,
        RpcMethod::GitRunStackedAction(input) => handle_git_run_stacked_action(input, state).await,
        RpcMethod::GitCreateDetachedWorktree(input) => {
            handle_git_create_detached_worktree(input, state).await
        }
        RpcMethod::GitPreparePullRequestThread(input) => {
            handle_git_prepare_pull_request_thread(input, state).await
        }
        RpcMethod::GitResolvePullRequestResult(input) => {
            handle_git_resolve_pull_request_result(input, state).await
        }
        RpcMethod::GitHandoffThread(input) => handle_git_handoff_thread(input, state).await,
    }
}

async fn handle_thread_list(state: &Arc<RpcState>) -> Result<Value> {
    // Get all projects first, then list threads
    let project_repo = ProjectRepository::new(state.orchestration.db.pool().clone());
    let projects = ProjectRepositoryTrait::list(&project_repo).await?;

    let mut all_threads = Vec::new();
    for project in projects {
        let threads = state.orchestration.list_threads(project.id.0).await?;
        all_threads.extend(threads);
    }

    serde_json::to_value(all_threads).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_thread_get(
    thread_id: remi_contracts::ThreadId,
    state: &Arc<RpcState>,
) -> Result<Value> {
    let thread = state
        .orchestration
        .get_thread(thread_id)
        .await?
        .ok_or_else(|| Error::Orchestration(format!("Thread not found: {}", thread_id)))?;

    serde_json::to_value(thread).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_thread_create(
    project_id: uuid::Uuid,
    title: Option<String>,
    state: &Arc<RpcState>,
) -> Result<Value> {
    use remi_contracts::OrchestrationCommand;

    let command = OrchestrationCommand::CreateThread { project_id, title };
    state.orchestration.handle_command(command).await?;

    // Return success
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_thread_delete(
    thread_id: remi_contracts::ThreadId,
    state: &Arc<RpcState>,
) -> Result<Value> {
    use remi_contracts::OrchestrationCommand;

    let command = OrchestrationCommand::DeleteThread { thread_id };
    state.orchestration.handle_command(command).await?;

    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_thread_list_messages(
    thread_id: remi_contracts::ThreadId,
    state: &Arc<RpcState>,
) -> Result<Value> {
    let thread_repo = ThreadRepository::new(state.orchestration.db.pool().clone());
    let messages = ThreadRepositoryTrait::list_messages(&thread_repo, thread_id).await?;

    serde_json::to_value(messages).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_thread_list_turns(
    thread_id: remi_contracts::ThreadId,
    state: &Arc<RpcState>,
) -> Result<Value> {
    let thread_repo = ThreadRepository::new(state.orchestration.db.pool().clone());
    let turns = ThreadRepositoryTrait::list_turns(&thread_repo, thread_id).await?;

    serde_json::to_value(turns).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_thread_send_message(
    input: remi_contracts::ThreadSendMessageInput,
    state: &Arc<RpcState>,
) -> Result<Value> {
    use remi_contracts::ThreadSendMessageOutput;

    let (user_message, assistant_message) = state
        .orchestration
        .handle_send_message(input.thread_id, &input.content)
        .await?;

    let output = ThreadSendMessageOutput {
        user_message,
        assistant_message: Some(assistant_message),
    };

    serde_json::to_value(output).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_filesystem_browse(
    input: remi_contracts::FilesystemBrowseInput,
    state: &Arc<RpcState>,
) -> Result<Value> {
    let result = state
        .workspace
        .browse(&input.path, input.include_hidden, input.max_depth)
        .await?;

    serde_json::to_value(result).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_git_status(
    input: remi_contracts::GitStatusInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    let result = remi_git::GitService::status(&input.repo_path).await?;

    serde_json::to_value(result).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_git_list_branches(
    input: remi_contracts::GitListBranchesInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    let result =
        remi_git::GitService::list_branches(&input.repo_path, input.include_remote).await?;

    serde_json::to_value(result).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_git_init(
    input: remi_contracts::GitInitInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::init(&input.path).await?;
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_checkout(
    input: remi_contracts::GitCheckoutInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::checkout(&input.repo_path, &input.target, input.create_branch).await?;
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_create_branch(
    input: remi_contracts::GitCreateBranchInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    let result = remi_git::GitService::create_branch(
        &input.repo_path,
        &input.branch_name,
        input.base.as_deref(),
        input.checkout,
    )
    .await?;

    serde_json::to_value(result).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_git_pull(
    input: remi_contracts::GitPullInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::pull(&input.repo_path, input.remote.as_deref(), input.branch.as_deref())
        .await?;
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_read_working_tree_diff(
    input: remi_contracts::GitReadWorkingTreeDiffInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    let diff = remi_git::GitService::read_working_tree_diff(
        &input.repo_path,
        input.file_path.as_deref(),
        input.include_staged,
    )
    .await?;

    Ok(serde_json::json!({
        "diff": diff
    }))
}

async fn handle_git_remove_index_lock(
    input: remi_contracts::GitRemoveIndexLockInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::remove_index_lock(&input.repo_path).await?;
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_stash_info(
    input: remi_contracts::GitStashInfoInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    let stashes = remi_git::GitService::stash_info(&input.repo_path).await?;
    Ok(serde_json::json!({
        "stashes": stashes
    }))
}

async fn handle_git_stash_drop(
    input: remi_contracts::GitStashDropInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::stash_drop(&input.repo_path, input.index).await?;
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_create_worktree(
    input: remi_contracts::GitCreateWorktreeInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::create_worktree(
        &input.repo_path,
        &input.worktree_path,
        &input.branch_name,
    )
    .await?;
    Ok(serde_json::json!({
        "worktree_path": input.worktree_path,
        "branch_name": input.branch_name
    }))
}

async fn handle_git_remove_worktree(
    input: remi_contracts::GitRemoveWorktreeInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::remove_worktree(&input.repo_path, &input.worktree_path, input.force)
        .await?;
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_summarize_diff(
    input: remi_contracts::GitSummarizeDiffInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // Parse diff to extract stats
    let mut files_changed = 0u32;
    let mut insertions = 0u32;
    let mut deletions = 0u32;

    for line in input.diff.lines() {
        if line.starts_with("diff --git") {
            files_changed += 1;
        } else if line.starts_with('+') && !line.starts_with("+++") {
            insertions += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            deletions += 1;
        }
    }

    // Generate a simple summary
    let summary = format!(
        "Changed {} file(s) with {} insertion(s) and {} deletion(s)",
        files_changed, insertions, deletions
    );

    Ok(serde_json::json!({
        "summary": summary,
        "files_changed": files_changed,
        "insertions": insertions,
        "deletions": deletions
    }))
}

async fn handle_auth_bootstrap(
    _input: remi_contracts::AuthBootstrapInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // For now, return a simple token
    // In a full implementation, this would integrate with the auth service
    Ok(serde_json::json!({
        "session_token": format!("session-{}", uuid::Uuid::new_v4()),
        "expires_at": chrono::Utc::now()
            .checked_add_signed(chrono::Duration::hours(24))
            .unwrap()
            .to_rfc3339()
    }))
}

async fn handle_auth_create_pairing_credential(
    _input: remi_contracts::AuthCreatePairingCredentialInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    let pairing_code = uuid::Uuid::new_v4().to_string()[..8].to_uppercase();
    let pairing_link = format!("remi-code://pair?code={}", pairing_code);

    Ok(serde_json::json!({
        "pairing_code": pairing_code,
        "pairing_link": pairing_link,
        "expires_at": chrono::Utc::now()
            .checked_add_signed(chrono::Duration::minutes(10))
            .unwrap()
            .to_rfc3339()
    }))
}

async fn handle_auth_revoke_pairing_link(_state: &Arc<RpcState>) -> Result<Value> {
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_auth_revoke_client_session(_state: &Arc<RpcState>) -> Result<Value> {
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_editor_open(
    input: remi_contracts::OpenInEditorInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // In a full implementation, this would open the file in the configured editor
    info!("Opening file in editor: {}", input.path);
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_stash_and_checkout(
    input: remi_contracts::GitStashAndCheckoutInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // Stash current changes
    remi_git::GitService::stash_save(&input.repo_path, input.message.as_deref())
        .await?;

    // Checkout target branch
    remi_git::GitService::checkout(&input.repo_path, &input.branch, false).await?;

    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_run_stacked_action(
    input: remi_contracts::GitRunStackedActionInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // Execute stacked action (e.g., rebase, merge, etc.)
    info!("Running stacked action: {} in {}", input.action, input.repo_path);
    Ok(serde_json::json!({"status": "ok"}))
}

async fn handle_git_create_detached_worktree(
    input: remi_contracts::GitCreateDetachedWorktreeInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::create_detached_worktree(
        &input.repo_path,
        &input.worktree_path,
        &input.commit_sha,
    )
    .await?;

    Ok(serde_json::json!({
        "worktree_path": input.worktree_path
    }))
}

async fn handle_git_prepare_pull_request_thread(
    input: remi_contracts::GitPreparePullRequestThreadInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // In a full implementation, this would create a PR
    info!(
        "Preparing PR: {} -> {} in {}",
        input.head_branch, input.base_branch, input.repo_path
    );

    Ok(serde_json::json!({
        "pr_number": 1,
        "pr_url": format!("{}/pull/1", input.repo_path)
    }))
}

async fn handle_git_resolve_pull_request_result(
    input: remi_contracts::GitResolvePullRequestResult,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // In a full implementation, this would check PR status
    info!("Resolving PR #{} in {}", input.pr_number, input.repo_path);
    Ok(serde_json::json!({"status": "merged"}))
}

async fn handle_git_handoff_thread(
    input: remi_contracts::GitHandoffThreadInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    // In a full implementation, this would hand off the thread to a new worktree
    info!(
        "Handing off thread {} to {}",
        input.thread_id, input.worktree_path
    );

    Ok(serde_json::json!({
        "new_thread_id": uuid::Uuid::new_v4()
    }))
}
