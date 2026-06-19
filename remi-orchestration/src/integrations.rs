//! Remi Code 外部集成。
//!
//! 大厂标准要求：核心 ADE 应当原生支持以下集成。
//!
//! # 模块
//!
//! - [`thread_importer`] — 从外部源（ChatGPT、Markdown、JSON）导入会话
//! - [`github`] — GitHub CLI（gh）集成（PR/Issue/Repo 信息）
//! - [`voice`] — 语音转录服务接口
//! - [`telemetry`] — 兼容 OpenTelemetry 的遥测
//! - [`readiness`] — 服务就绪探针

pub mod github;
pub mod readiness;
pub mod telemetry;
pub mod thread_importer;
pub mod voice;

pub use github::{GitHubCli, GitHubIssue, GitHubPullRequest, GitHubRepo};
pub use readiness::{ReadinessCheck, ReadinessReport, ReadinessStatus, ServerReadiness};
pub use telemetry::{TelemetryClient, TelemetryEvent, TelemetryLevel};
pub use thread_importer::{
    ImportSource, ImportStats, ImportedMessage, ImportedThread, ThreadImporter,
};
pub use voice::{VoiceProvider, VoiceService, VoiceState, VoiceTranscription};
