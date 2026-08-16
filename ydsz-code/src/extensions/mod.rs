//! # Extension 扩展系统
//!
//! 与 Skill 系统（prompt 片段）互补，Extension 系统提供代码级插件能力。

pub mod manifest;
pub mod registry;
pub mod commands;
pub mod lifecycle;

pub use manifest::{ExtensionManifest, ExtensionContribution};
pub use registry::{ExtensionRegistry, ExtensionEntry, ExtensionState};
pub use commands::{CommandRegistry, CommandId, CommandHandler};
pub use lifecycle::{ExtensionLifecycle, ExtensionActivator};
