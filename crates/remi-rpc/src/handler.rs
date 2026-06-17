//! RPC request handler.

use remi_contracts::RpcMethod;
use remi_core::{Error, Result};
use remi_orchestration::OrchestrationEngine;
use remi_persistence::repositories::{ProjectRepository, ThreadRepository};
use remi_persistence::repositories::project_repo::ProjectRepositoryTrait;
use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
use remi_providers::ProviderRegistry;
use remi_workspace::WorkspaceService;
use serde_json::Value;
use std::sync::Arc;
use tracing::{error, info};

use crate::WsState;

/// Application state for RPC handlers.
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
        RpcMethod::FilesystemBrowse(input) => handle_filesystem_browse(input, state).await,
        RpcMethod::GitStatus(input) => handle_git_status(input, state).await,
        RpcMethod::GitListBranches(input) => handle_git_list_branches(input, state).await,
        RpcMethod::GitInit(input) => handle_git_init(input, state).await,
        _ => {
            error!("Unimplemented RPC method: {}", method);
            Err(Error::Internal(format!("Method not implemented: {}", method)))
        }
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

async fn handle_filesystem_browse(
    input: remi_contracts::FilesystemBrowseInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    let result = _state
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
    let result = remi_git::GitService::list_branches(&input.repo_path, input.include_remote).await?;

    serde_json::to_value(result).map_err(|e| Error::Serialization(e.to_string()))
}

async fn handle_git_init(
    input: remi_contracts::GitInitInput,
    _state: &Arc<RpcState>,
) -> Result<Value> {
    remi_git::GitService::init(&input.path).await?;
    Ok(serde_json::json!({"status": "ok"}))
}
