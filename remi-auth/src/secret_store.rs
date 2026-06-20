//! # 密钥安全存储
//!
//! 本模块提供了密钥的安全存储机制，支持内存存储和持久化存储。
//!
//! ## 核心功能
//!
//! - **内存存储**: 使用 `HashMap` 存储密钥，支持并发读写（`RwLock`）
//! - **随机密钥生成**: 支持生成指定长度的随机密钥
//! - **持久化支持**: 预留了持久化到磁盘的接口（待实现加密存储）
//!
//! ## 使用场景
//!
//! - 存储会话签名密钥（HMAC-SHA256）
//! - 存储 API Key 等敏感凭证
//! - 生成随机令牌盐值
//!
//! ## 线程安全
//!
//! [`SecretStore`] 使用 `Arc<RwLock<HashMap>>` 保证线程安全，
//! 可以在多个异步任务中共享使用。

use std::collections::HashMap;
use std::path::PathBuf;

use rand::Rng;
use tokio::sync::RwLock;
use tracing::{debug, info};

use crate::error::AuthResult;

/// # 密钥存储
///
/// 提供密钥的安全存储能力，支持内存存储和可选的持久化存储。
///
/// ## 特性
///
/// - 线程安全：使用 `RwLock` 保证并发访问安全
/// - 异步接口：所有操作均为异步方法
/// - 随机生成：支持生成指定长度的随机密钥
///
/// ## 字段说明
///
/// - `secrets`: 密钥存储的哈希表，键为密钥名称，值为密钥字节数组
/// - `storage_path`: 可选的持久化存储路径（当前未实现）
pub struct SecretStore {
    /// 密钥存储的哈希表
    secrets: RwLock<HashMap<String, Vec<u8>>>,
    /// 持久化存储路径（预留字段）
    #[allow(dead_code)]
    storage_path: Option<PathBuf>,
}

impl SecretStore {
    /// 创建新的密钥存储实例
    ///
    /// ## 参数
    ///
    /// - `storage_path`: 可选的持久化存储路径。如果提供，未来可以将密钥加密存储到磁盘
    ///
    /// ## 返回值
    ///
    /// 返回一个新的 [`SecretStore`] 实例，初始时密钥表为空
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// use remi_auth::SecretStore;
    /// use std::path::PathBuf;
    ///
    /// // 创建纯内存存储
    /// let store = SecretStore::new(None);
    ///
    /// // 创建带持久化路径的存储（待实现）
    /// let store = SecretStore::new(Some(PathBuf::from("/path/to/secrets")));
    /// ```
    pub fn new(storage_path: Option<PathBuf>) -> Self {
        Self {
            secrets: RwLock::new(HashMap::new()),
            storage_path,
        }
    }

    /// 获取密钥
    ///
    /// 根据密钥名称从存储中读取密钥内容。
    ///
    /// ## 参数
    ///
    /// - `name`: 密钥名称
    ///
    /// ## 返回值
    ///
    /// - `Ok(Some(Vec<u8>))`: 密钥存在，返回密钥字节数组
    /// - `Ok(None)`: 密钥不存在
    /// - `Err(AuthError)`: 读取过程中发生错误
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// # use remi_auth::SecretStore;
    /// # async fn example() {
    /// let store = SecretStore::new(None);
    /// if let Some(key) = store.get("my_key").await.unwrap() {
    ///     println!("密钥长度: {}", key.len());
    /// }
    /// # }
    /// }
    pub async fn get(&self, name: &str) -> AuthResult<Option<Vec<u8>>> {
        let secrets = self.secrets.read().await;
        Ok(secrets.get(name).cloned())
    }

    /// 设置密钥
    ///
    /// 将密钥存储到指定的名称下。如果名称已存在，则覆盖原有密钥。
    ///
    /// ## 参数
    ///
    /// - `name`: 密钥名称
    /// - `value`: 密钥字节数组
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`: 存储成功
    /// - `Err(AuthError)`: 存储过程中发生错误
    ///
    /// ## TODO
    ///
    /// 未来需要实现持久化到磁盘（加密存储）
    pub async fn set(&self, name: &str, value: &[u8]) -> AuthResult<()> {
        info!("设置密钥: {}", name);
        let mut secrets = self.secrets.write().await;
        secrets.insert(name.to_string(), value.to_vec());

        // TODO: 持久化到磁盘（加密存储）

        Ok(())
    }

    /// 获取或创建随机密钥
    ///
    /// 如果指定名称的密钥已存在，则直接返回；否则生成指定长度的随机密钥并存储。
    ///
    /// ## 参数
    ///
    /// - `name`: 密钥名称
    /// - `bytes`: 随机密钥的字节长度
    ///
    /// ## 返回值
    ///
    /// - `Ok(Vec<u8>)`: 密钥字节数组（已存在或新生成）
    /// - `Err(AuthError)`: 生成或存储过程中发生错误
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// # use remi_auth::SecretStore;
    /// # async fn example() {
    /// let store = SecretStore::new(None);
    /// let key = store.get_or_create_random("signing_key", 32).await.unwrap();
    /// assert_eq!(key.len(), 32);
    /// # }
    /// }
    pub async fn get_or_create_random(&self, name: &str, bytes: usize) -> AuthResult<Vec<u8>> {
        if let Some(existing) = self.get(name).await? {
            debug!("密钥已存在: {}", name);
            return Ok(existing);
        }

        info!("创建随机密钥: {} ({} 字节)", name, bytes);
        let mut rng = rand::rngs::OsRng;
        let value: Vec<u8> = (0..bytes).map(|_| rng.gen()).collect();

        self.set(name, &value).await?;

        Ok(value)
    }

    /// 删除密钥
    ///
    /// 从存储中移除指定名称的密钥。
    ///
    /// ## 参数
    ///
    /// - `name`: 密钥名称
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`: 删除成功（即使密钥不存在也不报错）
    /// - `Err(AuthError)`: 删除过程中发生错误
    pub async fn remove(&self, name: &str) -> AuthResult<()> {
        info!("删除密钥: {}", name);
        let mut secrets = self.secrets.write().await;
        secrets.remove(name);

        Ok(())
    }
}

impl Default for SecretStore {
    /// 创建默认的密钥存储实例
    ///
    /// 默认实例不使用持久化存储，仅使用内存存储。
    fn default() -> Self {
        Self::new(None)
    }
}
