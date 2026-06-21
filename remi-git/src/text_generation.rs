//! # Git 文本生成服务
//!
//! 本模块提供基于 Git 差异内容调用 AI Provider 生成文本的功能，如提交消息、PR 描述等。
//!
//! ## 设计说明
//!
//! 文本生成服务通过 `ProviderService` 与 AI Provider 交互，采用以下流程：
//! 1. 从 Git 差异中提取上下文信息
//! 2. 构造提示词（prompt）
//! 3. 创建临时会话并发送 Turn
//! 4. 监听事件流，收集 Assistant 文本响应
//! 5. 清理临时会话并返回生成结果

use std::sync::Arc;
use tracing::{debug, info, warn};

use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSessionStartInput, TurnInput,
};
use remi_provider::service::ProviderService;

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
/// 通过集成 ProviderService 实现 AI 驱动的文本生成。
pub struct GitTextGenerationService {
    /// Git 核心服务
    core: Arc<GitCore>,
    /// Provider 服务（可选，用于 AI 文本生成）
    provider_service: Option<Arc<ProviderService>>,
    /// 默认使用的 Provider
    default_provider: ProviderKind,
    /// 默认使用的模型
    default_model: String,
}

impl GitTextGenerationService {
    /// 创建新的文本生成服务实例（无 Provider 支持，仅返回模板文本）
    pub fn new(core: Arc<GitCore>) -> Self {
        Self {
            core,
            provider_service: None,
            default_provider: ProviderKind::ClaudeAgent,
            default_model: "claude-sonnet-4-5".to_string(),
        }
    }

    /// 创建带 Provider 支持的文本生成服务实例
    pub fn with_provider(
        core: Arc<GitCore>,
        provider_service: Arc<ProviderService>,
    ) -> Self {
        Self {
            core,
            provider_service: Some(provider_service),
            default_provider: ProviderKind::ClaudeAgent,
            default_model: "claude-sonnet-4-5".to_string(),
        }
    }

    /// 设置默认 Provider 和模型
    pub fn with_default_model(mut self, provider: ProviderKind, model: impl Into<String>) -> Self {
        self.default_provider = provider;
        self.default_model = model.into();
        self
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

                // 如果有 Provider 支持，使用 AI 生成
                if let Some(provider_svc) = &self.provider_service {
                    let prompt = build_commit_message_prompt(&ctx.staged_patch, &ctx.staged_summary);
                    match self.generate_with_provider(provider_svc, &prompt).await {
                        Ok(result) => return Ok(result),
                        Err(e) => {
                            warn!("Provider 生成提交消息失败，降级到模板: {}", e);
                        }
                    }
                }

                // 降级：返回模板化提交消息
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

        // 如果有 Provider 支持，使用 AI 生成
        if let Some(provider_svc) = &self.provider_service {
            let prompt = build_pr_title_prompt(&patch.patch, &current_branch, base);
            match self.generate_with_provider(provider_svc, &prompt).await {
                Ok(result) => return Ok(result.text),
                Err(e) => {
                    warn!("Provider 生成 PR 标题失败，降级到模板: {}", e);
                }
            }
        }

        // 降级：返回模板化 PR 标题
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

        // 如果有 Provider 支持，使用 AI 生成
        if let Some(provider_svc) = &self.provider_service {
            let prompt = build_pr_description_prompt(
                &range_ctx.patch,
                &range_ctx.commits,
                base,
            );
            match self.generate_with_provider(provider_svc, &prompt).await {
                Ok(result) => return Ok(result.text),
                Err(e) => {
                    warn!("Provider 生成 PR 描述失败，降级到模板: {}", e);
                }
            }
        }

        // 降级：返回模板化描述
        let mut description = String::new();
        description.push_str(&format!("## Changes from {}\n\n", base));
        description.push_str(&format!("### Commits ({})\n\n", range_ctx.commits.len()));

        for commit in &range_ctx.commits {
            description.push_str(&format!("- {}\n", commit));
        }

        if !range_ctx.patch.is_empty() {
            description.push_str("\n### Summary\n\n");
            description.push_str("This PR contains changes including:\n");

            let additions = range_ctx.patch.lines().filter(|l| l.starts_with('+') && !l.starts_with("+++")).count();
            let deletions = range_ctx.patch.lines().filter(|l| l.starts_with('-') && !l.starts_with("---")).count();

            description.push_str(&format!("- {} lines added\n", additions));
            description.push_str(&format!("- {} lines deleted\n", deletions));
        }

        Ok(description)
    }

    /// 通过 Provider 服务生成文本
    ///
    /// 内部流程：
    /// 1. 创建临时会话
    /// 2. 发送提示词 Turn
    /// 3. 监听事件流收集响应文本
    /// 4. 清理临时会话
    async fn generate_with_provider(
        &self,
        provider_svc: &Arc<ProviderService>,
        prompt: &str,
    ) -> GitResult<GenerateTextResult> {
        let thread_id = format!("git-text-gen-{}", uuid::Uuid::new_v4());
        let provider = self.default_provider;
        let model = self.default_model.clone();

        info!(
            "通过 Provider 生成文本: thread_id={}, provider={:?}, model={}",
            thread_id, provider, model
        );

        // 1. 启动临时会话
        let start_input = ProviderSessionStartInput {
            thread_id: thread_id.clone(),
            provider,
            model: model.clone(),
        };

        provider_svc
            .start_session(&thread_id, start_input)
            .await
            .map_err(|e| GitError::CommandError(format!("启动 Provider 会话失败: {}", e)))?;

        // 2. 订阅事件流（在发送 Turn 之前订阅，避免错过事件）
        let mut event_rx = provider_svc.stream_events();

        // 3. 发送 Turn
        let turn_id = format!("turn-{}", uuid::Uuid::new_v4());
        let turn_input = TurnInput {
            thread_id: thread_id.clone(),
            turn_id: turn_id.clone(),
            provider,
            message: prompt.to_string(),
        };

        provider_svc
            .send_turn(turn_input)
            .await
            .map_err(|e| GitError::CommandError(format!("发送 Turn 失败: {}", e)))?;

        // 4. 监听事件流，收集 Assistant 文本
        let generated_text = self
            .collect_response_from_events(&mut event_rx, &thread_id, &turn_id)
            .await?;

        // 5. 清理临时会话
        if let Err(e) = provider_svc.stop_session(&thread_id, provider).await {
            warn!("清理临时会话失败: {}", e);
        }

        info!(
            "Provider 文本生成完成: {} 字节, provider={:?}",
            generated_text.len(),
            provider
        );

        Ok(GenerateTextResult {
            text: generated_text,
            provider: Some(format!("{:?}", provider)),
        })
    }

    /// 从事件流中收集 Provider 响应文本
    ///
    /// 监听 TurnDelta 事件拼接文本，直到 TurnCompleted 或超时。
    async fn collect_response_from_events(
        &self,
        event_rx: &mut tokio::sync::broadcast::Receiver<ProviderRuntimeEvent>,
        thread_id: &str,
        turn_id: &str,
    ) -> GitResult<String> {
        let mut collected_text = String::new();
        let timeout_duration = std::time::Duration::from_secs(60);

        loop {
            match tokio::time::timeout(timeout_duration, event_rx.recv()).await {
                Ok(Ok(event)) => {
                    #[allow(clippy::collapsible_match)]
                    match &event {
                        ProviderRuntimeEvent::TurnDelta {
                            session_id,
                            turn_id: evt_turn_id,
                            delta,
                        } => {
                            if session_id == thread_id && evt_turn_id == turn_id {
                                collected_text.push_str(delta);
                            }
                        }
                        ProviderRuntimeEvent::TurnCompleted {
                            session_id,
                            turn_id: evt_turn_id,
                        } => {
                            if session_id == thread_id && evt_turn_id == turn_id {
                                debug!("Turn 完成，收集到 {} 字节文本", collected_text.len());
                                break;
                            }
                        }
                        ProviderRuntimeEvent::TurnComplete {
                            turn_id: evt_turn_id,
                            result,
                        } => {
                            if evt_turn_id == turn_id {
                                // 尝试从 result 中提取文本
                                if let Some(text) = result.get("text").and_then(|v| v.as_str()) {
                                    if collected_text.is_empty() {
                                        collected_text = text.to_string();
                                    }
                                }
                                break;
                            }
                        }
                        ProviderRuntimeEvent::Error {
                            session_id,
                            error,
                        } => {
                            if session_id == thread_id {
                                return Err(GitError::CommandError(
                                    format!("Provider 错误: {}", error),
                                ));
                            }
                        }
                        _ => {
                            // 忽略其他事件
                        }
                    }
                }
                Ok(Err(_)) => {
                    // 通道关闭
                    break;
                }
                Err(_) => {
                    // 超时
                    warn!("等待 Provider 响应超时（60秒）");
                    break;
                }
            }
        }

        if collected_text.is_empty() {
            return Err(GitError::CommandError(
                "Provider 未返回任何文本".to_string(),
            ));
        }

        Ok(collected_text.trim().to_string())
    }
}

/// 构建提交消息生成提示词
fn build_commit_message_prompt(staged_patch: &str, staged_summary: &str) -> String {
    let mut prompt = String::new();
    prompt.push_str("You are a Git commit message generator. ");
    prompt.push_str("Generate a concise, conventional commit message based on the staged changes below.\n\n");
    prompt.push_str("Requirements:\n");
    prompt.push_str("- First line: type(scope): short summary (max 72 chars)\n");
    prompt.push_str("- Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci\n");
    prompt.push_str("- Body: explain WHAT and WHY, not HOW\n");
    prompt.push_str("- Keep it clear and actionable\n\n");
    prompt.push_str("Staged changes summary:\n");
    prompt.push_str(staged_summary);
    prompt.push_str("\n\nStaged diff:\n```diff\n");
    // 限制 diff 长度，避免超出上下文窗口
    let max_patch_len = 8000;
    if staged_patch.len() > max_patch_len {
        prompt.push_str(&staged_patch[..max_patch_len]);
        prompt.push_str("\n... (truncated)");
    } else {
        prompt.push_str(staged_patch);
    }
    prompt.push_str("\n```\n\nGenerate the commit message now:");
    prompt
}

/// 构建 PR 标题生成提示词
fn build_pr_title_prompt(patch: &str, current_branch: &str, base_branch: &str) -> String {
    let mut prompt = String::new();
    prompt.push_str("You are a PR title generator. ");
    prompt.push_str("Generate a concise, descriptive PR title based on the branch diff below.\n\n");
    prompt.push_str("Requirements:\n");
    prompt.push_str("- Max 72 characters\n");
    prompt.push_str("- Use conventional commit format: type(scope): description\n");
    prompt.push_str("- Be specific about what changed\n\n");
    prompt.push_str(&format!("Branch: {} -> {}\n\n", current_branch, base_branch));
    prompt.push_str("Diff:\n```diff\n");
    let max_patch_len = 8000;
    if patch.len() > max_patch_len {
        prompt.push_str(&patch[..max_patch_len]);
        prompt.push_str("\n... (truncated)");
    } else {
        prompt.push_str(patch);
    }
    prompt.push_str("\n```\n\nGenerate the PR title now:");
    prompt
}

/// 构建 PR 描述生成提示词
fn build_pr_description_prompt(patch: &str, commits: &[String], base_branch: &str) -> String {
    let mut prompt = String::new();
    prompt.push_str("You are a PR description generator. ");
    prompt.push_str("Generate a detailed, well-structured PR description in Markdown format.\n\n");
    prompt.push_str("Requirements:\n");
    prompt.push_str("- Start with a brief summary of changes\n");
    prompt.push_str("- List key changes with bullet points\n");
    prompt.push_str("- Include statistics (files changed, additions, deletions)\n");
    prompt.push_str("- Use Markdown formatting\n\n");
    prompt.push_str(&format!("Base branch: {}\n\n", base_branch));
    prompt.push_str(&format!("Commits ({}):\n", commits.len()));
    for commit in commits {
        prompt.push_str(&format!("- {}\n", commit));
    }
    prompt.push_str("\nDiff:\n```diff\n");
    let max_patch_len = 8000;
    if patch.len() > max_patch_len {
        prompt.push_str(&patch[..max_patch_len]);
        prompt.push_str("\n... (truncated)");
    } else {
        prompt.push_str(patch);
    }
    prompt.push_str("\n```\n\nGenerate the PR description now:");
    prompt
}
