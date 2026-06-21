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
///
/// 在构建引导文本时，最近 N 条消息会保留完整内容（受 `RECENT_MESSAGE_CHAR_LIMIT` 限制），
/// 而更早的消息则使用截断摘要（受 `EARLIER_MESSAGE_CHAR_LIMIT` 限制）。
const RECENT_MESSAGE_COUNT: usize = 6;

/// 早期消息单条字符限制
///
/// 超出此长度的早期消息将被截断并添加省略号，以控制引导文本的总体积。
const EARLIER_MESSAGE_CHAR_LIMIT: usize = 320;

/// 最近消息单条字符限制
///
/// 最近消息保留更多内容，但仍需限制单条长度以避免超出 Provider 输入限制。
const RECENT_MESSAGE_CHAR_LIMIT: usize = 2400;

/// Provider 最大输入字符数（保守估计）
///
/// 用于计算引导文本的字符预算上限，取保守值以兼容不同 Provider 的输入限制。
const PROVIDER_MAX_INPUT_CHARS: usize = 100_000;

/// 交接引导文本字符预算（Provider 限制的 75%）
///
/// 预留 25% 的空间给系统提示词、用户当前输入等其他内容，
/// 确保引导文本不会挤占 Provider 的有效输入空间。
const HANDOFF_BOOTSTRAP_CHAR_BUDGET: usize = (PROVIDER_MAX_INPUT_CHARS * 75) / 100;

/// 标准化消息文本
///
/// 移除消息文本中多余的空白和换行符，使文本更紧凑，减少引导文本的体积。
/// 具体处理：
/// - 移除换行符前的多余空格（`' \n'` → `'\n'`）
/// - 将连续三个以上空行压缩为两个空行（`'\n\n\n'` → `'\n\n'`）
/// - 去除首尾空白
///
/// # 参数
///
/// - `text`: 原始消息文本
///
/// # 返回值
///
/// 返回标准化后的文本字符串
fn normalize_message_text(text: &str) -> String {
    text.replace(" \n", "\n")
        .split("\n\n\n")
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string()
}

/// 截断文本到指定长度
///
/// 当文本长度超过 `max_chars` 时，截断文本并添加省略号（`...`）。
/// 省略号占 3 个字符，因此实际截断位置为 `max_chars - 3`，
/// 并在截断后去除末尾空白以确保省略号紧贴有效内容。
///
/// # 参数
///
/// - `text`: 待截断的文本
/// - `max_chars`: 最大字符数限制
///
/// # 返回值
///
/// 如果文本长度未超过限制，返回原文本；否则返回截断后带省略号的文本
fn truncate_text(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    format!("{}...", &text[..max_chars.saturating_sub(3)].trim_end())
}

/// 获取消息角色标签
///
/// 将消息角色枚举转换为人类可读的标签字符串，用于引导文本中的消息格式化。
///
/// # 参数
///
/// - `role`: 消息角色枚举引用
///
/// # 返回值
///
/// 返回对应角色的标签字符串：
/// - `Assistant` → `'Assistant'`
/// - `User` → `'User'`
/// - `System` → `'System'`
fn role_label(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::Assistant => "Assistant",
        MessageRole::User => "User",
        MessageRole::System => "System",
    }
}

/// 列出导入的交接消息
///
/// 从线程的消息列表中筛选出通过交接导入的消息（source 为 'handoff-import'），
/// 仅包含用户和助手角色的非流式消息。
///
/// # 参数
///
/// - `thread`: 目标线程引用
///
/// # 返回值
///
/// 返回所有符合条件的消息引用列表，按消息在线程中的顺序排列
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
/// 从线程的消息列表中筛选出通过分叉导入的消息（source 为 'fork-import'），
/// 仅包含用户和助手角色的非流式消息。
///
/// # 参数
///
/// - `thread`: 目标线程引用
///
/// # 返回值
///
/// 返回所有符合条件的消息引用列表，按消息在线程中的顺序排列
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
/// 判断线程是否包含由当前 Provider 原生产生的对话消息（source 为 'native'）。
/// 用于判断线程是否已有足够的原生对话，可以再次交接给其他 Provider。
///
/// # 参数
///
/// - `thread`: 目标线程引用
///
/// # 返回值
///
/// 如果线程中存在至少一条原生用户或助手消息（非流式），返回 `true`；否则返回 `false`
pub fn has_native_handoff_messages(thread: &Thread) -> bool {
    thread.messages.iter().any(|msg| {
        matches!(msg.role, MessageRole::User | MessageRole::Assistant)
            && msg.source.as_ref().map(|s| s.provider.as_str()) == Some("native")
            && !msg.streaming
    })
}

/// 构建交接引导文本
///
/// 将导入的交接消息压缩为上下文摘要，供新 Provider 使用。
/// 引导文本包含：交接来源说明、原始对话标题、分支信息、早期消息摘要和最近消息完整内容。
///
/// # 参数
///
/// - `thread`: 包含交接信息的线程，需同时具备 `handoff` 元数据和导入消息
/// - `max_chars`: 最大字符数限制，默认为 `HANDOFF_BOOTSTRAP_CHAR_BUDGET`
///
/// # 返回值
///
/// - `Some(String)`: 成功构建的引导文本
/// - `None`: 无导入消息或线程无交接信息时返回
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
/// 将导入的分叉消息压缩为上下文摘要，供分叉线程使用。
/// 引导文本包含：分叉来源说明、原始对话标题、分支信息和消息内容。
///
/// # 参数
///
/// - `thread`: 包含分叉导入消息的线程
/// - `max_chars`: 最大字符数限制，默认为 `HANDOFF_BOOTSTRAP_CHAR_BUDGET`
///
/// # 返回值
///
/// - `Some(String)`: 成功构建的引导文本
/// - `None`: 无导入的分叉消息时返回
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
/// 用于会话重启时，将当前消息之前的对话记录作为上下文提供给 Provider。
/// 仅包含用户和助手角色的非流式、非空消息。
///
/// # 参数
///
/// - `thread`: 目标线程引用
/// - `current_message_id`: 当前消息的 ID，函数将取此消息之前的所有消息作为上下文
/// - `max_chars`: 最大字符数限制，默认为 `HANDOFF_BOOTSTRAP_CHAR_BUDGET`
///
/// # 返回值
///
/// - `Some(String)`: 成功构建的引导文本
/// - `None`: 当前消息是第一条消息、之前无有效消息、或消息 ID 不存在时返回
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
    let intro = "This provider session may have been restarted without native conversation state. Use this prior Remi Claw transcript as context for the latest user message.".to_string();

    build_imported_messages_bootstrap_text(thread, &prior_messages, &intro, max_chars)
}

/// 构建导入消息的引导文本（内部方法）
///
/// 将导入的消息列表压缩为结构化的上下文摘要，包含以下部分：
/// 1. 引言说明（交接/分叉/先前对话的来源描述）
/// 2. 原始对话标题
/// 3. Git 分支信息（如有）
/// 4. Worktree 路径信息（如有）
/// 5. 早期消息摘要（截断格式，每条最多 `EARLIER_MESSAGE_CHAR_LIMIT` 字符）
/// 6. 最近消息完整内容（每条最多 `RECENT_MESSAGE_CHAR_LIMIT` 字符）
///
/// 最终文本会被截断到 `max_chars` 限制内。
///
/// # 参数
///
/// - `thread`: 目标线程引用，用于获取标题、分支等元数据
/// - `imported_messages`: 导入的消息列表
/// - `intro`: 引言文本，描述消息来源
/// - `max_chars`: 最大字符数限制
///
/// # 返回值
///
/// - `Some(String)`: 成功构建的引导文本
/// - `None`: 消息列表为空时返回
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

    /// 测试消息文本标准化功能
    #[test]
    fn test_normalize_message_text() {
        // 测试移除换行符前的空格
        assert_eq!(normalize_message_text("hello \nworld"), "hello\nworld");
        // 测试压缩连续三个空行为两个
        assert_eq!(normalize_message_text("a\n\n\nb"), "a\n\nb");
    }

    /// 测试文本截断功能
    #[test]
    fn test_truncate_text() {
        // 短文本不应被截断
        assert_eq!(truncate_text("short", 10), "short");
        // 长文本应被截断并添加省略号
        assert_eq!(truncate_text("this is a long text", 10), "this is...");
    }
}
