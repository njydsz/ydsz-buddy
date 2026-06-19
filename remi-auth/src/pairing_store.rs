//! # 配对链接存储模块
//!
//! 本模块定义配对链接存储的接口和实现。

use async_trait::async_trait;
use remi_core::models::PairingLink;

use crate::error::AuthResult;

/// 配对链接存储 trait
///
/// 定义配对链接存储的核心接口，支持配对链接的创建、查询、列出和撤销操作。
#[async_trait]
pub trait PairingLinkStore: Send + Sync {
    /// 保存配对链接到存储
    fn save_pairing_link(&self, link: &PairingLink) -> AuthResult<()>;

    /// 按 ID 查询配对链接
    fn get_pairing_link(&self, link_id: &str) -> AuthResult<Option<PairingLink>>;

    /// 按配对码查询配对链接
    fn get_pairing_link_by_code(&self, pairing_code: &str) -> AuthResult<Option<PairingLink>>;

    /// 列出所有配对链接
    fn list_pairing_links(&self) -> AuthResult<Vec<PairingLink>>;

    /// 撤销配对链接
    fn revoke_pairing_link(&self, link_id: &str) -> AuthResult<bool>;

    /// 标记配对链接为已使用
    fn mark_pairing_link_used(&self, link_id: &str) -> AuthResult<()>;
}
