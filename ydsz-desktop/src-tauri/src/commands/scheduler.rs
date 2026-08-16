//! # 定时任务调度命令模块
//!
//! 提供与定时任务（ScheduledJob）相关的 Tauri 命令，通过编排引擎的 dispatch 方法
//! 发送 OrchestrationCommand 来驱动定时任务的创建、更新、删除、启停和触发。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `scheduler_task_create` | 创建定时任务 |
//! | `scheduler_task_update` | 更新定时任务的 CRON 表达式和 prompt |
//! | `scheduler_task_delete` | 删除定时任务 |
//! | `scheduler_task_set_enabled` | 启用/禁用定时任务 |
//! | `scheduler_task_trigger` | 立即触发定时任务 |
//! | `scheduler_task_list` | 列出指定线程的定时任务 |

use tauri::State;
use tracing::info;

use ydsz_core::commands::{
    OrchestrationCommand, SchedulerTaskCreateCommand, SchedulerTaskDeleteCommand,
    SchedulerTaskListCommand, SchedulerTaskSetEnabledCommand, SchedulerTaskTriggerCommand,
    SchedulerTaskUpdateCommand,
};
use ydsz_core::models::ThreadId;

use crate::ServerState;

/// 创建定时任务
///
/// 为指定线程创建一个新的定时任务，生成新的 task_id 并通过编排引擎分发命令。
///
/// # 参数
///
/// - `state`: 服务器状态（包含编排引擎引用）
/// - `thread_id`: 关联的对话线程 ID
/// - `cron_expression`: CRON 表达式（如 `0 * * * * *`）
/// - `prompt`: 触发时发送的 prompt 文本
/// - `enabled`: 是否启用
///
/// # 返回值
///
/// - `Ok(String)`: 创建成功，返回生成的 task_id
/// - `Err(String)`: 创建失败
#[tauri::command]
#[specta::specta]
pub async fn scheduler_task_create(
    state: State<'_, ServerState>,
    thread_id: String,
    cron_expression: String,
    prompt: String,
    enabled: bool,
) -> Result<String, String> {
    let thread_id = ThreadId::parse_str(&thread_id).map_err(|e| e.to_string())?;
    let task_id = uuid::Uuid::new_v4().to_string();

    info!(task_id = %task_id, thread_id = %thread_id, "创建定时任务");

    let command = OrchestrationCommand::SchedulerTaskCreate(SchedulerTaskCreateCommand {
        command_id: None,
        task_id: task_id.clone(),
        thread_id,
        cron_expression,
        prompt,
        enabled,
    });

    state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(task_id)
}

/// 更新定时任务
///
/// 更新指定任务的 CRON 表达式和/或 prompt 文本。
///
/// # 参数
///
/// - `state`: 服务器状态
/// - `task_id`: 要更新的任务 ID
/// - `cron_expression`: 新的 CRON 表达式（可选）
/// - `prompt`: 新的 prompt 文本（可选）
///
/// # 返回值
///
/// - `Ok(())`: 更新成功
/// - `Err(String)`: 更新失败
#[tauri::command]
#[specta::specta]
pub async fn scheduler_task_update(
    state: State<'_, ServerState>,
    task_id: String,
    cron_expression: Option<String>,
    prompt: Option<String>,
) -> Result<(), String> {
    info!(task_id = %task_id, "更新定时任务");

    let command = OrchestrationCommand::SchedulerTaskUpdate(SchedulerTaskUpdateCommand {
        command_id: None,
        task_id,
        cron_expression,
        prompt,
    });

    state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除定时任务
///
/// 删除指定的定时任务。
///
/// # 参数
///
/// - `state`: 服务器状态
/// - `task_id`: 要删除的任务 ID
///
/// # 返回值
///
/// - `Ok(())`: 删除成功
/// - `Err(String)`: 删除失败
#[tauri::command]
#[specta::specta]
pub async fn scheduler_task_delete(
    state: State<'_, ServerState>,
    task_id: String,
) -> Result<(), String> {
    info!(task_id = %task_id, "删除定时任务");

    let command = OrchestrationCommand::SchedulerTaskDelete(SchedulerTaskDeleteCommand {
        command_id: None,
        task_id,
    });

    state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 启用/禁用定时任务
///
/// 设置指定任务是启用还是禁用。
///
/// # 参数
///
/// - `state`: 服务器状态
/// - `task_id`: 任务 ID
/// - `enabled`: 是否启用
///
/// # 返回值
///
/// - `Ok(())`: 设置成功
/// - `Err(String)`: 设置失败
#[tauri::command]
#[specta::specta]
pub async fn scheduler_task_set_enabled(
    state: State<'_, ServerState>,
    task_id: String,
    enabled: bool,
) -> Result<(), String> {
    info!(task_id = %task_id, enabled, "设置定时任务启用状态");

    let command = OrchestrationCommand::SchedulerTaskSetEnabled(SchedulerTaskSetEnabledCommand {
        command_id: None,
        task_id,
        enabled,
    });

    state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 立即触发定时任务
///
/// 手动触发指定任务，不等待 CRON 表达式的下一次匹配时间。
///
/// # 参数
///
/// - `state`: 服务器状态
/// - `task_id`: 要触发的任务 ID
///
/// # 返回值
///
/// - `Ok(())`: 触发成功
/// - `Err(String)`: 触发失败
#[tauri::command]
#[specta::specta]
pub async fn scheduler_task_trigger(
    state: State<'_, ServerState>,
    task_id: String,
) -> Result<(), String> {
    info!(task_id = %task_id, "手动触发定时任务");

    let command = OrchestrationCommand::SchedulerTaskTrigger(SchedulerTaskTriggerCommand {
        command_id: None,
        task_id,
    });

    state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 列出定时任务
///
/// 列出指定线程下的所有定时任务。通过编排引擎分发查询命令。
///
/// # 参数
///
/// - `state`: 服务器状态
/// - `thread_id`: 对话线程 ID
///
/// # 返回值
///
/// - `Ok(u64)`: 查询成功，返回当前事件序列号
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn scheduler_task_list(
    state: State<'_, ServerState>,
    thread_id: String,
) -> Result<u64, String> {
    let thread_id = ThreadId::parse_str(&thread_id).map_err(|e| e.to_string())?;

    info!(thread_id = %thread_id, "列出定时任务");

    let command = OrchestrationCommand::SchedulerTaskList(SchedulerTaskListCommand {
        command_id: None,
        thread_id: Some(thread_id),
    });

    let sequence = state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(command)
        .await
        .map_err(|e| e.to_string())?;

    Ok(sequence)
}
