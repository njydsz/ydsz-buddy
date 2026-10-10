//! # 知识库 RAG Phase A 命令
//!
//! 提供项目索引、语义搜索、知识源管理和笔记功能。
//! 对标 Octop 知识库模块的结构化知识管理能力。
//!
//! Tauri 命令交互流程：
//! 前端 invoke → 构建 OrchestrationCommand → dispatch 到编排引擎 → 返回结果

use tauri::State;
use serde::{Deserialize, Serialize};
use tracing::info;

use ydzs_core::commands::OrchestrationCommand;
use crate::ServerState;

// ===== 数据类型定义 =====

/// 搜索结果（前端展示用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchResult {
    pub title: String,
    pub snippet: String,
    pub source_path: String,
    pub source_type: String,  // "file" | "url" | "note" | "wiki"
    pub score: f32,
}

/// 知识源（已索引的内容来源）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSource {
    pub id: String,
    pub name: String,
    pub source_type: String,  // "project" | "url" | "note" | "docs"
    pub indexed_at: String,
    pub chunk_count: u32,
}

/// 知识库统计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeStats {
    pub total_sources: u32,
    pub total_chunks: u32,
    pub total_notes: u32,
    pub last_indexed_at: Option<String>,
}

// ===== 命令入参结构体 =====

#[derive(Debug, Serialize)]
struct KnowledgeIndexProjectCmd {
    pub command_id: Option<String>,
    pub project_path: String,
}

#[derive(Debug, Serialize)]
struct KnowledgeSearchCmd {
    pub command_id: Option<String>,
    pub query: String,
    pub limit: Option<usize>,
}

// ===== Tauri 命令 =====

/// 对项目进行结构化索引（AST 解析 + 分块 + 向量嵌入）
#[tauri::command]
#[specta::specta]
pub async fn knowledge_index_project(
    state: State<'_, ServerState>,
    project_path: String,
) -> Result<String, String> {
    info!(path = %project_path, "知识库: 开始项目索引");

    let cmd = KnowledgeIndexProjectCmd {
        command_id: Some("knowledge.index.project".into()),
        project_path,
    };
    let json = serde_json::to_string(&cmd).map_err(|e| e.to_string())?;
    state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(&json)
        .await
        .map_err(|e| format!("索引启动失败: {}", e))
}

/// 语义搜索知识库（TF-IDF + Embedding 混合检索）
#[tauri::command]
#[specta::specta]
pub async fn knowledge_search(
    state: State<'_, ServerState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeSearchResult>, String> {
    info!(query = %query, limit = ?limit, "知识库: 语义搜索");

    let cmd = KnowledgeSearchCmd {
        command_id: Some("knowledge.search".into()),
        query: query.clone(),
        limit,
    };
    let cmd_json = serde_json::to_string(&cmd).map_err(|e| e.to_string())?;
    let raw = state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(&cmd_json)
        .await
        .map_err(|e| format!("搜索失败: {}", e))?;

    if raw.is_empty() || raw == "stub" {
        // 桩模式返回示例结果 — 实际使用 indexer + semantic 后替换
        let demo_limit = limit.unwrap_or(5);
        let mut results = Vec::new();
        for i in 0..demo_limit.min(3) {
            results.push(KnowledgeSearchResult {
                title: format!("示例搜索 {}", i + 1),
                snippet: format!("关于 '{}' 的示例搜索结果（RAG Phase A 骨架模式）", query),
                source_path: format!("src/module{}.rs", i),
                source_type: if i % 2 == 0 { "file".into() } else { "note".into() },
                score: 0.95 - (i as f32 * 0.15),
            });
        }
        Ok(results)
    } else {
        serde_json::from_str(&raw)
            .map_err(|e| format!("搜索结果反序列化失败: {}", e))
    }
}

/// 列出已索引的知识源
#[tauri::command]
#[specta::specta]
pub async fn knowledge_list_sources(
    state: State<'_, ServerState>,
) -> Result<Vec<KnowledgeSource>, String> {
    info!("知识库: 列出知识源");

    // 骨架模式返回静态 + 动态发现结果
    let sources = vec![
        KnowledgeSource {
            id: "wiki-repo".into(),
            name: "项目 Wiki (Repo Wiki)".into(),
            source_type: "wiki".into(),
            indexed_at: chrono::Utc::now().to_rfc3339(),
            chunk_count: 42,
        },
        KnowledgeSource {
            id: "code-semantic".into(),
            name: "代码语义索引".into(),
            source_type: "project".into(),
            indexed_at: chrono::Utc::now().to_rfc3339(),
            chunk_count: 156,
        },
    ];

    let _ = state; // stub: 未来从 ThreadStore/EventStore 查缓存
    Ok(sources)
}

/// 添加用户笔记到知识库
#[tauri::command]
#[specta::specta]
pub async fn knowledge_add_note(
    state: State<'_, ServerState>,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<String, String> {
    info!(title = %title, tags = ?tags, "知识库: 添加笔记");

    let note_id = uuid::Uuid::new_v4().to_string();
    let payload = serde_json::json!({
        "noteId": note_id,
        "title": title,
        "content": content,
        "tags": tags,
        "createdAt": chrono::Utc::now().to_rfc3339(),
    });

    let cmd_json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    state
        .bootstrap_result
        .services
        .orchestration_engine
        .dispatch(&cmd_json)
        .await
        .map_err(|e| format!("笔记写入失败: {}", e))?;

    Ok(note_id)
}

/// 知识库统计
#[tauri::command]
#[specta::specta]
pub async fn knowledge_stats(
    _state: State<'_, ServerState>,
) -> Result<KnowledgeStats, String> {
    info!("知识库: 获取统计");

    Ok(KnowledgeStats {
        total_sources: 2,
        total_chunks: 198,
        total_notes: 0,
        last_indexed_at: Some(chrono::Utc::now().to_rfc3339()),
    })
}
