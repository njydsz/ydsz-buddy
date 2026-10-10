pub mod pairing;
pub mod push;
pub mod rpc_methods;

use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// 编排命令类型（来自 ydsz-core）
use ydsz_core::commands::OrchestrationCommand;

// ===== Bootstrap =====

/// Bootstrap result containing all initialized services
#[derive(Debug, Clone)]
pub struct BootstrapResult {
    pub services: ServiceContainer,
}

/// Service container holding all server services
#[derive(Debug, Clone)]
pub struct ServiceContainer {
    pub ws_server: Arc<WebSocketServer>,
    pub ssh_pool: Arc<SshConnectionPool>,
    pub goal_engine: Arc<GoalEngine>,
    pub model_registry: Arc<ModelRegistry>,
    pub mobile_push_dispatcher: Arc<push::MobilePushDispatcher>,
    pub orchestration_engine: Arc<OrchestrationEngine>,
    pub scheduler_jobs_state: Arc<SchedulerJobsState>,
}

// ===== WebSocket / SSH / ModelRegistry (stubs, unchanged contract) =====

/// WebSocket server stub
#[derive(Debug, Clone)]
pub struct WebSocketServer;

impl WebSocketServer {
    pub fn new() -> Self { Self }
    pub async fn start(&self) -> Result<()> { Ok(()) }
}

impl Default for WebSocketServer {
    fn default() -> Self { Self::new() }
}

/// SSH connection pool stub
#[derive(Debug, Clone)]
pub struct SshConnectionPool;

impl SshConnectionPool {
    pub fn new() -> Self { Self }
    pub async fn create_connection(&self, _config: ydsz_shared::ssh::SshConfig) -> Result<String> {
        Ok("stub-connection-id".to_string())
    }
    pub async fn get_connection(&self, _id: &str) -> Option<std::sync::Arc<ydsz_shared::ssh::SshConnection>> {
        None
    }
    pub async fn get(&self, _id: &str) -> std::result::Result<ydsz_shared::ssh::SshConnection, String> {
        Err("not found".to_string())
    }
    pub async fn disconnect(&self, _id: &str) -> std::result::Result<(), String> {
        Ok(())
    }
    pub async fn close_connection(&self, _id: &str) -> Result<()> {
        Ok(())
    }
    pub async fn list_connections(&self) -> Vec<SshConnectionInfo> {
        vec![]
    }
}

/// SSH connection info for listing
#[derive(Debug, Clone)]
pub struct SshConnectionInfo {
    pub connection_id: String,
    pub state: ydsz_shared::ssh::ConnectionState,
    pub host: String,
    pub port: u16,
    pub username: String,
}

impl Default for SshConnectionPool {
    fn default() -> Self { Self::new() }
}

// ===== Goal Engine (unchanged) =====

/// Goal engine stub
pub mod goal {
    use serde::{Serialize, Deserialize};
    
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct GoalContext {
        pub goal_id: String,
        pub thread_id: String,
        pub description: String,
        pub status: GoalStatus,
        pub progress_percent: u8,
        pub current_task: Option<String>,
        pub completed_tasks: Vec<String>,
        pub started_at: chrono::DateTime<chrono::Utc>,
        pub updated_at: chrono::DateTime<chrono::Utc>,
    }
    
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
    pub enum GoalStatus {
        Running,
        Achieved,
        Aborted,
    }
}

#[derive(Debug, Clone)]
pub struct GoalEngine;

impl GoalEngine {
    pub fn new() -> Self { Self }
    pub async fn start_goal(&self, _thread_id: String, _description: String) -> std::result::Result<String, String> {
        Ok("stub-goal-id".to_string())
    }
    pub async fn abort_goal(&self, _goal_id: String, _reason: String) -> std::result::Result<(), String> {
        Ok(())
    }
    pub fn list_active_goals(&self) -> Vec<goal::GoalContext> {
        vec![]
    }
    pub fn get_goal(&self, _goal_id: &str) -> Option<goal::GoalContext> {
        None
    }
    pub fn cleanup_finished_goals(&self) {}
}

impl Default for GoalEngine {
    fn default() -> Self { Self::new() }
}

/// Model registry stub
#[derive(Debug, Clone)]
pub struct ModelRegistry;

impl ModelRegistry {
    pub fn new() -> Self { Self }
}

impl Default for ModelRegistry {
    fn default() -> Self { Self::new() }
}

// ===== Scheduler =====

/// Scheduled job status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScheduledJobStatus {
    Active,
    Paused,
}

/// Internal scheduled job record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledJob {
    pub task_id: String,
    pub thread_id: String,
    pub cron_expression: String,
    pub prompt: String,
    pub enabled: bool,
    pub created_at: String,
    pub last_fired_at: Option<String>,
    pub next_fire_at: Option<String>,
}

/// DTO for Tauri commands (camelCase for JSON / TSspecta compat)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJobDto {
    pub task_id: String,
    pub thread_id: String,
    pub cron_expression: String,
    pub prompt: String,
    pub enabled: bool,
    pub created_at: String,
    pub last_fired_at: Option<String>,
    pub next_fire_at: Option<String>,
}

impl From<ScheduledJob> for ScheduledJobDto {
    fn from(job: ScheduledJob) -> Self {
        Self {
            task_id: job.task_id,
            thread_id: job.thread_id,
            cron_expression: job.cron_expression,
            prompt: job.prompt,
            enabled: job.enabled,
            created_at: job.created_at,
            last_fired_at: job.last_fired_at,
            next_fire_at: job.next_fire_at,
        }
    }
}

/// In-memory scheduled jobs state
#[derive(Debug, Clone)]
pub struct SchedulerJobsState {
    jobs: Arc<Mutex<HashMap<String, ScheduledJob>>>,
}

impl SchedulerJobsState {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn list(&self, thread_id: Option<&str>) -> Vec<ScheduledJobDto> {
        let jobs = self.jobs.lock();
        let mut result: Vec<ScheduledJobDto> = jobs
            .values()
            .filter(|j| thread_id.map_or(true, |tid| j.thread_id == tid))
            .cloned()
            .map(ScheduledJobDto::from)
            .collect();
        result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        result
    }

    pub fn insert(&self, job: ScheduledJob) {
        self.jobs.lock().insert(job.task_id.clone(), job);
    }

    pub fn get(&self, task_id: &str) -> Option<ScheduledJobDto> {
        self.jobs.lock().get(task_id).cloned().map(ScheduledJobDto::from)
    }

    pub fn update_fields(&self, task_id: &str, cron_expression: Option<&str>, prompt: Option<&str>) -> bool {
        let mut jobs = self.jobs.lock();
        if let Some(job) = jobs.get_mut(task_id) {
            if let Some(cron) = cron_expression {
                job.cron_expression = cron.to_string();
                job.next_fire_at = compute_next_fire_at(cron);
            }
            if let Some(p) = prompt {
                job.prompt = p.to_string();
            }
            true
        } else {
            false
        }
    }

    pub fn set_enabled(&self, task_id: &str, enabled: bool) -> bool {
        let mut jobs = self.jobs.lock();
        if let Some(job) = jobs.get_mut(task_id) {
            job.enabled = enabled;
            true
        } else {
            false
        }
    }

    pub fn delete(&self, task_id: &str) -> bool {
        self.jobs.lock().remove(task_id).is_some()
    }

    pub fn trigger(&self, task_id: &str) -> Option<String> {
        let mut jobs = self.jobs.lock();
        if let Some(job) = jobs.get_mut(task_id) {
            let now = chrono::Utc::now().to_rfc3339();
            job.last_fired_at = Some(now);
            Some(job.prompt.clone())
        } else {
            None
        }
    }

    pub fn is_empty(&self) -> bool {
        self.jobs.lock().is_empty()
    }
}

impl Default for SchedulerJobsState {
    fn default() -> Self {
        Self::new()
    }
}

/// Compute next fire time from CRON expression (returns ISO 8601 string)
fn compute_next_fire_at(cron_expression: &str) -> Option<String> {
    use croner::Cron;
    let cron = Cron::new(cron_expression).parse().ok()?;
    // croner: find_next_occurrence returns Result → convert to Option via .ok()
    cron.find_next_occurrence(&chrono::Utc::now(), false)
        .ok()
        .map(|dt| dt.to_rfc3339())
}

// ===== Orchestration Engine =====

/// Orchestration engine — dispatches CQRS-style commands
#[derive(Debug, Clone)]
pub struct OrchestrationEngine {
    pub scheduler_state: Arc<SchedulerJobsState>,
}

impl OrchestrationEngine {
    pub fn new(scheduler_state: Arc<SchedulerJobsState>) -> Self {
        Self { scheduler_state }
    }

    /// Dispatch a JSON-encoded OrchestrationCommand.
    ///
    /// Tauri command handlers serialize `OrchestrationCommand` (a tagged enum)
    /// to JSON and pass them through this central router.  We deserialize back
    /// into the enum and match on the variant directly — this is more reliable
    /// than matching on the optional `command_id` field which is `None` by default
    /// for all scheduler commands from Tauri.
    pub async fn dispatch(&self, command_json: &str) -> Result<String> {
        // First, get the command_id to route correctly
        let cmd: OrchestrationCommand =
            serde_json::from_str(command_json)
                .map_err(|e| anyhow::anyhow!("Failed to parse orchestration command: {}", e))?;

        match cmd {
            // ---- SchedulerTask* commands ----
            OrchestrationCommand::SchedulerTaskCreate(c) => {
                let now = chrono::Utc::now().to_rfc3339();
                let next_fire_at = compute_next_fire_at(&c.cron_expression);
                let job = ScheduledJob {
                    task_id: c.task_id,
                    thread_id: c.thread_id.to_string(),
                    cron_expression: c.cron_expression,
                    prompt: c.prompt,
                    enabled: c.enabled,
                    created_at: now,
                    last_fired_at: None,
                    next_fire_at,
                };
                self.scheduler_state.insert(job);
                Ok("ok".to_string())
            }
            OrchestrationCommand::SchedulerTaskUpdate(c) => {
                let cron = c.cron_expression.as_deref();
                let prompt = c.prompt.as_deref();
                let ok = self.scheduler_state.update_fields(&c.task_id, cron, prompt);
                if ok {
                    Ok("ok".to_string())
                } else {
                    anyhow::bail!("Task not found: {}", c.task_id)
                }
            }
            OrchestrationCommand::SchedulerTaskDelete(c) => {
                let ok = self.scheduler_state.delete(&c.task_id);
                if ok {
                    Ok("ok".to_string())
                } else {
                    anyhow::bail!("Task not found: {}", c.task_id)
                }
            }
            OrchestrationCommand::SchedulerTaskSetEnabled(c) => {
                let ok = self.scheduler_state.set_enabled(&c.task_id, c.enabled);
                if ok {
                    Ok("ok".to_string())
                } else {
                    anyhow::bail!("Task not found: {}", c.task_id)
                }
            }
            OrchestrationCommand::SchedulerTaskTrigger(c) => {
                let prompt = self.scheduler_state.trigger(&c.task_id);
                match prompt {
                    Some(p) => Ok(p),
                    None => anyhow::bail!("Task not found: {}", c.task_id),
                }
            }
            OrchestrationCommand::SchedulerTaskList(c) => {
                let thread_id = c.thread_id.map(|t| t.to_string());
                let jobs = self.scheduler_state.list(thread_id.as_deref());
                let json = serde_json::to_string(&jobs)?;
                Ok(json)
            }

            // ---- Fallback: thread / project / other commands return stub ----
            other => {
                tracing::warn!(?other, "Unhandled orchestration command, returning stub");
                Ok("stub".to_string())
            }
        }
    }
}

impl Default for OrchestrationEngine {
    fn default() -> Self {
        Self::new(Arc::new(SchedulerJobsState::new()))
    }
}

// ===== Re-exports for Tauri and external callers =====

pub use goal::{GoalContext, GoalStatus};

// ===== Bootstrap function =====

/// Bootstrap the embedded server with all services
pub async fn bootstrap_embedded(config: ydsz_shared::config::ServerConfig) -> Result<BootstrapResult> {
    let _ = config;
    let scheduler_state = Arc::new(SchedulerJobsState::new());
    let services = ServiceContainer {
        ws_server: Arc::new(WebSocketServer::new()),
        ssh_pool: Arc::new(SshConnectionPool::new()),
        goal_engine: Arc::new(GoalEngine::new()),
        model_registry: Arc::new(ModelRegistry::new()),
        mobile_push_dispatcher: Arc::new(push::MobilePushDispatcher::new()),
        orchestration_engine: Arc::new(OrchestrationEngine::new(scheduler_state.clone())),
        scheduler_jobs_state: scheduler_state.clone(),
    };
    Ok(BootstrapResult { services })
}

/// Voice transcription IPC stub
pub async fn ipc_voice_transcribe(request: serde_json::Value) -> Result<serde_json::Value> {
    let _ = request;
    Ok(serde_json::json!({
        "text": "",
        "confidence": 0.0,
        "language": "unknown"
    }))
}
