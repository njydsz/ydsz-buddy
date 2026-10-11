//! # 行级 Review Comment 后端持久化
//!
//! 把 Diff 评审中的行级评论从 localStorage 迁移到磁盘文件持久化,
//! 确保评论在应用重启 / 工作区切换后不丢失.
//!
//! ## 存储位置
//!
//! `{workspace_root}/.ydsz/review-comments.json`
//!
//! ## 数据模型
//!
//! 每条评论包含: id / threadId / turnId / filePath / hunkIndex / lineNumber /
//! lineType / lineContent / body / author / status / createdAt / updatedAt
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `review_comment_list` | 列出评论(可按 threadId/turnId 过滤) |
//! | `review_comment_add` | 新增评论 |
//! | `review_comment_update_body` | 更新评论正文 |
//! | `review_comment_set_status` | 切换评论状态(open/resolved/dismissed) |
//! | `review_comment_delete` | 删除评论 |
//! | `review_comment_clear_for_thread` | 清空某线程所有评论 |
//! | `review_comment_clear_for_turn` | 清空某 turn 所有评论 |

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tracing::warn;

// ===== 数据模型 =====

/// 行级 Review Comment(与前端 ReviewComment 对齐)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub id: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub file_path: String,
    pub hunk_index: u32,
    pub line_number: u32,
    pub line_type: String,
    pub line_content: String,
    pub body: String,
    pub author: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 新建评论入参(前端生成 id / 时间,后端直接存储)
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewReviewCommentInput {
    pub id: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub file_path: String,
    pub hunk_index: u32,
    pub line_number: u32,
    pub line_type: String,
    pub line_content: String,
    pub body: String,
    pub author: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 评论状态变更入参
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SetCommentStatusInput {
    pub id: String,
    pub status: String,
}

/// 更新正文入参
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBodyInput {
    pub id: String,
    pub body: String,
}

// ===== 持久化层 =====

const MAX_PERSISTED_COMMENTS: usize = 500;

/// 评论存储文件路径
fn store_path(workspace_root: &str) -> PathBuf {
    PathBuf::from(workspace_root).join(".ydsz").join("review-comments.json")
}

/// 读取所有评论(文件不存在时返回空)
fn load_comments(workspace_root: &str) -> Vec<ReviewComment> {
    let path = store_path(workspace_root);
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            let comments: Vec<ReviewComment> = serde_json::from_str(&content)
                .unwrap_or_default();
            comments
        }
        Err(_) => Vec::new(),
    }
}

/// 写入评论到磁盘(自动创建 .ydsz 目录)
fn save_comments(workspace_root: &str, comments: &[ReviewComment]) -> Result<(), String> {
    let path = store_path(workspace_root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(comments).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

/// 当前 ISO 8601 时间
fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// 保留最近 MAX 条(按 updatedAt 降序)
fn prune_oldest(mut comments: Vec<ReviewComment>) -> Vec<ReviewComment> {
    if comments.len() <= MAX_PERSISTED_COMMENTS {
        return comments;
    }
    comments.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    comments.truncate(MAX_PERSISTED_COMMENTS);
    comments
}

// ===== Tauri 命令 =====

/// 列出评论(可按 threadId / turnId 过滤)
#[tauri::command]
#[specta::specta]
pub async fn review_comment_list(
    workspace_root: String,
    thread_id: Option<String>,
    turn_id: Option<String>,
) -> Result<Vec<ReviewComment>, String> {
    let mut comments = load_comments(&workspace_root);
    if let Some(tid) = &thread_id {
        comments.retain(|c| &c.thread_id == tid);
    }
    if let Some(tnid) = &turn_id {
        // turn_id 匹配: None 也匹配 None(工作区级评论)
        comments.retain(|c| c.turn_id.as_deref() == Some(tnid.as_str()));
    }
    // 按 createdAt 升序
    comments.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(comments)
}

/// 新增评论(前端生成 id / 时间,后端直接存储)
#[tauri::command]
#[specta::specta]
pub async fn review_comment_add(
    workspace_root: String,
    input: NewReviewCommentInput,
) -> Result<ReviewComment, String> {
    let mut comments = load_comments(&workspace_root);
    let comment = ReviewComment {
        id: input.id,
        thread_id: input.thread_id,
        turn_id: input.turn_id,
        file_path: input.file_path,
        hunk_index: input.hunk_index,
        line_number: input.line_number,
        line_type: input.line_type,
        line_content: input.line_content,
        body: input.body,
        author: input.author,
        status: input.status,
        created_at: input.created_at,
        updated_at: input.updated_at,
    };
    comments.push(comment.clone());
    let pruned = prune_oldest(comments);
    save_comments(&workspace_root, &pruned)?;
    Ok(comment)
}

/// 更新评论正文
#[tauri::command]
#[specta::specta]
pub async fn review_comment_update_body(
    workspace_root: String,
    input: UpdateBodyInput,
) -> Result<(), String> {
    let mut comments = load_comments(&workspace_root);
    let comment = comments
        .iter_mut()
        .find(|c| c.id == input.id)
        .ok_or_else(|| format!("评论不存在: {}", input.id))?;
    comment.body = input.body;
    comment.updated_at = now_iso();
    save_comments(&workspace_root, &comments)?;
    Ok(())
}

/// 切换评论状态
#[tauri::command]
#[specta::specta]
pub async fn review_comment_set_status(
    workspace_root: String,
    input: SetCommentStatusInput,
) -> Result<(), String> {
    let mut comments = load_comments(&workspace_root);
    let comment = comments
        .iter_mut()
        .find(|c| c.id == input.id)
        .ok_or_else(|| format!("评论不存在: {}", input.id))?;
    comment.status = input.status;
    comment.updated_at = now_iso();
    save_comments(&workspace_root, &comments)?;
    Ok(())
}

/// 删除评论
#[tauri::command]
#[specta::specta]
pub async fn review_comment_delete(
    workspace_root: String,
    id: String,
) -> Result<(), String> {
    let mut comments = load_comments(&workspace_root);
    let before = comments.len();
    comments.retain(|c| c.id != id);
    if comments.len() == before {
        warn!(comment_id = %id, "评论不存在,跳过删除");
    }
    save_comments(&workspace_root, &comments)?;
    Ok(())
}

/// 清空某线程所有评论
#[tauri::command]
#[specta::specta]
pub async fn review_comment_clear_for_thread(
    workspace_root: String,
    thread_id: String,
) -> Result<(), String> {
    let mut comments = load_comments(&workspace_root);
    comments.retain(|c| c.thread_id != thread_id);
    save_comments(&workspace_root, &comments)?;
    Ok(())
}

/// 清空某 turn 所有评论
#[tauri::command]
#[specta::specta]
pub async fn review_comment_clear_for_turn(
    workspace_root: String,
    thread_id: String,
    turn_id: String,
) -> Result<(), String> {
    let mut comments = load_comments(&workspace_root);
    comments.retain(|c| {
        !(c.thread_id == thread_id && c.turn_id.as_deref() == Some(turn_id.as_str()))
    });
    save_comments(&workspace_root, &comments)?;
    Ok(())
}
