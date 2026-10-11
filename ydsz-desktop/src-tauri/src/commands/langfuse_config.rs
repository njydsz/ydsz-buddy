//! Langfuse 可观测性集成（P1-5）
//!
//! 参考 Octop settings/langfuse.py 的三层架构：
//! - 存储层：settings 表 + secrets 表（secret_key 加密）
//! - API 层：GET/PUT/POST(test) 三个 Tauri 命令
//! - 运行时：热更新注入 agent_loop

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;
use rusqlite::Connection;

/// Langfuse 配置（不含 secret_key）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
pub struct LangfuseConfig {
    pub enabled: bool,
    pub public_key: String,
    pub base_url: String,       // 默认 https://cloud.langfuse.com
    pub project_id: String,
}

/// Langfuse 完整配置（含 secret_key，仅内部使用）
#[derive(Debug, Clone)]
pub struct LangfuseConfigFull {
    pub config: LangfuseConfig,
    pub secret_key: Option<String>,
}

/// Langfuse 配置状态
pub struct LangfuseState {
    conn: Arc<Mutex<Option<Connection>>>,
}

impl LangfuseState {
    pub fn new() -> Self {
        Self { conn: Arc::new(Mutex::new(None)) }
    }

    pub fn init(&self) -> Result<(), String> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建配置数据库目录失败: {}", e))?;
        }
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("打开 Langfuse 配置数据库失败: {}", e))?;
        Self::init_tables(&conn).map_err(|e| e.to_string())?;
        *self.conn.lock() = Some(conn);
        Ok(())
    }

    fn db_path() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("ydsz-buddy")
            .join("langfuse.db")
    }

    fn init_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS settings (
                key     TEXT PRIMARY KEY,
                value   TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS secrets (
                key     TEXT PRIMARY KEY,
                value   TEXT NOT NULL
            );
        "#)?;
        Ok(())
    }

    fn conn(&self) -> Result<Connection, String> {
        self.conn.lock()
            .as_ref()
            .cloned()
            .ok_or_else(|| "Langfuse 配置未初始化".to_string())
    }

    /// 保存 Langfuse 配置
    pub fn save_config(&self, config: &LangfuseConfig, secret_key: Option<&str>) -> Result<(), String> {
        let conn = self.conn()?;

        let config_json = serde_json::to_string(config).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('langfuse_config', ?1)",
            rusqlite::params![config_json],
        ).map_err(|e| e.to_string())?;

        if let Some(sk) = secret_key {
            conn.execute(
                "INSERT OR REPLACE INTO secrets (key, value) VALUES ('langfuse_secret_key', ?1)",
                rusqlite::params![sk],
            ).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    /// 读取 Langfuse 配置（不含 secret_key）
    pub fn get_config(&self) -> Result<LangfuseConfig, String> {
        let conn = self.conn()?;
        let value: String = conn.query_row(
            "SELECT value FROM settings WHERE key = 'langfuse_config'",
            [],
            |row| row.get(0),
        ).map_err(|_| "未找到 Langfuse 配置".to_string())?;

        serde_json::from_str(&value).map_err(|e| e.to_string())
    }

    /// 读取完整配置（含 secret_key）
    pub fn get_full_config(&self) -> Result<LangfuseConfigFull, String> {
        let config = self.get_config()?;
        let conn = self.conn()?;

        let secret_key: Option<String> = conn.query_row(
            "SELECT value FROM secrets WHERE key = 'langfuse_secret_key'",
            [],
            |row| row.get::<_, String>(0),
        ).optional().map_err(|e| e.to_string())?;

        Ok(LangfuseConfigFull { config, secret_key })
    }

    /// 验证 Langfuse 凭证（调用 Langfuse API 测试）
    pub fn verify_credentials(&self, public_key: &str, secret_key: &str, base_url: &str) -> Result<bool, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("{}/api/public/projects", base_url.trim_end_matches('/'));
        let response = client.get(&url)
            .header("Authorization", format!("Basic {}", base64::encode(format!("{}:{}", public_key, secret_key))))
            .send()
            .map_err(|e| e.to_string())?;

        Ok(response.status().is_success())
    }

    /// 清除 Langfuse 配置
    pub fn clear_config(&self) -> Result<(), String> {
        let conn = self.conn()?;
        conn.execute("DELETE FROM settings WHERE key = 'langfuse_config'", [])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM secrets WHERE key = 'langfuse_secret_key'", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

impl Clone for LangfuseState {
    fn clone(&self) -> Self {
        Self { conn: Arc::clone(&self.conn) }
    }
}

// ──────────── Tauri 命令 ────────────

/// 初始化 Langfuse 配置系统
#[tauri::command]
#[specta::specta]
pub fn langfuse_init(
    state: tauri::State<'_, LangfuseState>,
) -> Result<(), String> {
    state.init()
}

/// 获取 Langfuse 配置（不含 secret_key）
#[tauri::command]
#[specta::specta]
pub fn langfuse_get_config(
    state: tauri::State<'_, LangfuseState>,
) -> Result<LangfuseConfig, String> {
    state.get_config()
}

/// 保存 Langfuse 配置
#[tauri::command]
#[specta::specta]
pub fn langfuse_save_config(
    config: LangfuseConfig,
    secret_key: Option<String>,
    state: tauri::State<'_, LangfuseState>,
) -> Result<(), String> {
    state.save_config(&config, secret_key.as_deref())
}

/// 验证 Langfuse 凭证
#[tauri::command]
#[specta::specta]
pub fn langfuse_verify(
    public_key: String,
    secret_key: String,
    base_url: String,
    state: tauri::State<'_, LangfuseState>,
) -> Result<bool, String> {
    state.verify_credentials(&public_key, &secret_key, &base_url)
}

/// 清除 Langfuse 配置
#[tauri::command]
#[specta::specta]
pub fn langfuse_clear(
    state: tauri::State<'_, LangfuseState>,
) -> Result<(), String> {
    state.clear_config()
}
