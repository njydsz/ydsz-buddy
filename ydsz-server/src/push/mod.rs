pub mod mobile_devices;

use std::collections::HashMap;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone)]
pub struct MobilePushDispatcher;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DispatcherConfig {
    pub jpush_app_key: Option<String>,
    pub jpush_master_secret: Option<String>,
    pub umeng_app_key: Option<String>,
    pub umeng_app_master_secret: Option<String>,
    pub dry_run: bool,
}

pub struct PushStore;

impl PushStore {
    pub async fn list_for_alias(&self, _alias: &str) -> Vec<mobile_devices::MobileDevice> { vec![] }
    pub async fn remove(&self, _alias: &str, _device_token: &str) -> bool { true }
    pub async fn cleanup_expired(&self, _max_age_ms: i64) -> usize { 0 }
}

impl MobilePushDispatcher {
    pub fn new() -> Self { Self }
    pub async fn dispatch_approval(&self, _alias: String, _title: String, _body: String, _deep_link: Option<String>, _approval_id: Option<String>) -> anyhow::Result<PushDispatchResult> {
        Ok(PushDispatchResult {
            dispatched: 0,
            total_devices: 0,
            device_results: vec![],
        })
    }
    pub async fn dispatch_task_update(&self, _alias: String, _task_id: String, _status: String, _message: String) -> anyhow::Result<PushDispatchResult> {
        Ok(PushDispatchResult {
            dispatched: 0,
            total_devices: 0,
            device_results: vec![],
        })
    }
    pub async fn dispatch(&self, _alias: &str, _message: &PushMessage) -> PushDispatchResult {
        PushDispatchResult {
            dispatched: 0,
            total_devices: 0,
            device_results: vec![],
        }
    }
    pub fn list_devices(&self, _alias: &str) -> Vec<mobile_devices::MobileDevice> { vec![] }
    pub fn unregister_device(&self, _alias: &str, _device_token: &str) -> bool { true }
    pub fn cleanup_expired_devices(&self, _max_age_days: u64) -> usize { 0 }
    pub fn is_dry_run(&self) -> bool { true }
    pub fn store(&self) -> PushStore { PushStore }
    pub fn config_status(&self) -> PushConfigStatus {
        PushConfigStatus { configured: false, provider: "none".to_string() }
    }
    pub fn current_config(&self) -> DispatcherConfig { DispatcherConfig::default() }
    pub fn update_config(&self, _config: DispatcherConfig) {}
    pub async fn test_jpush_connection(&self) -> Result<(), String> { Ok(()) }
    pub async fn test_umeng_connection(&self) -> Result<(), String> { Ok(()) }
}

impl Default for MobilePushDispatcher {
    fn default() -> Self { Self::new() }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushDispatchResult {
    pub dispatched: usize,
    pub total_devices: usize,
    pub device_results: Vec<PushDeviceResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushDeviceResult {
    pub device_token: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushMessage {
    pub title: String,
    pub subtitle: Option<String>,
    pub body: String,
    pub deep_link: Option<String>,
    pub payload: HashMap<String, serde_json::Value>,
    pub badge: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushConfigStatus {
    pub configured: bool,
    pub provider: String,
}
