//! # 配对链接存储模块
//!
//! 本模块定义配对链接存储的接口（[`PairingLinkStore`] trait），提供配对链接的
//! 创建、查询、列出、撤销和消费等操作的抽象。
//!
//! ## 核心职责
//!
//! - **持久化存储**: 将配对链接（[`PairingLink`]）持久化到数据库或其他存储后端
//! - **查询能力**: 支持按 ID、配对码等维度查询配对链接
//! - **生命周期管理**: 支持配对链接的撤销和标记已使用
//! - **一次性消费**: 通过 `consume_available` 方法实现配对链接的一次性消费语义
//!
//! ## 设计说明
//!
//! 本模块仅定义 trait 接口，具体的存储实现由 `remi-persistence` 等外部模块提供。
//! 通过 trait 抽象，认证服务（[`AuthService`](crate::service::AuthService)）可以在
//! 运行时注入不同的存储后端（如 SQLite、内存等），实现关注点分离和可测试性。
//!
//! ## 使用场景
//!
//! - 客户端通过配对码完成设备配对时，查询并消费配对链接
//! - 管理员查看所有活跃配对链接，或撤销未使用的链接
//! - 认证服务在颁发配对凭证时，将配对链接持久化到存储

use async_trait::async_trait;
use remi_core::models::PairingLink;

use crate::error::AuthResult;

/// # 配对链接存储 trait
///
/// 定义配对链接存储的核心接口，支持配对链接的创建、查询、列出、撤销和消费操作。
///
/// ## 实现要求
///
/// 实现此 trait 的类型必须满足以下条件：
/// - 实现 `Send + Sync`，支持跨异步任务共享
/// - 所有方法应保证线程安全
/// - 持久化操作应保证原子性
///
/// ## 使用示例
///
/// ```rust,ignore
/// // 在 AuthService 中注入配对链接存储
/// let pairing_store: Arc<dyn PairingLinkStore> = Arc::new(SqlitePairingStore::new(db));
/// let auth_service = AuthService::with_pairing_store(credential_service, pairing_store);
/// ```
#[async_trait]
pub trait PairingLinkStore: Send + Sync {
    /// 保存配对链接到存储
    ///
    /// 将配对链接持久化到存储后端。如果同 ID 的链接已存在，应覆盖更新。
    ///
    /// ## 参数
    ///
    /// - `link`: 要保存的配对链接引用，包含 ID、配对码、角色、时间戳等完整信息
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`: 保存成功
    /// - `Err(AuthError)`: 保存失败，如存储后端不可用、数据格式错误等
    fn save_pairing_link(&self, link: &PairingLink) -> AuthResult<()>;

    /// 按 ID 查询配对链接
    ///
    /// 根据配对链接的唯一标识符查询配对链接。
    ///
    /// ## 参数
    ///
    /// - `link_id`: 配对链接的唯一标识符（UUID 格式）
    ///
    /// ## 返回值
    ///
    /// - `Ok(Some(PairingLink))`: 找到匹配的配对链接
    /// - `Ok(None)`: 未找到匹配的配对链接
    /// - `Err(AuthError)`: 查询失败，如存储后端不可用
    fn get_pairing_link(&self, link_id: &str) -> AuthResult<Option<PairingLink>>;

    /// 按配对码查询配对链接
    ///
    /// 根据配对码（pairing code）查询对应的配对链接。配对码是用户可见的短码，
    /// 通常在客户端输入后用于查找对应的配对链接。
    ///
    /// ## 参数
    ///
    /// - `pairing_code`: 配对码字符串，通常为 12 位大写字母数字组合
    ///
    /// ## 返回值
    ///
    /// - `Ok(Some(PairingLink))`: 找到匹配的配对链接
    /// - `Ok(None)`: 未找到匹配的配对链接（配对码无效或已过期）
    /// - `Err(AuthError)`: 查询失败，如存储后端不可用
    fn get_pairing_link_by_code(&self, pairing_code: &str) -> AuthResult<Option<PairingLink>>;

    /// 列出所有配对链接
    ///
    /// 获取存储中所有配对链接的列表，包括已使用和未使用的链接。
    ///
    /// ## 返回值
    ///
    /// - `Ok(Vec<PairingLink>)`: 配对链接列表。若无任何链接，返回空向量
    /// - `Err(AuthError)`: 查询失败，如存储后端不可用
    fn list_pairing_links(&self) -> AuthResult<Vec<PairingLink>>;

    /// 列出所有活跃的配对链接
    ///
    /// 获取存储中所有未过期且未被撤销的配对链接列表。
    /// 与 [`list_pairing_links`](Self::list_pairing_links) 的区别在于，
    /// 此方法会过滤掉已过期或已撤销的链接。
    ///
    /// ## 返回值
    ///
    /// - `Ok(Vec<PairingLink>)`: 活跃配对链接列表。若无活跃链接，返回空向量
    /// - `Err(AuthError)`: 查询失败，如存储后端不可用
    fn list_active_pairing_links(&self) -> AuthResult<Vec<PairingLink>>;

    /// 撤销配对链接
    ///
    /// 将指定 ID 的配对链接标记为已撤销，使其失效不能再被使用。
    /// 撤销操作不可逆，已撤销的链接无法恢复。
    ///
    /// ## 参数
    ///
    /// - `link_id`: 要撤销的配对链接的唯一标识符
    ///
    /// ## 返回值
    ///
    /// - `Ok(true)`: 撤销成功
    /// - `Ok(false)`: 撤销失败（链接不存在或已被撤销）
    /// - `Err(AuthError)`: 撤销过程中发生错误，如存储后端不可用
    fn revoke_pairing_link(&self, link_id: &str) -> AuthResult<bool>;

    /// 标记配对链接为已使用
    ///
    /// 将指定 ID 的配对链接标记为已使用，记录使用时间。已使用的链接
    /// 不能再次被消费，保证一次性使用语义。
    ///
    /// ## 参数
    ///
    /// - `link_id`: 要标记的配对链接的唯一标识符
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`: 标记成功
    /// - `Err(AuthError)`: 标记失败，如链接不存在或存储后端不可用
    fn mark_pairing_link_used(&self, link_id: &str) -> AuthResult<()>;

    /// 消费可用的配对链接
    ///
    /// 根据凭证（配对码或一次性令牌）查找并消费一个可用的配对链接。
    /// 该方法实现了"查找 + 标记已使用"的原子操作，确保同一个配对链接
    /// 只能被消费一次。
    ///
    /// ## 参数
    ///
    /// - `credential`: 配对凭证字符串，可以是配对码或一次性令牌
    ///
    /// ## 返回值
    ///
    /// - `Ok(Some(PairingLink))`: 找到并成功消费了配对链接，返回链接信息
    /// - `Ok(None)`: 未找到可用的配对链接（凭证无效、链接已过期或已被使用）
    /// - `Err(AuthError)`: 消费过程中发生错误，如存储后端不可用
    ///
    /// ## 使用场景
    ///
    /// 在 [`AuthService::exchange_bootstrap_credential`](crate::service::AuthService::exchange_bootstrap_credential)
    /// 中，当客户端使用配对码进行认证时，调用此方法消费对应的配对链接。
    fn consume_available(&self, credential: &str) -> AuthResult<Option<PairingLink>>;
}
