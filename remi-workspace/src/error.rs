//! # Workspace 模块错误类型定义
//!
//! 本模块定义了工作空间（Workspace）模块中使用的所有错误类型和结果类型别名。
//!
//! ## 设计说明
//!
//! - 使用 [`thiserror`] 派生宏自动生成 `Error` trait 实现，确保与 Rust 标准错误处理生态兼容
//! - 所有错误变体均携带上下文信息（如路径字符串），便于上层调用方定位问题
//! - 提供 [`WorkspaceResult`] 类型别名，简化函数签名中的错误类型声明
//!
//! ## 错误分类
//!
//! | 错误变体 | 触发场景 | 说明 |
//! |---------|---------|------|
//! | `PathOutsideRoot` | 路径穿越 | 请求的路径超出工作空间根目录范围 |
//! | `FileNotFound` | 文件不存在 | 指定的文件路径在工作空间中不存在 |
//! | `DirectoryNotFound` | 目录不存在 | 指定的目录路径在工作空间中不存在 |
//! | `IoError` | I/O 异常 | 底层文件系统操作（读写、创建等）失败 |
//! | `InvalidPath` | 路径无效 | 路径格式不合法或包含非法字符 |
//! | `InternalError` | 内部错误 | 模块内部未预期的异常状态 |

use thiserror::Error;

/// # Workspace 统一错误类型
///
/// 封装工作空间模块中所有可能发生的错误情况。
///
/// ## 使用场景
///
/// - 路径安全校验失败时返回 `PathOutsideRoot`
/// - 文件/目录操作目标不存在时返回对应的 `NotFound` 变体
/// - 底层 I/O 操作异常时通过 `#[from]` 自动转换 `std::io::Error`
/// - 路径格式校验失败时返回 `InvalidPath`
/// - 其他未分类的内部异常返回 `InternalError`
///
/// ## 示例
///
/// ```rust,ignore
/// # #[tokio::main]
/// # async fn main() {
/// use remi_workspace::error::WorkspaceError;
/// 
/// fn check_path(path: &str) -> Result<(), WorkspaceError> {
///     if path.contains("..") {
///         return Err(WorkspaceError::PathOutsideRoot(path.to_string()));
///     }
///     Ok(())
/// }
/// # }
/// ```
#[derive(Error, Debug)]
pub enum WorkspaceError {
    /// 路径穿越错误：请求的路径超出了工作空间根目录范围
    ///
    /// 携带值：尝试访问的非法路径字符串
    ///
    /// ## 触发场景
    /// - 用户提供的相对路径包含 `../` 等向上跳转片段，导致解析后的绝对路径不在工作空间根目录内
    /// - 这是安全防护机制，用于防止路径穿越攻击（Path Traversal Attack）
    #[error("路径超出工作空间根目录: {0}")]
    PathOutsideRoot(String),

    /// 文件不存在错误：指定的文件路径在工作空间中不存在
    ///
    /// 携带值：不存在的文件路径字符串
    ///
    /// ## 触发场景
    /// - 读取、删除或检查一个不存在的文件时触发
    /// - 注意：与 `DirectoryNotFound` 区分，此变体专门用于文件类型
    #[error("文件不存在: {0}")]
    FileNotFound(String),

    /// 目录不存在错误：指定的目录路径在工作空间中不存在
    ///
    /// 携带值：不存在的目录路径字符串
    ///
    /// ## 触发场景
    /// - 浏览或搜索一个不存在的目录时触发
    /// - 工作空间根目录本身不存在时也会触发此错误
    #[error("目录不存在: {0}")]
    DirectoryNotFound(String),

    /// I/O 错误：底层文件系统操作失败
    ///
    /// 携带值：原始的 `std::io::Error`，通过 `#[from]` 自动转换
    ///
    /// ## 触发场景
    /// - 文件读写权限不足
    /// - 磁盘空间不足
    /// - 文件系统挂载异常
    /// - 网络文件系统连接中断等
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    /// 路径无效错误：路径格式不合法或包含非法字符
    ///
    /// 携带值：无效的路径字符串
    ///
    /// ## 触发场景
    /// - 路径中包含操作系统不允许的字符（如 Windows 下的 `<>|` 等）
    /// - 路径格式不符合预期（如空字符串、纯空白等）
    #[error("路径无效: {0}")]
    InvalidPath(String),

    /// 内部错误：模块内部未预期的异常状态
    ///
    /// 携带值：错误描述信息
    ///
    /// ## 触发场景
    /// - 不应出现的逻辑分支被意外执行
    /// - 第三方库返回了未预期的结果
    /// - 其他无法归类到上述变体的异常情况
    #[error("内部错误: {0}")]
    InternalError(String),
}

/// # Workspace 结果类型别名
///
/// 工作空间模块的统一结果类型，成功时返回泛型 `T`，失败时返回 [`WorkspaceError`]。
///
/// ## 使用场景
///
/// 作为工作空间模块中所有公开函数的返回类型，统一错误处理风格。
/// 上层调用方只需关注 `WorkspaceError` 一种错误类型即可。
///
/// ## 示例
///
/// ```rust,ignore
/// # #[tokio::main]
/// # async fn main() {
/// use remi_workspace::error::WorkspaceResult;
/// 
/// fn do_something() -> WorkspaceResult<String> {
///     Ok("success".to_string())
/// }
/// # }
/// ```
pub type WorkspaceResult<T> = Result<T, WorkspaceError>;
