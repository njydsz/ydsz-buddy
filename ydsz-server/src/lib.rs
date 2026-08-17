pub mod pairing;
pub mod push;
pub mod rpc_methods;

use std::sync::Arc;
use serde::{Serialize, Deserialize};

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
}

/// WebSocket server stub
#[derive(Debug, Clone)]
pub struct WebSocketServer;

impl WebSocketServer {
    pub fn new() -> Self { Self }
    pub async fn start(&self) -> anyhow::Result<()> { Ok(()) }
}

impl Default for WebSocketServer {
    fn default() -> Self { Self::new() }
}

/// SSH connection pool stub
#[derive(Debug, Clone)]
pub struct SshConnectionPool;

impl SshConnectionPool {
    pub fn new() -> Self { Self }
    pub async fn create_connection(&self, _config: ydsz_shared::ssh::SshConfig) -> anyhow::Result<String> {
        Ok("stub-connection-id".to_string())
    }
    pub async fn get_connection(&self, _id: &str) -> Option<std::sync::Arc<ydsz_shared::ssh::SshConnection>> {
        None
    }
    pub async fn get(&self, _id: &str) -> anyhow::Result<ydsz_shared::ssh::SshConnection, String> {
        Err("not found".to_string())
    }
    pub async fn disconnect(&self, _id: &str) -> anyhow::Result<(), String> {
        Ok(())
    }
    pub async fn close_connection(&self, _id: &str) -> anyhow::Result<()> {
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
    pub async fn start_goal(&self, _thread_id: String, _description: String) -> Result<String, String> {
        Ok("stub-goal-id".to_string())
    }
    pub async fn abort_goal(&self, _goal_id: String, _reason: String) -> Result<(), String> {
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

/// Orchestration engine stub
#[derive(Debug, Clone)]
pub struct OrchestrationEngine;

impl OrchestrationEngine {
    pub fn new() -> Self { Self }
    pub async fn dispatch(&self, _task: &str) -> anyhow::Result<String> {
        Ok("stub".to_string())
    }
}

impl Default for OrchestrationEngine {
    fn default() -> Self { Self::new() }
}

/// Bootstrap the embedded server with all services
pub async fn bootstrap_embedded(config: ydsz_shared::config::ServerConfig) -> anyhow::Result<BootstrapResult> {
    let _ = config;
    let services = ServiceContainer {
        ws_server: Arc::new(WebSocketServer::new()),
        ssh_pool: Arc::new(SshConnectionPool::new()),
        goal_engine: Arc::new(GoalEngine::new()),
        model_registry: Arc::new(ModelRegistry::new()),
        mobile_push_dispatcher: Arc::new(push::MobilePushDispatcher::new()),
        orchestration_engine: Arc::new(OrchestrationEngine::new()),
    };
    Ok(BootstrapResult { services })
}

/// Voice transcription IPC stub
pub async fn ipc_voice_transcribe(request: serde_json::Value) -> anyhow::Result<serde_json::Value> {
    let _ = request;
    Ok(serde_json::json!({
        "text": "",
        "confidence": 0.0,
        "language": "unknown"
    }))
}
