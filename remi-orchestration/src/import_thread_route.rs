//! # 线程导入路由模块
//!
//! 本模块负责将外部线程（External Thread）导入到本地系统时的路由决策。
//!
//! ## 模块职责
//!
//! - **来源识别**：识别线程来源（Codex、Claude、Cursor、Gemini、Grok 等）
//! - **路由策略**：根据来源选择不同的导入路径
//! - **冲突处理**：处理已存在线程的合并或重命名
//! - **审计追踪**：记录每次导入的决策日志
//!
//! ## 路由策略
//!
//! | 来源 Provider | 路由策略 | 说明 |
//! |---------------|---------|------|
//! | Codex | 标准导入 | 保留 Codex 元数据 |
//! | Claude | 格式转换 | 转换 Claude 内部消息格式 |
//! | Cursor / Gemini / Grok | ACP 标准 | 使用 ACP 通用格式 |
//! | 未知 | 通用导入 | 尽力转换，保留原始内容 |

use serde::{Deserialize, Serialize};

use remi_core::provider::ProviderKind;
use remi_core::models::ThreadId;

use crate::error::{OrchestrationError, OrchestrationResult};

/// 线程导入路由决策
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImportRoute {
    /// 标准导入（Codex）
    Standard,
    /// 格式转换（Claude）
    FormatTransform,
    /// ACP 通用协议
    AcpStandard,
    /// 通用尽力转换
    GenericBestEffort,
}

impl ImportRoute {
    /// 根据来源 Provider 推导路由策略
    pub fn from_provider_kind(kind: ProviderKind) -> Self {
        match kind {
            ProviderKind::Codex => Self::Standard,
            ProviderKind::ClaudeAgent => Self::FormatTransform,
            ProviderKind::Cursor
            | ProviderKind::Gemini
            | ProviderKind::Grok
            | ProviderKind::Kilo
            | ProviderKind::Pi
            | ProviderKind::OpenCode => Self::AcpStandard,
        }
    }

    /// 路由策略的中文说明
    pub fn description(&self) -> &'static str {
        match self {
            Self::Standard => "标准导入",
            Self::FormatTransform => "格式转换",
            Self::AcpStandard => "ACP 通用",
            Self::GenericBestEffort => "通用尽力转换",
        }
    }
}

/// 线程导入上下文
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportThreadContext {
    /// 源线程 ID
    pub source_thread_id: String,
    /// 来源 Provider
    pub source_provider: ProviderKind,
    /// 目标项目 ID
    pub target_project_id: remi_core::models::ProjectId,
    /// 新的本地线程 ID（由调用方分配）
    pub new_thread_id: ThreadId,
    /// 可选：导入时使用的标题（若不提供则从源推导）
    pub title_hint: Option<String>,
    /// 可选：是否为 fork 模式（保留源链接）
    pub is_fork: bool,
}

impl ImportThreadContext {
    /// 推导出当前上下文的路由策略
    pub fn derive_route(&self) -> ImportRoute {
        ImportRoute::from_provider_kind(self.source_provider)
    }
}

/// 路由冲突类型
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouteConflict {
    /// 线程 ID 已存在
    ThreadIdExists,
    /// 同名线程已存在
    TitleExists,
    /// 目标项目不存在
    ProjectNotFound,
}

/// 冲突解决策略
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConflictResolution {
    /// 中止导入
    Abort,
    /// 重命名新线程（在标题后追加时间戳或序号）
    Rename,
    /// 合并到现有线程
    Merge,
    /// 替换现有线程
    Replace,
}

/// 线程导入路由器
///
/// 提供线程导入的路由决策和冲突检测能力。
/// 该路由器是无状态的，可以在多个调用方之间共享。
#[derive(Debug, Default, Clone)]
pub struct ImportThreadRouter;

impl ImportThreadRouter {
    /// 创建新的路由器
    pub fn new() -> Self {
        Self
    }

    /// 解析导入上下文，返回路由决策
    ///
    /// # 参数
    ///
    /// - `ctx`: 导入上下文
    /// - `existing_thread_ids`: 已存在的线程 ID 列表（用于冲突检测）
    /// - `existing_titles`: 已存在的线程标题列表
    /// - `project_exists`: 目标项目是否存在
    ///
    /// # 返回值
    ///
    /// - `Ok((route, resolution))`: 路由策略与冲突解决方式
    /// - `Err(OrchestrationError)`: 当出现无法解决的冲突且策略为 Abort 时
    pub fn resolve(
        &self,
        ctx: &ImportThreadContext,
        existing_thread_ids: &[ThreadId],
        existing_titles: &[String],
        project_exists: bool,
    ) -> OrchestrationResult<(ImportRoute, ConflictResolution)> {
        if !project_exists {
            return Err(OrchestrationError::CommandError(format!(
                "目标项目 {} 不存在",
                ctx.target_project_id
            )));
        }

        let route = ctx.derive_route();

        let conflict = self.detect_conflict(ctx, existing_thread_ids, existing_titles);

        let resolution = match conflict {
            Some(RouteConflict::ProjectNotFound) => {
                // 已在上方处理
                ConflictResolution::Abort
            }
            Some(RouteConflict::ThreadIdExists) | Some(RouteConflict::TitleExists) => {
                ConflictResolution::Rename
            }
            None => ConflictResolution::Merge,
        };

        Ok((route, resolution))
    }

    /// 检测冲突
    pub fn detect_conflict(
        &self,
        ctx: &ImportThreadContext,
        existing_thread_ids: &[ThreadId],
        existing_titles: &[String],
    ) -> Option<RouteConflict> {
        if existing_thread_ids.contains(&ctx.new_thread_id) {
            return Some(RouteConflict::ThreadIdExists);
        }
        if let Some(title) = &ctx.title_hint {
            if existing_titles.iter().any(|t| t == title) {
                return Some(RouteConflict::TitleExists);
            }
        }
        None
    }

    /// 解决标题冲突：附加序号后缀
    pub fn resolve_title_conflict(base_title: &str, existing_titles: &[String]) -> String {
        let mut counter = 1;
        loop {
            let candidate = format!("{base_title} ({counter})");
            if !existing_titles.contains(&candidate) {
                return candidate;
            }
            counter += 1;
            if counter > 1000 {
                // 防御性截断
                return format!("{base_title} (overflow)");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn codex_uses_standard_route() {
        let route = ImportRoute::from_provider_kind(ProviderKind::Codex);
        assert_eq!(route, ImportRoute::Standard);
    }

    #[test]
    fn claude_uses_format_transform() {
        let route = ImportRoute::from_provider_kind(ProviderKind::ClaudeAgent);
        assert_eq!(route, ImportRoute::FormatTransform);
    }

    #[test]
    fn detect_thread_id_conflict() {
        let router = ImportThreadRouter::new();
        let project_id = Uuid::new_v4();
        let thread_id = Uuid::new_v4();
        let ctx = ImportThreadContext {
            source_thread_id: "src".to_string(),
            source_provider: ProviderKind::Codex,
            target_project_id: project_id,
            new_thread_id: thread_id,
            title_hint: Some("Test".to_string()),
            is_fork: false,
        };
        let conflict = router.detect_conflict(&ctx, &[thread_id], &[]);
        assert_eq!(conflict, Some(RouteConflict::ThreadIdExists));
    }

    #[test]
    fn detect_title_conflict() {
        let router = ImportThreadRouter::new();
        let project_id = Uuid::new_v4();
        let thread_id = Uuid::new_v4();
        let ctx = ImportThreadContext {
            source_thread_id: "src".to_string(),
            source_provider: ProviderKind::Codex,
            target_project_id: project_id,
            new_thread_id: thread_id,
            title_hint: Some("My Thread".to_string()),
            is_fork: false,
        };
        let conflict = router.detect_conflict(&ctx, &[], &["My Thread".to_string()]);
        assert_eq!(conflict, Some(RouteConflict::TitleExists));
    }

    #[test]
    fn resolve_title_conflict_appends_counter() {
        let resolved = ImportThreadRouter::resolve_title_conflict(
            "Test",
            &["Test".to_string(), "Test (1)".to_string()],
        );
        assert_eq!(resolved, "Test (2)");
    }

    #[test]
    fn resolve_returns_error_when_project_missing() {
        let router = ImportThreadRouter::new();
        let project_id = Uuid::new_v4();
        let ctx = ImportThreadContext {
            source_thread_id: "src".to_string(),
            source_provider: ProviderKind::Codex,
            target_project_id: project_id,
            new_thread_id: Uuid::new_v4(),
            title_hint: None,
            is_fork: false,
        };
        let result = router.resolve(&ctx, &[], &[], false);
        assert!(result.is_err());
    }
}
