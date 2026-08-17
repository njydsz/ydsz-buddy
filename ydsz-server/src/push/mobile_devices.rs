use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileDevice {
    pub device_token: String,
    pub alias: String,
    pub platform: String,
    pub last_heartbeat: String,
    pub registered_at: String,
}
