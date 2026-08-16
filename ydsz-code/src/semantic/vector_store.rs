//! # 向量存储（内存）
//!
//! 基于 `Vec<f64>` 的内存向量存储，支持余弦相似度检索。
//! 用于后端 Embedding 模式的语义搜索。
//!
//! ## 设计
//!
//! - 纯内存实现，无需外部向量数据库
//! - 余弦相似度（cosine similarity）排序
//! - 支持按工作区过滤
//! - 线性扫描（适用于 < 10k 向量），大规模可后续升级为 HNSW

use serde::{Deserialize, Serialize};

/// 向量记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorRecord {
    /// 唯一 ID
    pub id: String,
    /// 工作区根目录
    pub workspace_root: String,
    /// 文件路径（相对于 workspace_root）
    pub file_path: String,
    /// 分块在文件中的起始行号（0-based）
    pub start_line: u32,
    /// 分块在文件中的结束行号（0-based, exclusive）
    pub end_line: u32,
    /// 分块的原始文本
    pub text: String,
    /// embedding 向量
    pub vector: Vec<f64>,
    /// embedding 模型名
    pub model: String,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSearchResult {
    /// 文件路径
    pub file_path: String,
    /// 起始行号
    pub start_line: u32,
    /// 结束行号
    pub end_line: u32,
    /// 匹配的代码片段
    pub snippet: String,
    /// 相似度分数 [0, 1]
    pub score: f64,
}

/// 内存向量存储
pub struct VectorStore {
    records: Vec<VectorRecord>,
}

impl VectorStore {
    /// 创建空向量存储
    pub fn new() -> Self {
        Self {
            records: Vec::new(),
        }
    }

    /// 添加单条向量记录
    pub fn add(&mut self, record: VectorRecord) {
        self.records.push(record);
    }

    /// 批量添加向量记录
    pub fn add_batch(&mut self, records: Vec<VectorRecord>) {
        self.records.extend(records);
    }

    /// 清除指定工作区的所有向量
    pub fn clear_workspace(&mut self, workspace_root: &str) {
        self.records.retain(|r| r.workspace_root != workspace_root);
    }

    /// 删除指定工作区中某文件的所有向量记录
    pub fn remove_file(&mut self, workspace_root: &str, file_path: &str) {
        self.records.retain(|r| !(r.workspace_root == workspace_root && r.file_path == file_path));
    }

    /// 清除所有向量
    pub fn clear(&mut self) {
        self.records.clear();
    }

    /// 取出所有向量记录(用于迁移到 HNSW 后端)
    ///
    /// 调用后 store 为空,所有权转移到调用方。
    pub fn take_records(&mut self) -> Vec<VectorRecord> {
        std::mem::take(&mut self.records)
    }

    /// 记录数量
    pub fn len(&self) -> usize {
        self.records.len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }

    /// 获取已索引的文件列表
    pub fn indexed_files(&self, workspace_root: &str) -> Vec<String> {
        let mut files: Vec<String> = self
            .records
            .iter()
            .filter(|r| r.workspace_root == workspace_root)
            .map(|r| r.file_path.clone())
            .collect();
        files.sort();
        files.dedup();
        files
    }

    /// 语义搜索：根据查询向量返回最相似的代码分块
    ///
    /// - `query_vector` - 查询的 embedding 向量
    /// - `workspace_root` - 限定搜索的工作区
    /// - `top_k` - 返回的最大结果数
    /// - `min_score` - 最低相似度阈值
    pub fn search(
        &self,
        query_vector: &[f64],
        workspace_root: &str,
        top_k: usize,
        min_score: f64,
    ) -> Vec<VectorSearchResult> {
        let mut scored: Vec<VectorSearchResult> = self
            .records
            .iter()
            .filter(|r| r.workspace_root == workspace_root)
            .map(|record| {
                let score = cosine_similarity(query_vector, &record.vector);
                VectorSearchResult {
                    file_path: record.file_path.clone(),
                    start_line: record.start_line,
                    end_line: record.end_line,
                    snippet: record.text.chars().take(500).collect(),
                    score,
                }
            })
            .filter(|r| r.score >= min_score)
            .collect();

        // 按分数降序排序
        scored.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        scored.truncate(top_k);
        scored
    }
}

impl Default for VectorStore {
    fn default() -> Self {
        Self::new()
    }
}

/// 计算两个向量的余弦相似度
///
/// 返回值范围 [-1, 1]，越接近 1 越相似。
pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;

    for i in 0..a.len() {
        dot_product += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    let denominator = norm_a.sqrt() * norm_b.sqrt();
    if denominator == 0.0 {
        0.0
    } else {
        dot_product / denominator
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(id: &str, ws: &str, path: &str, vector: Vec<f64>) -> VectorRecord {
        VectorRecord {
            id: id.into(),
            workspace_root: ws.into(),
            file_path: path.into(),
            start_line: 0,
            end_line: 10,
            text: "sample code".into(),
            vector,
            model: "test-model".into(),
        }
    }

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_different_lengths() {
        let a = vec![1.0, 2.0];
        let b = vec![1.0];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    #[test]
    fn test_vector_store_search() {
        let mut store = VectorStore::new();
        store.add(make_record("1", "ws", "a.rs", vec![1.0, 0.0, 0.0]));
        store.add(make_record("2", "ws", "b.rs", vec![0.0, 1.0, 0.0]));
        store.add(make_record("3", "ws", "c.rs", vec![0.9, 0.1, 0.0]));

        let results = store.search(&[1.0, 0.0, 0.0], "ws", 10, 0.5);
        assert_eq!(results.len(), 2); // a.rs and c.rs
        assert_eq!(results[0].file_path, "a.rs");
        assert!((results[0].score - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_clear_workspace() {
        let mut store = VectorStore::new();
        store.add(make_record("1", "ws1", "a.rs", vec![1.0]));
        store.add(make_record("2", "ws2", "b.rs", vec![1.0]));

        store.clear_workspace("ws1");
        assert_eq!(store.len(), 1);
        assert_eq!(store.records[0].workspace_root, "ws2");
    }

    #[test]
    fn test_indexed_files() {
        let mut store = VectorStore::new();
        store.add(make_record("1", "ws", "a.rs", vec![1.0]));
        store.add(make_record("2", "ws", "a.rs", vec![1.0]));
        store.add(make_record("3", "ws", "b.rs", vec![1.0]));

        let files = store.indexed_files("ws");
        assert_eq!(files, vec!["a.rs", "b.rs"]);
    }

    #[test]
    fn test_remove_file() {
        let mut store = VectorStore::new();
        store.add(make_record("1", "ws", "a.rs", vec![1.0]));
        store.add(make_record("2", "ws", "a.rs", vec![1.0]));
        store.add(make_record("3", "ws", "b.rs", vec![1.0]));

        store.remove_file("ws", "a.rs");
        assert_eq!(store.len(), 1);
        assert_eq!(store.records[0].file_path, "b.rs");
    }
}
