// ! ACP Tauri Commands
// !
// ! Provides Tauri commands for starting/stopping ACP stdio server and delegating tasks.

use tauri::State;
use crate::acp::AcpManagerState;

/// Start the ACP stdio server.
// !
/// Enables IDE Agents to communicate with ydsz-buddy via stdio.
#[tauri::command]
#[specta::specta]
pub async fn acp_start_server(
    state: State<'_, AcpManagerState>,
    provider_id: String,
) -> Result<String, String> {
    let _ = provider_id;
    state.start_server()
}

/// Stop the ACP stdio server.
#[tauri::command]
#[specta::specta]
pub async fn acp_stop_server(
    state: State<'_, AcpManagerState>,
) -> Result<(), String> {
    state.stop_server()
}

/// Get ACP server status.
#[tauri::command]
#[specta::specta]
pub async fn acp_server_status(
    state: State<'_, AcpManagerState>,
) -> crate::acp::types::AcpServerStatus {
    state.server_status()
}

/// Delegate a task to an external agent (outbound).
// !
/// Sends a task to an external Agent runner (Code CLI / Claude Code).
/// First version is a skeleton that validates inputs and returns a placeholder.
#[tauri::command]
#[specta::specta]
pub async fn acp_delegate_task(
    state: State<'_, AcpManagerState>,
    agent_id: String,
    task: String,
) -> Result<String, String> {
    let _ = state;
    if agent_id.is_empty() {
        return Err("agent_id cannot be empty".to_string());
    }
    if task.is_empty() {
        return Err("task cannot be empty".to_string());
    }
    Ok(format!("Task delegated to {}: {}", agent_id, task.chars().take(80).collect::<String>()))
}
