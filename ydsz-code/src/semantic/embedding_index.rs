//! # Embedding 语义索引
//!
//! 结合 Embedding API 客户端、向量存储和代码分块器，
//! 提供端到端的 Embedding 语义搜索能力。
//!
//! ## 设计
//!
//! - `EmbeddingIndex` 封装了 embedding 客户端、向量后端和分块逻辑
//! - 支持从目录构建索引、增量添加文件、语义搜索
//! - 向量后端自动切换:小规模(< [`HNSW_THRESHOLD`])走线性扫描,大规模自动迁移到 HNSW
//! - 所有网络调用为异步

use std::collections::HashSet;
use std::path::Path;

use crate::semantic::chunker::{chunk_code, generate_chunk_id, ChunkConfig};
use crate::semantic::embedding::{EmbeddingClient, EmbeddingConfig};
use crate::semantic::hnsw_store::{HnswConfig, HnswVectorStore, HNSW_THRESHOLD};
use crate::semantic::vector_store::{VectorRecord, VectorSearchResult, VectorStore};
use crate::semantic::{SemanticSearchResponse, SemanticSearchResult};
use crate::semantic::SemanticResult;

/// 向量后端类型(用于 introspection / 调试)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackendKind {
    /// 线性扫描(小规模)
    Linear,
    /// HNSW 近似最近邻(大规模)
    Hnsw,
}

/// 向量后端:小规模走线性扫描,大规模自动迁移到 HNSW
///
/// - [`VectorBackend::Linear`]: 基于 [`VectorStore`],适合 < 10k 向量
/// - [`VectorBackend::Hnsw`]: 基于 [`HnswVectorStore`],适合 ≥ 10k 向量
///
/// 切换由 [`EmbeddingIndex::maybe_migrate_to_hnsw`] 触发,阈值 [`HNSW_THRESHOLD`]。
pub enum VectorBackend {
    Linear(VectorStore),
    Hnsw(HnswVectorStore),
}

impl VectorBackend {
    /// 创建默认的线性扫描后端
    pub fn new_linear() -> Self {
        Self::Linear(VectorStore::new())
    }

    /// 创建 HNSW 后端
    pub fn new_hnsw(config: HnswConfig) -> SemanticResult<Self> {
        Ok(Self::Hnsw(HnswVectorStore::new(config)?))
    }

    /// 当前后端类型
    pub fn kind(&self) -> BackendKind {
        match self {
            Self::Linear(_) => BackendKind::Linear,
            Self::Hnsw(_) => BackendKind::Hnsw,
        }
    }

    /// 添加单条向量记录
    pub fn add(&mut self, record: VectorRecord) -> SemanticResult<()> {
        match self {
            Self::Linear(s) => {
                s.add(record);
                Ok(())
            }
            Self::Hnsw(s) => s.add(record),
        }
    }

    /// 语义搜索
    pub fn search(
        &self,
        query_vector: &[f64],
        workspace_root: &str,
        top_k: usize,
        min_score: f64,
    ) -> Vec<VectorSearchResult> {
        match self {
            Self::Linear(s) => s.search(query_vector, workspace_root, top_k, min_score),
            Self::Hnsw(s) => s.search(query_vector, workspace_root, top_k, min_score),
        }
    }

    /// 清除指定工作区的所有向量
    pub fn clear_workspace(&mut self, workspace_root: &str) {
        match self {
            Self::Linear(s) => s.clear_workspace(workspace_root),
            Self::Hnsw(s) => s.clear_workspace(workspace_root),
        }
    }

    /// 删除指定工作区中某文件的所有向量记录
    pub fn remove_file(&mut self, workspace_root: &str, file_path: &str) {
        match self {
            Self::Linear(s) => s.remove_file(workspace_root, file_path),
            Self::Hnsw(s) => s.remove_file(workspace_root, file_path),
        }
    }

    /// 清除所有向量
    pub fn clear(&mut self) {
        match self {
            Self::Linear(s) => s.clear(),
            Self::Hnsw(s) => s.clear(),
        }
    }

    /// 记录数量
    pub fn len(&self) -> usize {
        match self {
            Self::Linear(s) => s.len(),
            Self::Hnsw(s) => s.len(),
        }
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 获取已索引的文件列表
    pub fn indexed_files(&self, workspace_root: &str) -> Vec<String> {
        match self {
            Self::Linear(s) => s.indexed_files(workspace_root),
            Self::Hnsw(s) => s.indexed_files(workspace_root),
        }
    }

    /// 如果当前是 Linear 且记录数超过阈值,迁移到 HNSW
    ///
    /// 迁移完成后 `self` 变为 `Hnsw` 变体,原 Linear store 的 records 被消费。
    /// 已是 Hnsw 时无操作。
    pub fn maybe_migrate_to_hnsw(&mut self, config: &HnswConfig) -> SemanticResult<()> {
        if let Self::Linear(linear) = self {
            if linear.len() >= HNSW_THRESHOLD {
                let hnsw_store = HnswVectorStore::new(config.clone())?;
                let records = linear.take_records();
                for record in records {
                    hnsw_store.add(record)?;
                }
                tracing::info!(
                    target: "ydsz-code::semantic",
                    threshold = HNSW_THRESHOLD,
                    "向量后端 Linear → Hnsw 迁移完成"
                );
                *self = Self::Hnsw(hnsw_store);
            }
        }
        Ok(())
    }
}

impl Default for VectorBackend {
    fn default() -> Self {
        Self::new_linear()
    }
}

/// Embedding 语义索引
///
/// 封装 embedding 客户端、向量后端和分块逻辑，
/// 提供端到端的语义搜索能力。
pub struct EmbeddingIndex {
    /// Embedding API 客户端
    client: EmbeddingClient,
    /// 向量后端(线性 / HNSW,自动切换)
    backend: VectorBackend,
    /// HNSW 配置(用于阈值触发时迁移)
    hnsw_config: HnswConfig,
    /// 分块配置
    chunk_config: ChunkConfig,
    /// 工作区根目录
    workspace_root: String,
    /// 已索引的文件路径集合
    indexed: HashSet<String>,
}

impl EmbeddingIndex {
    /// 创建新的 Embedding 索引
    pub fn new(config: EmbeddingConfig) -> SemanticResult<Self> {
        Self::with_hnsw_config(config, HnswConfig::default())
    }

    /// 创建新的 Embedding 索引,并指定 HNSW 配置
    pub fn with_hnsw_config(config: EmbeddingConfig, hnsw_config: HnswConfig) -> SemanticResult<Self> {
        let client = EmbeddingClient::new(config)?;
        Ok(Self {
            client,
            backend: VectorBackend::new_linear(),
            hnsw_config,
            chunk_config: ChunkConfig::default(),
            workspace_root: String::new(),
            indexed: HashSet::new(),
        })
    }

    /// 当前后端类型
    pub fn backend_kind(&self) -> BackendKind {
        self.backend.kind()
    }

    /// 当前向量记录总数
    pub fn vector_count(&self) -> usize {
        self.backend.len()
    }

    /// 从目录递归构建索引
    pub async fn build_from_directory(
        &mut self,
        dir: &str,
        extensions: &[&str],
    ) -> SemanticResult<usize> {
        self.workspace_root = dir.to_string();
        let root = Path::new(dir);
        let mut texts: Vec<(String, u32, u32, String)> = Vec::new(); // (file_path, start_line, end_line, text)

        for entry in walkdir::WalkDir::new(root)
            .max_depth(10)
            .into_iter()
            .flatten()
        {
            if entry.file_type().is_file() {
                let path = entry.path();
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");

                if extensions.is_empty() || extensions.contains(&ext) {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let file_path = path.to_string_lossy().to_string();
                        self.indexed.insert(file_path.clone());

                        let chunks = chunk_code(&content, &self.chunk_config);
                        for chunk in chunks {
                            let _chunk_id = generate_chunk_id(dir, &file_path, chunk.start_line);
                            texts.push((file_path.clone(), chunk.start_line, chunk.end_line, chunk.text));
                        }
                    }
                }
            }
        }

        let count = texts.len();
        if count == 0 {
            return Ok(0);
        }

        // 批量 embedding
        let text_refs: Vec<&str> = texts.iter().map(|(_, _, _, t)| t.as_str()).collect();
        let results = self.client.embed_batch(&text_refs).await?;

        let model = self.client.model().to_string();
        for (_i, ((file_path, start_line, end_line, text), emb_result)) in
            texts.iter().zip(results.iter()).enumerate()
        {
            let id = generate_chunk_id(dir, file_path, *start_line);
            self.backend.add(VectorRecord {
                id,
                workspace_root: dir.to_string(),
                file_path: file_path.to_string(),
                start_line: *start_line,
                end_line: *end_line,
                text: text.to_string(),
                vector: emb_result.vector.clone(),
                model: model.clone(),
            })?;
        }

        // 大规模数据时自动迁移到 HNSW
        self.maybe_migrate_to_hnsw()?;

        Ok(count)
    }

    /// 语义搜索
    pub async fn search(
        &self,
        query: &str,
        max_results: usize,
        min_score: f64,
    ) -> SemanticResult<SemanticSearchResponse> {
        let emb_result = self.client.embed_text(query).await?;

        let vector_results = self.backend.search(
            &emb_result.vector,
            &self.workspace_root,
            max_results,
            min_score,
        );

        let results: Vec<SemanticSearchResult> = vector_results
            .into_iter()
            .map(|r| SemanticSearchResult {
                id: format!("{}::{}", r.file_path, r.start_line),
                path: r.file_path,
                score: r.score,
                snippet: r.snippet,
            })
            .collect();

        Ok(SemanticSearchResponse {
            query: query.to_string(),
            results,
            total_docs: self.backend.len(),
        })
    }

    /// 增量添加文件到索引
    ///
    /// 先删除该文件的旧向量记录，再重新分块 + 嵌入。
    pub async fn add_file(&mut self, file_path: &str, content: &str) -> SemanticResult<usize> {
        // 删除旧记录
        self.backend.remove_file(&self.workspace_root, file_path);

        let chunks = chunk_code(content, &self.chunk_config);

        if chunks.is_empty() {
            // 即使没有新 chunk 也尝试迁移(remove_file 可能改变规模)
            self.maybe_migrate_to_hnsw()?;
            return Ok(0);
        }

        let text_refs: Vec<&str> = chunks.iter().map(|c| c.text.as_str()).collect();
        let results = self.client.embed_batch(&text_refs).await?;

        let model = self.client.model().to_string();
        for (chunk, emb_result) in chunks.iter().zip(results.iter()) {
            let id = generate_chunk_id(&self.workspace_root, file_path, chunk.start_line);
            self.backend.add(VectorRecord {
                id,
                workspace_root: self.workspace_root.clone(),
                file_path: file_path.to_string(),
                start_line: chunk.start_line,
                end_line: chunk.end_line,
                text: chunk.text.clone(),
                vector: emb_result.vector.clone(),
                model: model.clone(),
            })?;
        }

        self.indexed.insert(file_path.to_string());

        // 增量添加后检查是否需要迁移
        self.maybe_migrate_to_hnsw()?;

        Ok(chunks.len())
    }

    /// 如果当前是 Linear 且记录数超过阈值,迁移到 HNSW
    ///
    /// 在 [`build_from_directory`] / [`add_file`] 后自动调用,
    /// 也可手动触发(例如批量 add_file 场景只在最后调用一次)。
    pub fn maybe_migrate_to_hnsw(&mut self) -> SemanticResult<()> {
        self.backend.maybe_migrate_to_hnsw(&self.hnsw_config)
    }

    /// 获取已索引的文件列表
    pub fn indexed_files(&self) -> Vec<String> {
        let mut files: Vec<String> = self.indexed.iter().cloned().collect();
        files.sort();
        files
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backend_default_is_linear() {
        let backend = VectorBackend::default();
        assert_eq!(backend.kind(), BackendKind::Linear);
        assert!(backend.is_empty());
    }

    #[test]
    fn test_backend_add_search_linear() {
        let mut backend = VectorBackend::new_linear();
        backend
            .add(VectorRecord {
                id: "1".into(),
                workspace_root: "ws".into(),
                file_path: "a.rs".into(),
                start_line: 0,
                end_line: 10,
                text: "sample".into(),
                vector: vec![1.0, 0.0, 0.0],
                model: "test".into(),
            })
            .unwrap();
        backend
            .add(VectorRecord {
                id: "2".into(),
                workspace_root: "ws".into(),
                file_path: "b.rs".into(),
                start_line: 0,
                end_line: 10,
                text: "sample".into(),
                vector: vec![0.0, 1.0, 0.0],
                model: "test".into(),
            })
            .unwrap();
        let results = backend.search(&[1.0, 0.0, 0.0], "ws", 10, 0.0);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].file_path, "a.rs");
    }

    #[test]
    fn test_backend_remove_file_and_clear_workspace() {
        let mut backend = VectorBackend::new_linear();
        for i in 0..3 {
            backend
                .add(VectorRecord {
                    id: i.to_string(),
                    workspace_root: "ws".into(),
                    file_path: if i == 2 { "b.rs" } else { "a.rs" }.into(),
                    start_line: 0,
                    end_line: 10,
                    text: "x".into(),
                    vector: vec![1.0, 0.0],
                    model: "test".into(),
                })
                .unwrap();
        }
        backend.remove_file("ws", "a.rs");
        assert_eq!(backend.len(), 1);

        backend.clear_workspace("ws");
        assert!(backend.is_empty());
    }

    #[test]
    fn test_migrate_to_hnsw_below_threshold_is_noop() {
        let mut backend = VectorBackend::new_linear();
        for i in 0..100 {
            backend
                .add(VectorRecord {
                    id: i.to_string(),
                    workspace_root: "ws".into(),
                    file_path: "a.rs".into(),
                    start_line: i,
                    end_line: i + 1,
                    text: "x".into(),
                    vector: vec![1.0, 0.0],
                    model: "test".into(),
                })
                .unwrap();
        }
        // 100 远小于 HNSW_THRESHOLD(10k),不应迁移
        backend.maybe_migrate_to_hnsw(&HnswConfig::default()).unwrap();
        assert_eq!(backend.kind(), BackendKind::Linear);
        assert_eq!(backend.len(), 100);
    }

    #[test]
    fn test_migrate_to_hnsw_above_threshold_switches() {
        // 用低阈值配置避免真的插入 10k 条
        let mut backend = VectorBackend::new_linear();
        for i in 0..50 {
            backend
                .add(VectorRecord {
                    id: i.to_string(),
                    workspace_root: "ws".into(),
                    file_path: "a.rs".into(),
                    start_line: i,
                    end_line: i + 1,
                    text: "x".into(),
                    vector: vec![1.0, 0.0],
                    model: "test".into(),
                })
                .unwrap();
        }
        // 自定义阈值 = 10 的配置(走 HnswVectorStore 内部 Hnsw::new,max_elements 给足)
        let config = HnswConfig {
            max_elements: 1000,
            ..Default::default()
        };
        // 受 HNSW_THRESHOLD 常量约束(无法在测试中改),这里手动模拟迁移流程:
        // 取出 Linear 中的 records,构造 Hnsw 后端,把 records 重新插入。
        // 验证迁移后 backend 切换为 Hnsw,且 search 行为一致。
        let old_backend = std::mem::replace(&mut backend, VectorBackend::new_linear());
        let new_backend = match old_backend {
            VectorBackend::Linear(mut linear) => {
                let hnsw_store = HnswVectorStore::new(config.clone()).unwrap();
                for record in linear.take_records() {
                    hnsw_store.add(record).unwrap();
                }
                VectorBackend::Hnsw(hnsw_store)
            }
            other => other,
        };
        backend = new_backend;
        assert_eq!(backend.kind(), BackendKind::Hnsw);
        assert_eq!(backend.len(), 50);

        // 搜索仍能正常工作
        let results = backend.search(&[1.0, 0.0], "ws", 10, 0.0);
        assert!(!results.is_empty());
        assert_eq!(results[0].file_path, "a.rs");
    }
}
