//! # 语义搜索命令模块
//!
//! 提供双模式语义搜索 Tauri 命令：
//!
//! - **TF-IDF 模式**：纯本地，无需 API Key
//! - **Embedding 模式**：调用 OpenAI 兼容的 Embedding API，语义精度更高
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `semantic_build_index` | 从目录构建 TF-IDF 语义索引 |
//! | `semantic_search` | TF-IDF 语义搜索 |
//! | `semantic_build_embedding_index` | 从目录构建 Embedding 语义索引 |
//! | `semantic_search_embedding` | Embedding 语义搜索 |
//! | `semantic_add_file_embedding` | 增量添加文件到 Embedding 索引 |
//! | `semantic_get_indexed_files` | 获取已索引的文件列表 |

use std::sync::Mutex as StdMutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex as TokioMutex;
use tracing::info;

use ydsz_code::semantic::{
    EmbeddingConfig, EmbeddingIndex, SemanticIndex, SemanticSearchResponse,
};

// ============================================================================
// 状态管理
// ============================================================================

/// TF-IDF 语义索引状态（同步锁，不跨 await）
pub struct SemanticState {
    index: StdMutex<Option<SemanticIndex>>,
}

impl Default for SemanticState {
    fn default() -> Self {
        Self::new()
    }
}

impl SemanticState {
    pub fn new() -> Self {
        Self {
            index: StdMutex::new(None),
        }
    }
}

/// Embedding 语义索引状态（异步锁，可跨 await）
pub struct EmbeddingState {
    index: TokioMutex<Option<EmbeddingIndex>>,
}

impl Default for EmbeddingState {
    fn default() -> Self {
        Self::new()
    }
}

impl EmbeddingState {
    pub fn new() -> Self {
        Self {
            index: TokioMutex::new(None),
        }
    }
}

// ============================================================================
// DTO
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SemanticResultDto {
    pub id: String,
    pub path: String,
    pub score: f64,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SemanticSearchResponseDto {
    pub query: String,
    pub results: Vec<SemanticResultDto>,
    pub total_docs: usize,
}

impl From<SemanticSearchResponse> for SemanticSearchResponseDto {
    fn from(r: SemanticSearchResponse) -> Self {
        Self {
            query: r.query,
            results: r
                .results
                .into_iter()
                .map(|s| SemanticResultDto {
                    id: s.id,
                    path: s.path,
                    score: s.score,
                    snippet: s.snippet,
                })
                .collect(),
            total_docs: r.total_docs,
        }
    }
}

/// Embedding 配置 DTO
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingConfigDto {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl From<EmbeddingConfigDto> for EmbeddingConfig {
    fn from(dto: EmbeddingConfigDto) -> Self {
        Self {
            base_url: dto.base_url,
            api_key: dto.api_key,
            model: dto.model,
        }
    }
}

// ============================================================================
// TF-IDF 命令
// ============================================================================

/// 从目录构建 TF-IDF 语义索引
#[tauri::command]
#[specta::specta]
pub async fn semantic_build_index(
    state: State<'_, SemanticState>,
    directory: String,
    extensions: Vec<String>,
) -> Result<usize, String> {
    info!(dir = %directory, "构建 TF-IDF 语义索引");
    let exts: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let index = SemanticIndex::build_from_directory(&directory, &exts)
        .map_err(|e| e.to_string())?;
    let count = index.len();
    let mut state_index = state.index.lock().map_err(|e| e.to_string())?;
    *state_index = Some(index);
    Ok(count)
}

/// TF-IDF 语义搜索
#[tauri::command]
#[specta::specta]
pub async fn semantic_search(
    state: State<'_, SemanticState>,
    query: String,
    max_results: Option<usize>,
) -> Result<SemanticSearchResponseDto, String> {
    info!(query = %query, "TF-IDF 语义搜索");
    let state_index = state.index.lock().map_err(|e| e.to_string())?;
    match state_index.as_ref() {
        Some(index) => {
            let response = index.search(&query, max_results.unwrap_or(20));
            Ok(response.into())
        }
        None => Err("语义索引未构建，请先调用 semantic_build_index".to_string()),
    }
}

// ============================================================================
// Embedding 命令
// ============================================================================

/// 从目录构建 Embedding 语义索引
///
/// 使用 OpenAI 兼容的 Embedding API 将代码分块向量化。
/// 需要提供 API Key 和模型名。
#[tauri::command]
#[specta::specta]
pub async fn semantic_build_embedding_index(
    state: State<'_, EmbeddingState>,
    directory: String,
    extensions: Vec<String>,
    config: EmbeddingConfigDto,
) -> Result<usize, String> {
    info!(dir = %directory, model = %config.model, "构建 Embedding 语义索引");

    let embedding_config: EmbeddingConfig = config.into();
    let mut index = EmbeddingIndex::new(embedding_config).map_err(|e| e.to_string())?;

    let exts: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let count = index
        .build_from_directory(&directory, &exts)
        .await
        .map_err(|e| e.to_string())?;

    let mut state_index = state.index.lock().await;
    *state_index = Some(index);
    Ok(count)
}

/// Embedding 语义搜索
///
/// 将查询文本通过 Embedding API 向量化，然后执行余弦相似度检索。
#[tauri::command]
#[specta::specta]
pub async fn semantic_search_embedding(
    state: State<'_, EmbeddingState>,
    query: String,
    max_results: Option<usize>,
    min_score: Option<f64>,
) -> Result<SemanticSearchResponseDto, String> {
    info!(query = %query, "Embedding 语义搜索");

    let mut state_index = state.index.lock().await;
    match state_index.as_mut() {
        Some(index) => {
            let response = index
                .search(
                    &query,
                    max_results.unwrap_or(20),
                    min_score.unwrap_or(0.3),
                )
                .await
                .map_err(|e| e.to_string())?;
            Ok(response.into())
        }
        None => Err("Embedding 索引未构建，请先调用 semantic_build_embedding_index".to_string()),
    }
}

/// 增量添加文件到 Embedding 索引
///
/// 用于文件变更时更新索引，先删除该文件的旧向量，再重新分块 + 嵌入。
#[tauri::command]
#[specta::specta]
pub async fn semantic_add_file_embedding(
    state: State<'_, EmbeddingState>,
    file_path: String,
    content: String,
) -> Result<usize, String> {
    info!(file = %file_path, "增量添加文件到 Embedding 索引");

    let mut state_index = state.index.lock().await;
    match state_index.as_mut() {
        Some(index) => {
            let count = index
                .add_file(&file_path, &content)
                .await
                .map_err(|e| e.to_string())?;
            Ok(count)
        }
        None => Err("Embedding 索引未构建，请先调用 semantic_build_embedding_index".to_string()),
    }
}

/// 获取已索引的文件列表
#[tauri::command]
#[specta::specta]
pub async fn semantic_get_indexed_files(
    state: State<'_, EmbeddingState>,
) -> Result<Vec<String>, String> {
    let state_index = state.index.lock().await;
    match state_index.as_ref() {
        Some(index) => Ok(index.indexed_files()),
        None => Ok(Vec::new()),
    }
}
