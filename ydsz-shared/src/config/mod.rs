use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ServerConfig {
    pub ws_port: u16,
    pub enable_push: bool,
    pub enable_pairing: bool,
    pub pairing_secret: Option<String>,
    pub database_url: Option<String>,
    pub log_level: String,
}

impl ServerConfig {
    pub fn default_config() -> Self {
        Self {
            ws_port: 0, // random port
            enable_push: false,
            enable_pairing: false,
            pairing_secret: None,
            database_url: None,
            log_level: "info".to_string(),
        }
    }
}
