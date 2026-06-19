//! Remi Code 的模式定义和 RPC 协议。
//!
//! 本 crate 是所有数据模式定义和 RPC 方法定义的唯一真实来源。
//! 使用 `schemars` 进行 JSON Schema 生成，并可用于生成 TypeScript 类型。

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

/// 项目的唯一标识符。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ProjectId(pub uuid::Uuid);

impl ProjectId {
    /// 生成一个新的随机项目 ID。
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

/// 线程的唯一标识符。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ThreadId(pub uuid::Uuid);

impl ThreadId {
    /// 生成一个新的随机线程 ID。
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
