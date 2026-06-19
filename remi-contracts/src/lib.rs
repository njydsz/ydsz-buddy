//! `remi-contracts`：Remi Code 模式定义与 RPC 协议
//!
//! 本 crate 是所有数据模式（DTO）和 RPC 方法签名定义的"唯一真实来源（SSOT）"。
//!
//! # 设计目标
//! - **前后端共享类型**：使用 `schemars` 生成 JSON Schema，并可进一步生成 TypeScript 类型，
//!   避免在 TS 端手写 interface 造成漂移。
//! - **稳定可演进**：所有结构体使用 `#[serde(rename_all = "camelCase")]`（由各个模块自行标注），
//!   新增字段必须为 `Option<T>` 或带默认值。
//! - **无业务依赖**：本 crate 不引用任何持久化/网络库，可被任意子 crate 复用。
//!
//! # 模块概览
//! - [`auth`]：认证、令牌、配对码。
//! - [`editor`]：编辑器状态、选区、诊断信息。
//! - [`filesystem`]：文件浏览、读写、监听事件。
//! - [`git`]：仓库状态、分支、提交、PR。
//! - [`model`]：AI 模型列表、能力与元信息。
//! - [`orchestration`]：会话编排相关 DTO。
//! - [`project`]：项目（工作区）相关 DTO。
//! - [`provider`]：AI 提供商配置、健康度、调用结果。
//! - [`rpc`]：RPC 框架层（请求/响应/错误结构）。
//! - [`terminal`]：PTY 终端相关 DTO。
//!
//! # 兼容性
//! 本 crate 暴露的所有类型应被视为"对外 API"：破坏性变更必须先经过 API 评审与
//! 版本号调整（`major` bump），避免影响前端的协议消费。

pub mod auth;
pub mod editor;
pub mod filesystem;
pub mod git;
pub mod model;
pub mod orchestration;
pub mod project;
pub mod provider;
pub mod rpc;
pub mod terminal;

pub use auth::*;
pub use editor::*;
pub use filesystem::*;
pub use git::*;
pub use model::*;
pub use orchestration::*;
pub use project::*;
pub use provider::*;
pub use rpc::*;
pub use terminal::*;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 项目的唯一标识符
///
/// 在 RPC 协议中通常序列化为 UUID 字符串；前端在 TypeScript 端将其视为
/// `string` 类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ProjectId(pub uuid::Uuid);

impl ProjectId {
    /// 生成一个新的随机项目 ID
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4())
    }
}

impl Default for ProjectId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ProjectId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// 线程（会话）的唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ThreadId(pub uuid::Uuid);

impl ThreadId {
    /// 生成一个新的随机线程 ID
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4())
    }
}

impl Default for ThreadId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ThreadId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
