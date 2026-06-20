//! # Codex 生成的图片管理
//!
//! 本模块管理 Codex 在多模态场景下生成的图片：保存、压缩、引用计数、清理。
//!
//! ## 模块职责
//!
//! - **存储**：将生成的图片写入本地临时目录
//! - **去重**：基于内容哈希避免重复保存相同图片
//! - **引用计数**：当图片不再被任何消息引用时清理
//! - **元数据**：记录生成时间、模型、来源 Turn ID

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

/// 一张已生成的图片元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    /// 唯一标识（基于内容哈希）
    pub id: String,
    /// MIME 类型
    pub mime: String,
    /// 本地文件路径
    pub local_path: PathBuf,
    /// 生成时间
    pub created_at: SystemTime,
    /// 来源 Turn ID
    pub source_turn_id: String,
    /// 引用计数
    pub ref_count: u32,
}

/// 图片存储仓库
pub struct GeneratedImageStore {
    /// 存储根目录
    root: PathBuf,
    /// 索引（id -> 元数据）
    images: Arc<Mutex<HashMap<String, GeneratedImage>>>,
}

impl GeneratedImageStore {
    /// 创建存储仓库，自动确保根目录存在
    pub fn new(root: impl Into<PathBuf>) -> std::io::Result<Self> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            images: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// 保存一张图片
    ///
    /// # 参数
    ///
    /// - `data_base64`: Base64 编码的图片数据
    /// - `mime`: MIME 类型（如 "image/png"）
    /// - `source_turn_id`: 产生这张图片的 Turn ID
    ///
    /// # 返回值
    ///
    /// 返回图片的 `id`（基于 SHA-256 内容哈希）
    pub async fn save(
        &self,
        data_base64: &str,
        mime: &str,
        source_turn_id: &str,
    ) -> Result<String, String> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64.as_bytes())
            .map_err(|e| format!("Invalid base64: {e}"))?;

        let hash = sha256_hex(&bytes);
        let id = hash.clone();

        // 已存在则只增加引用计数
        {
            let mut map = self.images.lock().await;
            if let Some(existing) = map.get_mut(&id) {
                existing.ref_count += 1;
                debug!("图片已存在，增加引用计数: id={id}, ref_count={}", existing.ref_count);
                return Ok(id);
            }
        }

        // 写入文件
        let ext = mime_to_ext(mime);
        let filename = format!("{id}.{ext}");
        let path = self.root.join(&filename);
        std::fs::write(&path, &bytes).map_err(|e| format!("Write failed: {e}"))?;

        let now = SystemTime::now();
        let image = GeneratedImage {
            id: id.clone(),
            mime: mime.to_string(),
            local_path: path,
            created_at: now,
            source_turn_id: source_turn_id.to_string(),
            ref_count: 1,
        };
        self.images.lock().await.insert(id.clone(), image);

        info!("保存生成图片: id={id}, mime={mime}, path={:?}", self.root.join(filename));
        Ok(id)
    }

    /// 增加引用计数
    pub async fn retain(&self, id: &str) {
        if let Some(image) = self.images.lock().await.get_mut(id) {
            image.ref_count = image.ref_count.saturating_add(1);
        }
    }

    /// 减少引用计数，若为 0 则删除文件
    pub async fn release(&self, id: &str) {
        let to_remove = {
            let mut map = self.images.lock().await;
            if let Some(image) = map.get_mut(id) {
                image.ref_count = image.ref_count.saturating_sub(1);
                if image.ref_count == 0 {
                    let path = image.local_path.clone();
                    map.remove(id);
                    Some(path)
                } else {
                    None
                }
            } else {
                None
            }
        };
        if let Some(path) = to_remove {
            if let Err(e) = std::fs::remove_file(&path) {
                warn!("删除图片失败: {:?}, error={}", path, e);
            }
        }
    }

    /// 列出所有图片
    pub async fn list(&self) -> Vec<GeneratedImage> {
        self.images.lock().await.values().cloned().collect()
    }
}

fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "bin",
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    // 简单封装：使用 sha2 crate
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    result.iter().map(|b| format!("{b:02x}")).collect()
}

/// 工具函数：安全拼接路径
#[allow(dead_code)]
pub fn safe_join(base: &Path, relative: &str) -> Option<PathBuf> {
    let candidate = base.join(relative);
    let base_canon = base.canonicalize().ok()?;
    let cand_canon = candidate.canonicalize().ok()?;
    if cand_canon.starts_with(&base_canon) {
        Some(cand_canon)
    } else {
        None
    }
}
