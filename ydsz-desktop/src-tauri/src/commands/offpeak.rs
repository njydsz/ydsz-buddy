//! Off-Peak Task Scheduling (P1-3)
//!
//! Schedule long-running tasks during off-peak hours (22:00-06:00)
//! to save API costs and avoid disrupting the user's normal workflow.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// Off-peak task definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OffPeakTask {
    pub id: String,
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub cron_expression: String,
    pub enabled: bool,
    pub run_during_offpeak: bool,
    pub last_run_at: Option<String>,
    pub last_status: Option<String>,
    pub created_at: String,
}

/// Off-peak time range configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OffPeakConfig {
    pub enabled: bool,
    pub start_hour: u8,
    pub end_hour: u8,
    pub timezone: String,
    pub max_concurrent: usize,
    pub auto_retry: bool,
    pub retry_count: u32,
}

impl Default for OffPeakConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            start_hour: 22,
            end_hour: 6,
            timezone: "local".to_string(),
            max_concurrent: 2,
            auto_retry: true,
            retry_count: 3,
        }
    }
}

/// Off-peak state
pub struct OffPeakState {
    pub tasks: Mutex<HashMap<String, OffPeakTask>>,
    pub config: Mutex<OffPeakConfig>,
    pub pending_queue: Mutex<Vec<String>>,
    pub is_offpeak_now: Mutex<bool>,
}

impl OffPeakState {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            config: Mutex::new(OffPeakConfig::default()),
            pending_queue: Mutex::new(Vec::new()),
            is_offpeak_now: Mutex::new(false),
        }
    }
}

impl Default for OffPeakState {
    fn default() -> Self {
        Self::new()
    }
}

/// Create an off-peak task
#[derive(Debug, Deserialize)]
pub struct CreateOffPeakTaskRequest {
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub cron_expression: String,
    pub run_during_offpeak: Option<bool>,
}

/// List all off-peak tasks
#[tauri::command]
pub fn offpeak_task_list(state: State<'_, OffPeakState>) -> Result<Vec<OffPeakTask>, String> {
    let tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    Ok(tasks.values().cloned().collect())
}

/// Create an off-peak task
#[tauri::command]
pub fn offpeak_task_create(
    state: State<'_, OffPeakState>,
    request: CreateOffPeakTaskRequest,
) -> Result<OffPeakTask, String> {
    let mut tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let task = OffPeakTask {
        id: id.clone(),
        name: request.name,
        description: request.description,
        prompt: request.prompt,
        cron_expression: request.cron_expression,
        enabled: true,
        run_during_offpeak: request.run_during_offpeak.unwrap_or(true),
        last_run_at: None,
        last_status: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    tasks.insert(id, task.clone());
    Ok(task)
}

/// Toggle task enabled/disabled
#[tauri::command]
pub fn offpeak_task_toggle(
    state: State<'_, OffPeakState>,
    task_id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.enabled = enabled;
        Ok(())
    } else {
        Err("Task not found".to_string())
    }
}

/// Delete a task
#[tauri::command]
pub fn offpeak_task_delete(
    state: State<'_, OffPeakState>,
    task_id: String,
) -> Result<(), String> {
    let mut tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    tasks.remove(&task_id);
    Ok(())
}

/// Get off-peak configuration
#[tauri::command]
pub fn offpeak_get_config(state: State<'_, OffPeakState>) -> Result<OffPeakConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

/// Update off-peak configuration
#[tauri::command]
pub fn offpeak_set_config(
    state: State<'_, OffPeakState>,
    config: OffPeakConfig,
) -> Result<(), String> {
    let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
    *cfg = config;
    Ok(())
}

/// Check if we are currently in off-peak hours
#[tauri::command]
pub fn offpeak_is_active(state: State<'_, OffPeakState>) -> Result<bool, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    if !config.enabled {
        return Ok(false);
    }
    let is_offpeak = offpeak_check_time(config.start_hour, config.end_hour);
    Ok(is_offpeak)
}

/// Manually trigger a task (bypasses off-peak check)
#[tauri::command]
pub fn offpeak_task_trigger(
    state: State<'_, OffPeakState>,
    task_id: String,
) -> Result<String, String> {
    let tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get(&task_id) {
        if !task.enabled {
            return Err("Task is disabled".to_string());
        }
        return Ok(task.prompt.clone());
    }
    Err("Task not found".to_string())
}

/// Poll for tasks that should run now
#[tauri::command]
pub fn offpeak_poll_due_tasks(state: State<'_, OffPeakState>) -> Result<Vec<OffPeakTask>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let is_offpeak = if config.enabled {
        offpeak_check_time(config.start_hour, config.end_hour)
    } else {
        true // If off-peak mode disabled, always allow
    };
    drop(config);

    let tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    let due_tasks: Vec<OffPeakTask> = tasks
        .values()
        .filter(|t| {
            t.enabled
                && (!t.run_during_offpeak || is_offpeak)
                && t.last_run_at.is_none() // Simple: not yet run
        })
        .cloned()
        .collect();

    Ok(due_tasks)
}

/// Mark task as run
#[tauri::command]
pub fn offpeak_task_mark_run(
    state: State<'_, OffPeakState>,
    task_id: String,
    status: String,
) -> Result<(), String> {
    let mut tasks = state.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.last_run_at = Some(chrono::Utc::now().to_rfc3339());
        task.last_status = Some(status);
        Ok(())
    } else {
        Err("Task not found".to_string())
    }
}

/// Check if current time is within off-peak hours
fn offpeak_check_time(start_hour: u8, end_hour: u8) -> bool {
    use chrono::Timelike;
    let now = chrono::Local::now().hour() as u8;
    if start_hour <= end_hour {
        now >= start_hour && now < end_hour
    } else {
        // Wraps midnight (e.g., 22:00 - 06:00)
        now >= start_hour || now < end_hour
    }
}
