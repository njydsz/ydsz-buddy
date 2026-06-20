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

pub mod cursor;
pub mod events;
pub mod grok;
pub mod model;
pub mod runtime;

pub use cursor::*;
pub use events::*;
pub use grok::*;
pub use model::*;
pub use runtime::*;
