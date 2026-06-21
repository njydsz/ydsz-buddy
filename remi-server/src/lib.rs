//! # Remi Server - WebSocket 服务器模块
//!
//! ## 模块职责
//!
//! 本模块是 Remi 平台的服务器端核心组件，负责提供基于 WebSocket 的实时双向通信能力。
//! 模块封装了完整的 WebSocket 服务器生命周期管理、JSON-RPC 2.0 远程过程调用框架、
//! 客户端连接管理、消息推送与订阅等关键功能。
//!
//! ## 核心功能
//!
//! - **WebSocket 服务器**：基于 Axum 框架实现高性能 WebSocket 服务器，支持并发连接管理
//! - **JSON-RPC 2.0 框架**：实现标准的 JSON-RPC 2.0 协议，支持方法注册、路由分发、错误处理
//! - **连接管理**：统一管理所有 WebSocket 连接的生命周期，包括注册、移除、消息收发
//! - **消息推送**：支持广播通知和定向推送，实现服务器主动向客户端推送消息
//! - **错误处理**：统一的错误类型定义，支持从各子模块错误到服务器错误的自动转换
//!
//! ## 使用场景
//!
//! - IDE 后端服务：为前端 IDE 提供实时代码编辑、终端交互、文件同步等能力
//! - 实时协作：支持多用户同时在线协作编辑，通过 WebSocket 实时同步状态
//! - 远程开发：通过 WebSocket 通道实现远程终端执行、Git 操作、代码检查等功能
//!
//! ## 模块结构
//!
//! - [`error`] - 服务器错误类型定义，统一错误处理与转换
//! - [`push_channels`] - 推送通道管理，实现消息的发布/订阅模式
//! - [`rpc`] - JSON-RPC 2.0 协议框架，包括请求/响应/通知的数据结构与路由器
//! - [`rpc_methods`] - 具体的 RPC 方法实现，注册业务处理逻辑
//! - [`server`] - WebSocket 服务器主体，负责 HTTP 路由配置与服务器启动
//! - [`websocket`] - WebSocket 连接管理器，负责连接注册、消息分发与通知推送
//!
//! ## 架构概览
//!
//! ```text
//! Client <--WebSocket--> WebSocketServer <---> WebSocketManager
//!                              |                      |
//!                          RpcRouter            Connection Pool
//!                              |
//!                      RpcMethodHandlers (业务逻辑)
//! ```

/// 服务器错误类型定义模块
pub mod error;
/// 推送通道管理模块，实现消息的发布/订阅模式
pub mod push_channels;
/// JSON-RPC 2.0 远程过程调用框架模块
pub mod rpc;
/// RPC 方法注册表模块，包含所有具体的业务方法实现
pub mod rpc_methods;
/// WebSocket 服务器主体模块，负责服务器启动与 HTTP 路由
pub mod server;
/// WebSocket 连接管理模块，负责连接生命周期管理与消息处理
pub mod websocket;
/// 服务引导模块，提供统一的服务容器构造和启动逻辑
pub mod bootstrap;
/// 进程内 IPC 桥接模块，供嵌入式 Tauri 等同进程消费者使用
pub mod ipc;
/// 线程保留作业模块，定期清理过期/不活跃线程
pub mod retention;
/// Home 目录迁移模块，把已知来源（Peak/Codex/Claude/OpenCode）数据导入到 Remi home
pub mod home_migration;
/// 附件存储模块，聊天图片/语音/截图等的落盘与查询
pub mod attachment_store;
/// 本地图片文件服务模块，约束后端对前端 markdown 引用本地图片的访问范围
pub mod local_image_files;
/// 项目 favicon 路由模块，提供 /api/project-favicon?path=... 接口
pub mod project_favicon_route;
/// HTTP 路由注册器，把 attachment / local-image / favicon / health 等路由挂到 axum
pub mod http_routes;
/// 进程运行器，跨平台子进程执行 + 流式输出 + 超时
pub mod process_runner;
/// OS 卡顿监控（loadavg / 内存 / 心跳）
pub mod os_jank;
/// Shell 命令分类（git/package/test/danger/interactive …）
pub mod shell_command_detection;
/// Bun WebSocket 兼容垫片（消息归一化 / 心跳 / close code）
pub mod bun_websocket_compat;
/// 启动访问控制模块（主机检测 / 端口解析）
pub mod startup_access;
/// 图片 MIME 类型检测模块（Base64 解析 / 扩展名推断）
pub mod image_mime;
/// 原子文件写入模块（临时文件 + 重命名）
pub mod atomic_write;
/// Provider 用量快照模块（本地用量归档读取）
pub mod provider_usage_snapshot;
/// 浏览器/编辑器启动服务模块
pub mod open;

pub use error::*;
pub use push_channels::*;
pub use rpc::*;
pub use rpc_methods::*;
pub use server::*;
pub use websocket::*;
pub use bootstrap::*;
pub use ipc::*;
pub use retention::*;
pub use home_migration::*;
pub use attachment_store::*;
pub use local_image_files::*;
pub use project_favicon_route::*;
pub use http_routes::*;
pub use process_runner::*;
pub use os_jank::*;
pub use shell_command_detection::*;
pub use bun_websocket_compat::*;
pub use startup_access::*;
pub use image_mime::*;
pub use atomic_write::*;
pub use provider_usage_snapshot::*;
pub use open::*;

