// ydsz-provider: 模型注册表
pub mod sources;

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub max_tokens: Option<u32>,
}

/// 模型注册表
#[derive(Default)]
pub struct ModelRegistry {
    models: HashMap<String, ModelInfo>,
}

impl ModelRegistry {
    /// 创建空注册表
    pub fn new() -> Self {
        Self {
            models: HashMap::new(),
        }
    }

    /// 创建注册表并填充默认模型列表
    pub fn with_defaults() -> Self {
        let mut registry = Self::new();
        for model in crate::models_registry::sources::default_models() {
            registry.register(model);
        }
        registry
    }

    /// 注册模型
    pub fn register(&mut self, model: ModelInfo) {
        self.models.insert(model.id.clone(), model);
    }

    /// 根据 ID 获取模型
    pub fn get(&self, id: &str) -> Option<&ModelInfo> {
        self.models.get(id)
    }

    /// 列出所有已注册模型
    pub fn list(&self) -> Vec<&ModelInfo> {
        self.models.values().collect()
    }

    /// 按 Provider 筛选模型
    pub fn list_by_provider(&self, provider: &str) -> Vec<&ModelInfo> {
        self.models
            .values()
            .filter(|m| m.provider == provider)
            .collect()
    }

    /// 返回模型数量
    pub fn len(&self) -> usize {
        self.models.len()
    }

    /// 判断是否为空
    pub fn is_empty(&self) -> bool {
        self.models.is_empty()
    }
}

impl Clone for ModelRegistry {
    fn clone(&self) -> Self {
        Self {
            models: self.models.clone(),
        }
    }
}
