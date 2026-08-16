//! # Skill 模块（Code 域扩展能力）
//!
//! 为 ydsz-buddy 提供"Skill" 概念：可被 LLM 加载的可复用 prompt / 工作流片段。
//!
//! ## 架构
//!
//! ```text
//! ┌─────────────────────────────────────────────────┐
//! │ SkillInstaller (安装/卸载)                       │
//! │   ├── SkillSource::Local(path)                   │
//! │   ├── SkillSource::GitHub(owner/repo@ref)        │
//! │   └── SkillSource::Marketplace(slug) ─→ mp lookup│
//! │                                                 │
//! │ SkillRegistry (~/.ydsz/skills/registry.json)     │
//! │   ├── list / get / is_installed                  │
//! │   ├── register / unregister                      │
//! │   └── validate_dependencies                      │
//! │                                                 │
//! │ Marketplace (内置索引 + 远端覆盖)                 │
//! │   ├── lookup / search / by_tag / by_runtime      │
//! │   └── add / remove                               │
//! │                                                 │
//! │ SkillManifest (SKILL.md frontmatter 解析)         │
//! │   └── name / version / description / tags / ...  │
//! └─────────────────────────────────────────────────┘
//! ```
//!
//! ## 文件布局
//!
//! ```text
//! ~/.ydsz/skills/
//! ├── registry.json          # 已安装列表
//! └── installed/
//!     ├── <skill-name>/
//!     │   ├── SKILL.md
//!     │   └── ... (其它资源文件)
//!     └── ...
//! ```
//!
//! ## SKILL.md 格式
//!
//! 见 [`manifest::parse_skill_md`]。

pub mod error;
pub mod installer;
pub mod manifest;
pub mod marketplace;
pub mod registry;

pub use error::{SkillError, SkillResult};
pub use installer::{SkillInstaller, SkillSource};
pub use manifest::{
    parse_skill_md, parse_skill_md_file, validate_name, SkillManifest,
};
pub use marketplace::{Marketplace, MarketplaceEntry, MARKETPLACE_INDEX};
pub use registry::{installed_from_manifest, InstalledSkill, SkillRegistry};
