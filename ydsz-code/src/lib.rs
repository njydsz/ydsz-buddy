//! # ydsz-shared:: — 程序员副驾专属能力（Code 域）
//!
//! 本 crate 聚合 **Code 模式**（程序员副驾）专属的能力模块：
//!
//! - **Git 服务**（`git`）：Worktree 生命周期、PR 创建、GitHub CLI 封装、AI 辅助 commit message
//! - **LSP 集成**（`lsp`）：语言服务器协议客户端（跳转定义 / 查找引用 / 诊断）
//! - **仓库语义检索**（`indexer`）：`@codebase` 提及触发的全仓库检索
//!
//! ## 依赖方向
//!
//! - 依赖：[`ydsz_core`]（领域模型）+ [`ydsz_provider`]（Git 文本生成调用 Provider）
//! - 不依赖：orchestration / server / work / shared
//!
//! ## 跨域禁令
//!
//! - ❌ 不允许依赖 [`ydsz_work`]（Work 域能力）
//! - ❌ 不允许在 git / lsp / indexer 之间循环依赖

/// Git 版本控制服务（Worktree / PR / GitHub CLI / AI 文本生成）
pub mod git;

/// LSP 集成（语言服务器协议客户端）
pub mod lsp;

/// 仓库语义检索（@codebase 提及触发）
pub mod indexer;

/// Repo Wiki / 知识引擎（项目级结构化知识沉淀）
pub mod repo_wiki;

/// HTML 原型生成（快速生成可预览的 HTML 页面）
pub mod html_proto;

/// 语音文本润色（去除口语化表达、修正语法、添加结构化提示词）
pub mod voice_polish;

/// MCP 集成（Model Context Protocol 客户端 + 预设模板）
pub mod mcp;

/// Skill 体系（marketplace 索引 / installer / registry / manifest 解析）
pub mod skills;

/// 项目规则加载器（AGENTS.md / CLAUDE.md / .ydsz/rules/ 等项目级 AI 协作规则）
pub mod project_rules;

/// 团队共享规则（~/.ydsz-buddy/team-rules/ 跨项目复用的全局规则）
pub mod team_rules;

/// 命令执行器（Agent 驱动的一次性命令执行）
pub mod runner;

/// 多文件协调编辑（原子性批量编辑）
pub mod multi_edit;

/// 向量嵌入语义搜索（TF-IDF + Embedding 双模式）
pub mod semantic;

/// Build/Test Runner（自动检测项目类型并执行构建/测试）
pub mod build_runner;

/// DAP (Debug Adapter Protocol) 调试器集成
pub mod debug;

/// Extension 扩展系统（代码级插件，与 Skill 互补）
pub mod extensions;

/// 模糊搜索（借鉴 nucleo 的模糊匹配算法）
pub mod fuzzy;
