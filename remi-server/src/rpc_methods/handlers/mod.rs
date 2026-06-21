//! # RPC 方法处理器模块
//!
//! 本模块按业务域组织所有 RPC 方法的具体实现，每个子模块对应一个业务域，
//! 提供 `register_*_methods` 函数将方法注册到路由器。
//!
//! ## 子模块列表
//!
//! | 子模块 | 注册函数 | 方法前缀 | 说明 |
//! |--------|----------|----------|------|
//! | [`orchestration`] | [`register_orchestration_methods`] | `orchestration.*` | 编排引擎方法 |
//! | [`provider`] | [`register_provider_methods`] | `provider.*` | Provider 方法 |
//! | [`git`] | [`register_git_methods`] | `git.*` | Git 方法 |
//! | [`terminal`] | [`register_terminal_methods`] | `terminal.*` | 终端方法 |
//! | [`workspace`] | [`register_workspace_methods`] | `workspace.*` | 工作空间方法 |
//! | [`auth`] | [`register_auth_methods`] | `auth.*` | 认证方法 |
//! | [`checkpoint`] | [`register_checkpoint_methods`] | `checkpoint.*` | 检查点方法 |
//! | [`server`] | [`register_server_methods`] | `server.*` | 服务器方法 |
//! | [`telemetry`] | [`register_telemetry_methods`] | `telemetry.*` | 遥测方法 |
//! | [`subscription`] | [`register_subscription_methods`] | `subscribe.*` | 推送通道订阅方法 |
//! | [`shell`] | [`register_shell_methods`] | `shell.*` | Shell 操作方法 |

/// 编排引擎 RPC 方法
mod orchestration;
/// Provider RPC 方法
mod provider;
/// Git RPC 方法
mod git;
/// 终端 RPC 方法
mod terminal;
/// 工作空间 RPC 方法
mod workspace;
/// 认证 RPC 方法
mod auth;
/// 检查点 RPC 方法
mod checkpoint;
/// 服务器 RPC 方法
mod server;
/// 遥测 RPC 方法
mod telemetry;
/// 推送通道订阅 RPC 方法
mod subscription;
/// Shell 操作 RPC 方法
mod shell;
/// 语音转文字 RPC 方法
mod voice;
/// Projects RPC 方法（前端兼容层）
mod projects;
/// 本地 Skills RPC 方法
mod skills;

pub use orchestration::*;
pub use provider::*;
pub use git::*;
pub use terminal::*;
pub use workspace::*;
pub use auth::*;
pub use checkpoint::*;
pub use server::*;
pub use telemetry::*;
pub use subscription::*;
pub use shell::*;
pub use voice::*;
pub use projects::*;
pub use skills::*;

