//! # 桌面端目标模式命令模块
//!
//! 提供 Goal Mode 的 Tauri 命令,前端通过 invoke 调用。
//! 底层通过嵌入式 ydsz-server 的 ServiceContainer 访问 GoalEngine。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `goal_start` | 启动长期目标 |
//! | `goal_abort` | 中止目标 |
//! | `goal_list_active` | 列出活跃目标 |
//! | `goal_get` | 获取目标详情 |
//! | `goal_cleanup` | 清理已完成目标 |

use serde::Serialize;
use tauri::State;
use tracing::info;

use crate::ServerState;

/// 目标状态
#[derive(Debug, Clone, Serialize, specta::Type)]
pub enum GoalStatusView {
    Running,
    Achieved,
    Aborted,
}

/// 目标上下文视图
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct GoalContextView {
    pub goal_id: String,
    pub thread_id: String,
    pub description: String,
    pub status: GoalStatusView,
    pub progress_percent: u8,
    pub current_task: Option<String>,
    pub completed_tasks: Vec<String>,
    pub started_at: String,
    pub updated_at: String,
}

/// 启动目标参数
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct StartGoalParams {
    pub thread_id: String,
    pub description: String,
}

/// 中止目标参数
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct AbortGoalParams {
    pub goal_id: String,
    #[serde(default = "default_abort_reason")]
    pub reason: String,
}

fn default_abort_reason() -> String {
    "用户手动中止".to_string()
}

/// 启动长期目标
#[tauri::command]
#[specta::specta]
pub async fn goal_start(
    params: StartGoalParams,
    _server: State<'_, ServerState>,
) -> Result<String, String> {
    info!(
        thread_id = %params.thread_id,
        description = %params.description,
        "桌面端: 启动目标"
    );

    let services = &_server.bootstrap_result.services;
    match services.goal_engine.start_goal(params.thread_id, params.description).await {
        Ok(goal_id) => {
            info!(goal_id = %goal_id, "目标已启动");
            Ok(goal_id)
        }
        Err(e) => {
            info!(error = %e, "启动目标失败");
            Err(e)
        }
    }
}

/// 中止目标
#[tauri::command]
#[specta::specta]
pub async fn goal_abort(
    params: AbortGoalParams,
    _server: State<'_, ServerState>,
) -> Result<(), String> {
    info!(goal_id = %params.goal_id, reason = %params.reason, "桌面端: 中止目标");

    let services = &_server.bootstrap_result.services;
    services.goal_engine.abort_goal(params.goal_id, params.reason).await
}

/// 列出活跃目标
#[tauri::command]
#[specta::specta]
pub async fn goal_list_active(
    _server: State<'_, ServerState>,
) -> Result<Vec<GoalContextView>, String> {
    let services = &_server.bootstrap_result.services;
    let goals = services.goal_engine.list_active_goals();
    let views = goals.iter().map(goal_to_view).collect();
    Ok(views)
}

/// 获取目标详情
#[tauri::command]
#[specta::specta]
pub async fn goal_get(
    goal_id: String,
    _server: State<'_, ServerState>,
) -> Result<GoalContextView, String> {
    let services = &_server.bootstrap_result.services;
    match services.goal_engine.get_goal(&goal_id) {
        Some(goal) => Ok(goal_to_view(&goal)),
        None => Err(format!("goal {} not found", goal_id)),
    }
}

/// 清理已完成目标
#[tauri::command]
#[specta::specta]
pub async fn goal_cleanup(
    _server: State<'_, ServerState>,
) -> Result<(), String> {
    let services = &_server.bootstrap_result.services;
    services.goal_engine.cleanup_finished_goals();
    Ok(())
}

fn goal_to_view(ctx: &ydsz_server::goal::GoalContext) -> GoalContextView {
    let status = match ctx.status {
        ydsz_server::goal::GoalStatus::Running => GoalStatusView::Running,
        ydsz_server::goal::GoalStatus::Achieved => GoalStatusView::Achieved,
        ydsz_server::goal::GoalStatus::Aborted => GoalStatusView::Aborted,
    };

    GoalContextView {
        goal_id: ctx.goal_id.clone(),
        thread_id: ctx.thread_id.clone(),
        description: ctx.description.clone(),
        status,
        progress_percent: ctx.progress_percent,
        current_task: ctx.current_task.clone(),
        completed_tasks: ctx.completed_tasks.clone(),
        started_at: ctx.started_at.to_rfc3339(),
        updated_at: ctx.updated_at.to_rfc3339(),
    }
}
