//! 密钥安全存储

use std::collections::HashMap;
use std::path::PathBuf;

use rand::Rng;
use tokio::sync::RwLock;
use tracing::{debug, info};

use crate::error::{AuthError, AuthResult};

/// 密钥存储
pub struct SecretStore {
    secrets: RwLock<HashMap<String, Vec<u8>>>,
    storage_path: Option<PathBuf>,
}

impl SecretStore {
    /// 创建新的密钥存储
    pub fn new(storage_path: Option<PathBuf>) -> Self {
        Self {
            secrets: RwLock::new(HashMap::new()),
            storage_path,
        }
    }

    /// 获取密钥
    pub async fn get(&self, name: &str) -> AuthResult<Option<Vec<u8>>> {
        let secrets = self.secrets.read().await;
        Ok(secrets.get(name).cloned())
    }

    /// 设置密钥
    pub async fn set(&self, name: &str, value: &[u8]) -> AuthResult<()> {
        info!("设置密钥: {}", name);
        let mut secrets = self.secrets.write().await;
        secrets.insert(name.to_string(), value.to_vec());

        // TODO: 持久化到磁盘（加密存储）

        Ok(())
    }

    /// 获取或创建随机密钥
    pub async fn get_or_create_random(&self, name: &str, bytes: usize) -> AuthResult<Vec<u8>> {
        if let Some(existing) = self.get(name).await? {
            debug!("密钥已存在: {}", name);
            return Ok(existing);
        }

        info!("创建随机密钥: {} ({} 字节)", name, bytes);
        let mut rng = rand::thread_rng();
        let value: Vec<u8> = (0..bytes).map(|_| rng.gen()).collect();

        self.set(name, &value).await?;

        Ok(value)
    }

    /// 删除密钥
    pub async fn remove(&self, name: &str) -> AuthResult<()> {
        info!("删除密钥: {}", name);
        let mut secrets = self.secrets.write().await;
        secrets.remove(name);

        Ok(())
    }
}

impl Default for SecretStore {
    fn default() -> Self {
        Self::new(None)
    }
}
