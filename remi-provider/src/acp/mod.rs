//! ACP (Agent Client Protocol) 支持模块
//!
//! 本模块提供与 ACP 协议兼容的 Provider 集成能力，支持 Cursor、Grok 等 ACP 客户端。
//!
//! # 核心组件
//!
//! - **[`runtime`]：ACP 会话运行时，管理子进程通信和会话生命周期
//! - **[`model`]：ACP 数据模型和事件解析
//! - **[`events`]：ACP 事件到 Remi 运行时事件的映射
//! - **[`cursor`]：Cursor ACP 适配器支持
//! - **[`grok`]：Grok ACP 适配器支持
//!
//! # 架构设计
//!
//! ACP 模块作为 Provider 适配器的底层实现，通过 stdio 与 ACP 客户端进程通信。
//! 会话运行时负责：
//! - 启动和管理 ACP 子进程
//! - 处理 JSON-RPC 请求/响应
//! - 映射 ACP 事件到 Remi 运行时事件
//! - 管理会话生命周期（创建、恢复、关闭）

/// Cursor ACP 适配器支持
///
/// 提供 Cursor ACP 客户端的集成能力，包括运行时设置、进程启动参数构建、模型列表解析等。
pub mod cursor;

/// Cursor ACP 扩展模块
///
/// 在 cursor 之上提供 profile / bootstrap / 解码器
pub mod cursor_acp_ext;

/// ACP 事件映射
///
/// 提供 ACP 协议事件到 Remi 运行时事件的转换函数，包括内容增量、工具调用、
/// 计划更新、Token 使用、权限请求等事件的映射。
pub mod events;

/// Grok ACP 适配器支持
///
/// 提供 Grok ACP 客户端的集成能力，包括运行时设置、认证方式解析、进程启动参数构建等。
pub mod grok;

/// ACP JSON-RPC 长连接
pub mod json_rpc_connection;

/// 核心运行时事件类型 + 事件总线
pub mod core_runtime_events;

/// 会话运行时
pub mod session_runtime;

/// ACP 数据模型定义
///
/// 定义 ACP 协议的核心数据结构，包括会话模式、工具调用状态、计划更新、
/// 权限请求、会话更新事件等类型，以及事件解析函数。
pub mod model;

/// ACP 会话运行时
///
/// 管理 ACP 客户端子进程的通信和会话生命周期，包括进程启动、JSON-RPC 请求发送、
/// 事件流订阅、会话关闭等功能。
pub mod runtime;

pub use cursor::*;
pub use cursor_acp_ext::*;
pub use events::*;
pub use grok::*;
pub use json_rpc_connection::*;
pub use core_runtime_events::*;
pub use session_runtime::*;
pub use model::*;
pub use runtime::*;
