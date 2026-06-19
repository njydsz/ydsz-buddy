//! # 交接（Handoff）模块
//!
//! 本模块实现了线程间上下文交接的功能，支持以下场景：
//! - **Handoff**: 从一个 Provider 的线程移交给另一个 Provider
//! - **Fork**: 从现有线程分叉出新的侧聊线程
//! - **Prior Transcript**: 重启会话时保留之前的对话记录作为上下文
//!
//! ## 核心功能
//!
//! - 构建交接引导文本，将历史对话压缩为上下文摘要
//! - 识别导入的消息（handoff-import / fork-import）
//! - 检查线程是否包含原生交接消息
//!
//! ## 设计原则
//!
//! - 引导文本控制在 Provider 输入限制的 75% 以内
//! - 优先保留最近 6 条消息的完整内容
//! - 更早的消息使用截断摘要

use remi_core::models::{Message, MessageRole, Thread};

/// 最近消息数量（保留完整内容）
const RECENT_MESSAGE_COUNT: usize = 6;

/// 早期消息单条字符限制
const EARLIER_MESSAGE_CHAR_LIMIT: usize = 320;

/// 最近消息单条字符限制
const RECENT_MESSAGE_CHAR_LIMIT: usize = 2400;

/// Provider 最大输入字符数（保守估计）
const PROVIDER_MAX_INPUT_CHARS: usize = 100_000;

/// 交接引导文本字符预算（Provider 限制的 75%）
const HANDOFF_BOOTSTRAP_CHAR_BUDGET: usize = (PROVIDER_MAX_INPUT_CHARS * 75) / 100;

/// 标准化消息文本
///
/// 移除多余的空白和换行，使文本更紧凑
fn normalize_message_text(text: &str) -> String {
    text.replace(" \n", "\n")
        .split("\n\n\n")
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string()
}

/// 截断文本到指定长度
fn truncate_text(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    format!("{}...", &text[..max_chars.saturating_sub(3)].trim_end())
}

/// 获取消息角色标签
fn role_label(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::Assistant => "Assistant",
        MessageRole::User => "User",
        MessageRole::System => "System",
    }
}

/// 列出导入的交接消息
///
/// 筛选出 source 为 "handoff-import" 的用户和助手消息
pub fn list_imported_handoff_messages(thread: &Thread) -> Vec<&Message> {
    thread
        .messages
        .iter()
        .filter(|msg| {
            msg.source.as_ref().map(|s| s.provider.as_str()) == Some("handoff-import")
                && matches!(msg.role, MessageRole::User | MessageRole::Assistant)
                && !msg.streaming
        })
        .collect()
}

/// 列出导入的分叉消息
///
/// 筛选出 source 为 "fork-import" 的用户和助手消息
pub fn list_imported_fork_messages(thread: &Thread) -> Vec<&Message> {
    thread
        .messages
        .iter()
        .filter(|msg| {
            msg.source.as_ref().map(|s| s.provider.as_str()) == Some("fork-import")
                && matches!(msg.role, MessageRole::User | MessageRole::Assistant)
                && !msg.streaming
        })
        .collect()
}

/// 检查线程是否包含原生交接消息
///
/// 用于判断线程是否已经有足够的原生对话，可以再次交接
pub fn has_native_handoff_messages(thread: &Thread) -> bool {
    thread.messages.iter().any(|msg| {
        matches!(msg.role, MessageRole::User | MessageRole::Assistant)
            && msg.source.as_ref().map(|s| s.provider.as_str()) == Some("native")
            && !msg.streaming
    })
}

/// 构建交接引导文本
///
/// 将导入的交接消息压缩为上下文摘要，供新 Provider 使用
///
/// # 参数
///
/// - `thread`: 包含交接信息的线程
/// - `max_chars`: 最大字符数限制（默认为 HANDOFF_BOOTSTRAP_CHAR_BUDGET）
///
/// # 返回值
///
/// 返回 Some(String) 表示成功构建引导文本，None 表示无导入消息或无交接信息
pub fn build_handoff_bootstrap_text(thread: &Thread, max_chars: Option<usize>) -> Option<String> {
    let imported_messages = list_imported_handoff_messages(thread);
    if imported_messages.is_empty() || thread.handoff.is_none() {
        return None;
    }

    let max_chars = max_chars.unwrap_or(HANDOFF_BOOTSTRAP_CHAR_BUDGET);
    let intro = format!(
        "This conversation was handed off from {}.",
        thread.handoff.as_ref()?.source_thread_id
    );

    build_imported_messages_bootstrap_text(thread, &imported_messages, &intro, max_chars)
}

/// 构建分叉引导文本
///
/// 将导入的分叉消息压缩为上下文摘要
pub fn build_fork_bootstrap_text(thread: &Thread, max_chars: Option<usize>) -> Option<String> {
    let imported_messages = list_imported_fork_messages(thread);
    if imported_messages.is_empty() {
        return None;
    }

    let max_chars = max_chars.unwrap_or(HANDOFF_BOOTSTRAP_CHAR_BUDGET);
    let intro = "This sidechat was cloned from an earlier conversation.".to_string();

    build_imported_messages_bootstrap_text(thread, &imported_messages, &intro, max_chars)
}

/// 构建先前对话记录引导文本
///
/// 用于会话重启时，将之前的对话记录作为上下文
pub fn build_prior_transcript_bootstrap_text(
    thread: &Thread,
    current_message_id: &str,
    max_chars: Option<usize>,
) -> Option<String> {
    let current_index = thread
        .messages
        .iter()
        .position(|m| m.id.to_string() == current_message_id)?;

    if current_index == 0 {
        return None;
    }

    let prior_messages: Vec<&Message> = thread.messages[..current_index]
        .iter()
        .filter(|msg| {
            matches!(msg.role, MessageRole::User | MessageRole::Assistant)
                && !msg.streaming
                && !normalize_message_text(&msg.text).is_empty()
        })
        .collect();

    if prior_messages.is_empty() {
        return None;
    }

    let max_chars = max_chars.unwrap_or(HANDOFF_BOOTSTRAP_CHAR_BUDGET);
    let intro = "This provider session may have been restarted without native conversation state. Use this prior Peak Code transcript as context for the latest user message.".to_string();

    build_imported_messages_bootstrap_text(thread, &prior_messages, &intro, max_chars)
}

/// 构建导入消息的引导文本（内部方法）
///
/// 将导入的消息列表压缩为结构化的上下文摘要
fn build_imported_messages_bootstrap_text(
    thread: &Thread,
    imported_messages: &[&Message],
    intro: &str,
    max_chars: usize,
) -> Option<String> {
    if imported_messages.is_empty() {
        return None;
    }

    let mut sections = vec![
        intro.to_string(),
        format!("Original conversation title: {}", thread.title),
    ];

    // 添加分支信息
    if let Some(ref branch) = thread.branch {
        sections.push(format!("Git branch: {}", branch));
    }

    // 添加 worktree 路径
    if let Some(ref worktree_path) = thread.worktree_path {
        sections.push(format!("Worktree path: {}", worktree_path));
    }

    // 分离早期消息和最近消息
    let (earlier_messages, recent_messages) = if imported_messages.len() > RECENT_MESSAGE_COUNT {
        let split_point = imported_messages.len() - RECENT_MESSAGE_COUNT;
        (
            Some(&imported_messages[..split_point]),
            &imported_messages[split_point..],
        )
    } else {
        (None, imported_messages)
    };

    // 添加早期消息摘要
    if let Some(earlier) = earlier_messages {
        if !earlier.is_empty() {
            let summary = earlier
                .iter()
                .map(|msg| {
                    let normalized = truncate_text(
                        &normalize_message_text(&msg.text),
                        EARLIER_MESSAGE_CHAR_LIMIT,
                    );
                    format!("- {}: {}", role_label(&msg.role), normalized)
                })
                .collect::<Vec<_>>()
                .join("\n");

            sections.push(format!("Earlier conversation summary:\n{}", summary));
        }
    }

    // 添加最近消息
    let recent_text = recent_messages
        .iter()
        .map(|msg| {
            let normalized =
                truncate_text(&normalize_message_text(&msg.text), RECENT_MESSAGE_CHAR_LIMIT);
            format!("{}:\n{}", role_label(&msg.role), normalized)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    sections.push(format!("Most recent imported messages:\n{}", recent_text));

    // 合并所有章节并截断
    let joined = sections.join("\n\n").trim().to_string();
    Some(truncate_text(&joined, max_chars))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_message_text() {
        assert_eq!(normalize_message_text("hello \nworld"), "hello\nworld");
        assert_eq!(normalize_message_text("a\n\n\nb"), "a\n\nb");
    }

    #[test]
    fn test_truncate_text() {
        assert_eq!(truncate_text("short", 10), "short");
        assert_eq!(truncate_text("this is a long text", 10), "this is...");
    }
}
