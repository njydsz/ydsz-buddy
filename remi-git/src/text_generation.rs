//! # Git 文本生成服务
//!
//! 本模块提供基于 Git 差异内容调用 AI Provider 生成文本的功能，如提交消息、PR 描述等。

use std::sync::Arc;
use tracing::{debug, info};

use crate::core::GitCore;
use crate::error::{GitError, GitResult};

/// 文本生成输入参数
#[derive(Debug, Clone)]
pub struct GenerateTextInput {
    /// Git 工作目录
    pub cwd: String,
    /// 要生成的文本类型
    pub text_type: TextGenerationType,
    /// 可选的上下文信息（如 diff 内容）
    pub context: Option<String>,
}

/// 文本生成类型
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TextGenerationType {
    /// 提交消息
    CommitMessage,
    /// PR 标题
    PrTitle,
    /// PR 描述
    PrDescription,
    /// 代码审查建议
    CodeReviewSuggestion,
}

/// 文本生成结果
#[derive(Debug, Clone)]
pub struct GenerateTextResult {
    /// 生成的文本内容
    pub text: String,
    /// 使用的 Provider（如果适用）
    pub provider: Option<String>,
}

/// Git 文本生成服务
///
/// 负责根据 Git 差异内容生成各种文本（提交消息、PR 描述等）。
pub struct GitTextGenerationService {
    /// Git 核心服务
    core: Arc<GitCore>,
}

impl GitTextGenerationService {
    /// 创建新的文本生成服务实例
    pub fn new(core: Arc<GitCore>) -> Self {
        Self { core }
    }

    /// 准备提交上下文并生成提交消息
    ///
    /// # 参数
    ///
    /// - `cwd`: Git 工作目录
    /// - `file_paths`: 要包含的文件路径列表（None 表示所有更改）
    ///
    /// # 返回值
    ///
    /// - `Ok(GenerateTextResult)`: 生成的提交消息
    /// - `Err(GitError)`: 生成失败
    pub async fn generate_commit_message(
        &self,
        cwd: &str,
        file_paths: Option<&[String]>,
    ) -> GitResult<GenerateTextResult> {
        info!("生成提交消息: cwd={}", cwd);

        // 获取暂存区补丁
        let context = self.core.prepare_commit_context(cwd, file_paths).await?;
        
        match context {
            Some(ctx) => {
                debug!("暂存区内容：{} 字节", ctx.staged_patch.len());
                
                // TODO: 调用 Provider 生成提交消息
                // 当前返回占位符文本
                let message = format!(
                    "chore: update based on staged changes\n\n{}",
                    ctx.staged_summary.lines().take(5).collect::<Vec<_>>().join("\n")
                );

                Ok(GenerateTextResult {
                    text: message,
                    provider: None,
                })
            }
            None => Err(GitError::CommandError(
                "没有可提交的更改".to_string(),
            )),
        }
    }

    /// 生成 PR 标题
    ///
    /// # 参数
    ///
    /// - `cwd`: Git 工作目录
    /// - `base_branch`: 基础分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 生成的 PR 标题
    /// - `Err(GitError)`: 生成失败
    pub async fn generate_pr_title(
        &self,
        cwd: &str,
        base_branch: Option<&str>,
    ) -> GitResult<String> {
        info!("生成 PR 标题：cwd={}", cwd);

        // 获取分支差异
        let details = self.core.status_details(cwd).await?;
        let current_branch = details.branch.ok_or_else(|| {
            GitError::CommandError("无法确定当前分支".to_string())
        })?;

        let default_base = "main".to_string();
        let base = base_branch.unwrap_or_else(|| {
            details.upstream_ref.as_deref().unwrap_or(&default_base)
        });

        // 获取分支补丁
        let patch = self.core.read_branch_patch(cwd).await?;
        
        debug!("分支差异：{} 字节", patch.patch.len());

        // TODO: 调用 Provider 生成 PR 标题
        // 当前返回占位符文本
        let title = format!(
            "feat({}): update from {}",
            current_branch,
            base
        );

        Ok(title)
    }

    /// 生成 PR 描述
    ///
    /// # 参数
    ///
    /// - `cwd`: Git 工作目录
    /// - `base_branch`: 基础分支名称（可选）
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 生成的 PR 描述（Markdown 格式）
    /// - `Err(GitError)`: 生成失败
    pub async fn generate_pr_description(
        &self,
        cwd: &str,
        base_branch: Option<&str>,
    ) -> GitResult<String> {
        info!("生成 PR 描述：cwd={}", cwd);

        let details = self.core.status_details(cwd).await?;
        let _current_branch = details.branch.ok_or_else(|| {
            GitError::CommandError("无法确定当前分支".to_string())
        })?;

        let upstream = details.upstream_ref.unwrap_or_else(|| "main".to_string());
        let base = base_branch.unwrap_or(&upstream);

        // 获取分支范围和补丁
        let range_ctx = self.core.read_range_context(cwd, base).await?;
        
        debug!(
            "分支范围：{} 个提交，{} 字节差异",
            range_ctx.commits.len(),
            range_ctx.patch.len()
        );

        // TODO: 调用 Provider 生成 PR 描述
        // 当前返回模板化描述
        let mut description = String::new();
        description.push_str(&format!("## Changes from {}\n\n", base));
        description.push_str(&format!("### Commits ({})\n\n", range_ctx.commits.len()));
        
        for commit in &range_ctx.commits {
            description.push_str(&format!("- {}\n", commit));
        }

        if !range_ctx.patch.is_empty() {
            description.push_str("\n### Summary\n\n");
            description.push_str("This PR contains changes including:\n");
            
            // 简单统计
            let additions = range_ctx.patch.lines().filter(|l| l.starts_with('+') && !l.starts_with("+++")).count();
            let deletions = range_ctx.patch.lines().filter(|l| l.starts_with('-') && !l.starts_with("---")).count();
            
            description.push_str(&format!("- {} lines added\n", additions));
            description.push_str(&format!("- {} lines deleted\n", deletions));
        }

        Ok(description)
    }
}
