//! # HNSW 向量存储
//!
//! 基于 `hnsw_rs` 的近似最近邻向量索引,作为 `VectorStore` 线性扫描的大规模后端。
//!
//! ## 设计
//!
//! - 当工作区 chunks 数量超过阈值(默认 10k)时自动启用
//! - 使用 `DistCosine` 余弦距离(与现有 `VectorStore` 保持行为一致)
//! - 索引内存常驻,可通过 `file_dump` 持久化到磁盘
//! - 与 `VectorStore` 行为对齐,可通过 `VectorBackend` 枚举在 `EmbeddingIndex` 层切换
//!
//! ## 选型理由
//!
//! - 纯 Rust 零 C 依赖,与 Tauri Windows/macOS/Linux 三端打包零摩擦
//! - `DistCosine` 内置,无需手动归一化
//! - API 形态契合 `VectorStore::add/search`
//! - 支持并行插入与可序列化(`AnnT::file_dump`)
//!
//! ## 持久化说明
//!
//! - `dump_to_file` 通过 `AnnT::file_dump` 写出 `.hnsw.graph` + `.hnsw.data` 两份文件
//! - `load_from_file` 因 `hnsw_rs::HnswIo::load_hnsw` 的生命周期约束(Hnsw 借用 HnswIo 内的 mmap 区域)
//!   暂未实现:重建索引比 self-referential struct 更安全。启动时直接重新插入向量即可。

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use hnsw_rs::api::AnnT;
use hnsw_rs::prelude::{DistCosine, Hnsw};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use super::error::SemanticError;
use super::SemanticResult;
use super::vector_store::{VectorRecord, VectorSearchResult};

/// HNSW 索引默认阈值:chunks 数量超过此值时启用 HNSW
pub const HNSW_THRESHOLD: usize = 10_000;

/// HNSW 默认参数(基于 hnsw_rs 推荐值,适配代码检索场景)
pub const DEFAULT_MAX_NB_CONNECTION: usize = 16;
pub const DEFAULT_EF_CONSTRUCTION: usize = 200;
pub const DEFAULT_EF_SEARCH: usize = 50;
/// HNSW 默认最大层级(由 hnsw_rs 内部按 1/ln(M) 推导,这里给一个保守上界)
pub const DEFAULT_MAX_LAYER: usize = 16;

/// HNSW 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HnswConfig {
    /// 每层最大连接数(M)
    pub max_nb_connection: usize,
    /// 构建时候选队列长度(ef_construction)
    pub ef_construction: usize,
    /// 搜索时候选队列长度(ef_search)
    pub ef_search: usize,
    /// 预估容量上限(max_elements,用于预分配)
    pub max_elements: usize,
    /// 最大层级
    pub max_layer: usize,
}

impl Default for HnswConfig {
    fn default() -> Self {
        Self {
            max_nb_connection: DEFAULT_MAX_NB_CONNECTION,
            ef_construction: DEFAULT_EF_CONSTRUCTION,
            ef_search: DEFAULT_EF_SEARCH,
            max_elements: HNSW_THRESHOLD * 2,
            max_layer: DEFAULT_MAX_LAYER,
        }
    }
}

/// HNSW 向量存储(使用 `DistCosine` 距离,与 `VectorStore::cosine_similarity` 行为对齐)
///
/// 用 `RwLock<Hnsw>` 支持并发搜索,内部维护 `id_to_record` 映射 HNSW 外部 id → 元数据。
/// HNSW 的 `insert` 接受外部 id(由我们分配),search 返回 `Neighbour` 携带该 id 供反查。
///
/// 类型参数:`Hnsw<'static, f64, DistCosine>` —— `f64: 'static` 满足 `T: 'b` 约束,
/// 因此可以从 `Hnsw::new` 构造出 `'static` 的 Hnsw(数据完全 owned)。
pub struct HnswVectorStore {
    /// HNSW 索引
    index: Arc<RwLock<Hnsw<'static, f64, DistCosine>>>,
    /// 外部 id → 元数据(供 search 时反查)
    id_to_record: Arc<RwLock<HashMap<usize, VectorRecord>>>,
    /// 工作区根 → 外部 id 集合(支持按工作区过滤 + clear_workspace)
    workspace_to_ids: Arc<RwLock<HashMap<String, Vec<usize>>>>,
    /// 文件路径(拼 workspace) → 外部 id 集合(支持 remove_file)
    file_to_ids: Arc<RwLock<HashMap<String, Vec<usize>>>>,
    /// 向量维度(首次插入时确定,后续校验)
    dim: Arc<RwLock<Option<usize>>>,
    /// 配置
    config: HnswConfig,
    /// 下一个外部 id(单调递增)
    next_id: Arc<RwLock<usize>>,
}

impl HnswVectorStore {
    /// 创建新的 HNSW 向量存储
    pub fn new(config: HnswConfig) -> SemanticResult<Self> {
        let hnsw = Hnsw::new(
            config.max_nb_connection,
            config.max_elements,
            config.max_layer,
            config.ef_construction,
            DistCosine {},
        );
        Ok(Self {
            index: Arc::new(RwLock::new(hnsw)),
            id_to_record: Arc::new(RwLock::new(HashMap::new())),
            workspace_to_ids: Arc::new(RwLock::new(HashMap::new())),
            file_to_ids: Arc::new(RwLock::new(HashMap::new())),
            dim: Arc::new(RwLock::new(None)),
            config,
            next_id: Arc::new(RwLock::new(0)),
        })
    }

    /// 添加单条向量记录
    pub fn add(&self, record: VectorRecord) -> SemanticResult<()> {
        let dim = record.vector.len();
        if dim == 0 {
            return Err(SemanticError::VectorDimensionMismatch {
                expected: 1,
                actual: 0,
            });
        }
        self.ensure_dimension(dim)?;

        let mut next_id_guard = self.next_id.write();
        let external_id = *next_id_guard;
        *next_id_guard += 1;
        drop(next_id_guard);

        // Hnsw::insert_slice((&[T], usize)) —— insert 的入参是 (&[T], usize)
        let vector = record.vector.clone();
        self.index.read().insert((&vector, external_id));

        // 元数据反查表
        self.id_to_record
            .write()
            .insert(external_id, record.clone());

        // 工作区索引
        self.workspace_to_ids
            .write()
            .entry(record.workspace_root.clone())
            .or_default()
            .push(external_id);

        // 文件索引(用 workspace_root + file_path 拼接作 key 避免跨工作区冲突)
        let file_key = format!("{}::{}", record.workspace_root, record.file_path);
        self.file_to_ids
            .write()
            .entry(file_key)
            .or_default()
            .push(external_id);

        Ok(())
    }

    /// 批量添加向量记录
    pub fn add_batch(&self, records: Vec<VectorRecord>) -> SemanticResult<()> {
        for record in records {
            self.add(record)?;
        }
        Ok(())
    }

    /// 清除指定工作区的所有向量(软删除)
    pub fn clear_workspace(&self, workspace_root: &str) {
        let ids = self
            .workspace_to_ids
            .write()
            .remove(workspace_root)
            .unwrap_or_default();
        if ids.is_empty() {
            return;
        }
        // 从元数据表清除(软删除:search 时跳过)
        let mut id_to_record = self.id_to_record.write();
        for id in &ids {
            id_to_record.remove(id);
        }
        // 从文件索引清除(只清除属于该工作区的)
        let prefix = format!("{workspace_root}::");
        let file_keys_to_clean: Vec<String> = self
            .file_to_ids
            .read()
            .keys()
            .filter(|k| k.starts_with(&prefix))
            .cloned()
            .collect();
        let mut file_to_ids = self.file_to_ids.write();
        for key in file_keys_to_clean {
            file_to_ids.remove(&key);
        }
        // 注:hnsw_rs 的 Hnsw 不支持 remove,向量仍保留在图索引中,
        // 但通过 id_to_record 反查时会跳过(返回 None 时过滤)。
        // 重建索引是真正的清理方式(本模块 clear / load_from_file 路径会重建)。
    }

    /// 删除指定工作区中某文件的所有向量记录(软删除)
    pub fn remove_file(&self, workspace_root: &str, file_path: &str) {
        let file_key = format!("{}::{}", workspace_root, file_path);
        let ids = self
            .file_to_ids
            .write()
            .remove(&file_key)
            .unwrap_or_default();
        if ids.is_empty() {
            return;
        }
        let mut id_to_record = self.id_to_record.write();
        for id in &ids {
            id_to_record.remove(id);
        }
    }

    /// 清除所有向量(重建空索引)
    pub fn clear(&self) {
        // 重建 HNSW 索引(真正的清理,而非软删除)
        let hnsw = Hnsw::new(
            self.config.max_nb_connection,
            self.config.max_elements,
            self.config.max_layer,
            self.config.ef_construction,
            DistCosine {},
        );
        *self.index.write() = hnsw;
        self.id_to_record.write().clear();
        self.workspace_to_ids.write().clear();
        self.file_to_ids.write().clear();
        *self.dim.write() = None;
        *self.next_id.write() = 0;
    }

    /// 记录数量(元数据表中实际有效的)
    pub fn len(&self) -> usize {
        self.id_to_record.read().len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 获取已索引的文件列表(去重排序)
    pub fn indexed_files(&self, workspace_root: &str) -> Vec<String> {
        let mut files: Vec<String> = self
            .id_to_record
            .read()
            .values()
            .filter(|r| r.workspace_root == workspace_root)
            .map(|r| r.file_path.clone())
            .collect();
        files.sort();
        files.dedup();
        files
    }

    /// 语义搜索:根据查询向量返回最相似的代码分块
    ///
    /// - `query_vector` - 查询的 embedding 向量
    /// - `workspace_root` - 限定搜索的工作区
    /// - `top_k` - 返回的最大结果数
    /// - `min_score` - 最低相似度阈值(范围 [0, 1])
    pub fn search(
        &self,
        query_vector: &[f64],
        workspace_root: &str,
        top_k: usize,
        min_score: f64,
    ) -> Vec<VectorSearchResult> {
        if self.is_empty() {
            return Vec::new();
        }
        // 维度校验
        if let Some(dim) = *self.dim.read() {
            if query_vector.len() != dim {
                return Vec::new();
            }
        }

        // Hnsw::search(&[T], knbn, ef_arg) -> Vec<Neighbour>
        // Neighbour.d_id 是外部 id,Neighbour.distance 是 f32 距离(越小越相似)
        // 取 ef_search 与 top_k 的较大值作为候选,确保召回率
        let ef = self.config.ef_search.max(top_k);
        let neighbors = self.index.read().search(query_vector, top_k.max(1), ef);

        // 反查元数据 + 工作区过滤 + 分数过滤
        // DistCosine 返回的是 1 - cosine_similarity,范围 [0, 2]
        // 转换为相似度分数 [0, 1] = 1 - distance/2
        let id_to_record = self.id_to_record.read();
        let mut results: Vec<VectorSearchResult> = neighbors
            .into_iter()
            .filter_map(|n| {
                let record = id_to_record.get(&n.d_id)?;
                if record.workspace_root != workspace_root {
                    return None;
                }
                // n.distance 是 f32,转 f64 计算
                let distance = n.distance as f64;
                let score = (1.0_f64 - distance / 2.0).max(0.0);
                if score < min_score {
                    return None;
                }
                Some(VectorSearchResult {
                    file_path: record.file_path.clone(),
                    start_line: record.start_line,
                    end_line: record.end_line,
                    snippet: record.text.chars().take(500).collect(),
                    score,
                })
            })
            .take(top_k)
            .collect();

        // 已按 distance 升序返回,转 score 后降序
        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results
    }

    /// 持久化 HNSW 索引到磁盘文件
    ///
    /// 调用 `AnnT::file_dump` 生成 `<basename>.hnsw.graph` + `<basename>.hnsw.data` 两份文件。
    /// 同时保存 `<path>.meta.json` 侧车文件,记录 id_to_record 元数据(供未来重建)。
    ///
    /// **注意**:`load_from_file` 暂未实现(因 `HnswIo::load_hnsw` 的生命周期约束)。
    /// 启动时建议直接重建索引(重新插入向量),`dump_to_file` 仅作为备份/调试用途。
    pub fn dump_to_file(&self, directory: &Path, basename: &str) -> SemanticResult<()> {
        // AnnT::file_dump(&self, path: &Path, file_basename: &str) -> anyhow::Result<String>
        self.index
            .read()
            .file_dump(directory, basename)
            .map_err(|e| SemanticError::IoError(format!("HNSW dump 失败: {e}")))?;

        // 元数据序列化为 JSON 侧车文件
        let meta_path = directory.join(format!("{basename}.meta.json"));
        let id_to_record = self.id_to_record.read();
        let meta: Vec<&VectorRecord> = id_to_record.values().collect();
        let meta_json = serde_json::to_string(&meta)
            .map_err(|e| SemanticError::IoError(format!("序列化元数据失败: {e}")))?;
        std::fs::write(&meta_path, meta_json)
            .map_err(|e| SemanticError::IoError(format!("写入元数据文件 {meta_path:?} 失败: {e}")))?;
        Ok(())
    }

    /// 校验向量维度,首次插入时记录,后续插入校验一致性
    fn ensure_dimension(&self, dim: usize) -> SemanticResult<()> {
        let mut current_dim = self.dim.write();
        match *current_dim {
            None => {
                *current_dim = Some(dim);
                Ok(())
            }
            Some(current) => {
                if current != dim {
                    return Err(SemanticError::VectorDimensionMismatch {
                        expected: current,
                        actual: dim,
                    });
                }
                Ok(())
            }
        }
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
    fn test_hnsw_search_basic() {
        let store = HnswVectorStore::new(HnswConfig {
            max_elements: 100,
            ..Default::default()
        })
        .unwrap();
        store
            .add(make_record("1", "ws", "a.rs", vec![1.0, 0.0, 0.0]))
            .unwrap();
        store
            .add(make_record("2", "ws", "b.rs", vec![0.0, 1.0, 0.0]))
            .unwrap();
        store
            .add(make_record("3", "ws", "c.rs", vec![0.9, 0.1, 0.0]))
            .unwrap();

        let results = store.search(&[1.0, 0.0, 0.0], "ws", 10, 0.0);
        assert!(!results.is_empty());
        // a.rs 应该是最高分(cosine similarity = 1.0)
        assert_eq!(results[0].file_path, "a.rs");
        assert!((results[0].score - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_hnsw_dimension_mismatch() {
        let store = HnswVectorStore::new(HnswConfig {
            max_elements: 100,
            ..Default::default()
        })
        .unwrap();
        store
            .add(make_record("1", "ws", "a.rs", vec![1.0, 0.0, 0.0]))
            .unwrap();
        // 试图插入维度不同的向量
        let result = store.add(make_record("2", "ws", "b.rs", vec![1.0, 0.0]));
        assert!(result.is_err());
        if let Err(SemanticError::VectorDimensionMismatch { expected, actual }) = result {
            assert_eq!(expected, 3);
            assert_eq!(actual, 2);
        } else {
            panic!("期望 VectorDimensionMismatch 错误");
        }
    }

    #[test]
    fn test_hnsw_clear_workspace() {
        let store = HnswVectorStore::new(HnswConfig {
            max_elements: 100,
            ..Default::default()
        })
        .unwrap();
        store
            .add(make_record("1", "ws1", "a.rs", vec![1.0, 0.0]))
            .unwrap();
        store
            .add(make_record("2", "ws2", "b.rs", vec![1.0, 0.0]))
            .unwrap();

        store.clear_workspace("ws1");
        assert_eq!(store.len(), 1);
        // ws2 的搜索仍可用
        let results = store.search(&[1.0, 0.0], "ws2", 10, 0.0);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_path, "b.rs");
    }

    #[test]
    fn test_hnsw_remove_file() {
        let store = HnswVectorStore::new(HnswConfig {
            max_elements: 100,
            ..Default::default()
        })
        .unwrap();
        store
            .add(make_record("1", "ws", "a.rs", vec![1.0, 0.0]))
            .unwrap();
        store
            .add(make_record("2", "ws", "a.rs", vec![0.0, 1.0]))
            .unwrap();
        store
            .add(make_record("3", "ws", "b.rs", vec![1.0, 1.0]))
            .unwrap();

        store.remove_file("ws", "a.rs");
        assert_eq!(store.len(), 1);
        let results = store.search(&[1.0, 1.0], "ws", 10, 0.0);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_path, "b.rs");
    }

    #[test]
    fn test_hnsw_indexed_files() {
        let store = HnswVectorStore::new(HnswConfig {
            max_elements: 100,
            ..Default::default()
        })
        .unwrap();
        store
            .add(make_record("1", "ws", "a.rs", vec![1.0, 0.0]))
            .unwrap();
        store
            .add(make_record("2", "ws", "a.rs", vec![0.0, 1.0]))
            .unwrap();
        store
            .add(make_record("3", "ws", "b.rs", vec![1.0, 1.0]))
            .unwrap();

        let files = store.indexed_files("ws");
        assert_eq!(files, vec!["a.rs", "b.rs"]);
    }

    #[test]
    fn test_hnsw_workspace_filter() {
        let store = HnswVectorStore::new(HnswConfig {
            max_elements: 100,
            ..Default::default()
        })
        .unwrap();
        store
            .add(make_record("1", "ws1", "a.rs", vec![1.0, 0.0]))
            .unwrap();
        store
            .add(make_record("2", "ws2", "a.rs", vec![1.0, 0.0]))
            .unwrap();

        // 在 ws1 中搜索,不应返回 ws2 的记录
        let results = store.search(&[1.0, 0.0], "ws1", 10, 0.0);
        assert_eq!(results.len(), 1);
    }
}
