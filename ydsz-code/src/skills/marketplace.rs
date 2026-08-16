//! # Skill 市场索引（marketplace）
//!
//! 内置一份 "云顶数字 Skill Marketplace" 索引，把 `marketplace:slug` 解析成具体的 GitHub 源。
//!
//! ## 数据来源
//!
//! - **W2-P2 起步**：内置静态索引（`MARKETPLACE_INDEX` 常量）
//! - **未来**：从 `https://marketplace.njydsz.com/index.json` 拉取（可被 Tauri 命令层替换）
//!
//! ## Schema
//!
//! ```json
//! {
//!   "version": 1,
//!   "skills": [
//!     {
//!       "slug": "react-best-practices",
//!       "name": "React Best Practices",
//!       "description": "推荐的 React 编码模式",
//!       "github_owner": "ydsz-org",
//!       "github_repo": "skills-react-best-practices",
//!       "github_ref": "v1.2.0",
//!       "tags": ["react", "frontend"],
//!       "runtime": "code",
//!       "verified": true
//!     }
//!   ]
//! }
//! ```

use serde::{Deserialize, Serialize};
// `#[derive(specta::Type)]` 用的 derive 宏路径
#[allow(unused_imports)]
use specta::Type;

/// Marketplace 索引条目
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceEntry {
    /// 短 slug（marketplace:slug URI 用）
    pub slug: String,
    /// 人类可读名
    pub name: String,
    /// 描述
    pub description: String,
    /// GitHub owner（内置能力留空）
    #[serde(default)]
    pub github_owner: String,
    /// GitHub repo（内置能力留空）
    #[serde(default)]
    pub github_repo: String,
    /// GitHub ref（tag / branch / sha，内置能力留空）
    #[serde(default)]
    pub github_ref: String,
    /// 标签
    #[serde(default)]
    pub tags: Vec<String>,
    /// 运行时
    #[serde(default = "default_runtime")]
    pub runtime: String,
    /// 是否官方认证
    #[serde(default)]
    pub verified: bool,
    /// 是否内置能力（无需安装，始终可用）
    #[serde(default)]
    pub builtin: bool,
}

fn default_runtime() -> String {
    "any".to_string()
}

/// Marketplace 索引（内存中）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Marketplace {
    /// schema 版本
    #[serde(default = "default_version")]
    pub version: u32,
    /// 索引条目（key = slug）
    pub skills: Vec<MarketplaceEntry>,
}

fn default_version() -> u32 {
    1
}

impl Marketplace {
    /// 创建空 marketplace
    pub fn new() -> Self {
        Self {
            version: 1,
            skills: Vec::new(),
        }
    }

    /// 从 JSON 反序列化
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// 序列化为 JSON
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// 查找一个 slug
    pub fn lookup(&self, slug: &str) -> Option<&MarketplaceEntry> {
        self.skills.iter().find(|e| e.slug == slug)
    }

    /// 关键字搜索（按 name/description/tags 命中）
    pub fn search(&self, query: &str) -> Vec<&MarketplaceEntry> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return self.skills.iter().collect();
        }
        self.skills
            .iter()
            .filter(|e| {
                e.slug.to_lowercase().contains(&q)
                    || e.name.to_lowercase().contains(&q)
                    || e.description.to_lowercase().contains(&q)
                    || e.tags.iter().any(|t| t.to_lowercase().contains(&q))
            })
            .collect()
    }

    /// 按 tag 过滤
    pub fn by_tag(&self, tag: &str) -> Vec<&MarketplaceEntry> {
        self.skills
            .iter()
            .filter(|e| e.tags.iter().any(|t| t == tag))
            .collect()
    }

    /// 按 runtime 过滤
    pub fn by_runtime(&self, runtime: &str) -> Vec<&MarketplaceEntry> {
        self.skills
            .iter()
            .filter(|e| e.runtime == runtime || e.runtime == "any")
            .collect()
    }

    /// 获取所有内置能力（builtin = true）
    ///
    /// 内置能力无需安装，始终可用。包括 Office、Browser、Scheduler、LSP、Indexer 等。
    pub fn builtin_entries(&self) -> Vec<&MarketplaceEntry> {
        self.skills
            .iter()
            .filter(|e| e.builtin)
            .collect()
    }

    /// 追加条目
    pub fn add(&mut self, entry: MarketplaceEntry) {
        // 去重：slug 相同则替换
        if let Some(existing) = self.skills.iter_mut().find(|e| e.slug == entry.slug) {
            *existing = entry;
        } else {
            self.skills.push(entry);
        }
    }

    /// 移除条目
    pub fn remove(&mut self, slug: &str) -> Option<MarketplaceEntry> {
        if let Some(idx) = self.skills.iter().position(|e| e.slug == slug) {
            Some(self.skills.remove(idx))
        } else {
            None
        }
    }
}

/// 内置静态 marketplace 索引（W2 起步数据）
///
/// 真实部署时会被 Tauri 命令层从 `https://marketplace.njydsz.com/index.json` 拉取替换。
pub static MARKETPLACE_INDEX: &str = include_str!("../../../docs/superpowers/marketplace-index.json");

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry(slug: &str) -> MarketplaceEntry {
        MarketplaceEntry {
            slug: slug.to_string(),
            name: format!("Sample {slug}"),
            description: "sample description".to_string(),
            github_owner: "ydsz-org".to_string(),
            github_repo: format!("skills-{slug}"),
            github_ref: "v1.0.0".to_string(),
            tags: vec!["sample".to_string()],
            runtime: "code".to_string(),
            verified: true,
            builtin: false,
        }
    }

    #[test]
    fn empty_marketplace() {
        let mp = Marketplace::new();
        assert_eq!(mp.version, 1);
        assert!(mp.skills.is_empty());
    }

    #[test]
    fn add_and_lookup() {
        let mut mp = Marketplace::new();
        mp.add(sample_entry("react-tips"));
        let entry = mp.lookup("react-tips").unwrap();
        assert_eq!(entry.github_repo, "skills-react-tips");
    }

    #[test]
    fn add_dedup_replaces() {
        let mut mp = Marketplace::new();
        mp.add(sample_entry("a"));
        let mut e = sample_entry("a");
        e.description = "updated".to_string();
        mp.add(e);
        assert_eq!(mp.skills.len(), 1);
        assert_eq!(mp.lookup("a").unwrap().description, "updated");
    }

    #[test]
    fn remove_returns_removed() {
        let mut mp = Marketplace::new();
        mp.add(sample_entry("a"));
        let removed = mp.remove("a").unwrap();
        assert_eq!(removed.slug, "a");
        assert!(mp.lookup("a").is_none());
    }

    #[test]
    fn remove_missing_returns_none() {
        let mut mp = Marketplace::new();
        assert!(mp.remove("nope").is_none());
    }

    #[test]
    fn search_finds_by_name() {
        let mut mp = Marketplace::new();
        mp.add(sample_entry("react-tips"));
        mp.add(sample_entry("vue-tips"));
        let results = mp.search("react");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].slug, "react-tips");
    }

    #[test]
    fn search_finds_by_tag() {
        let mut mp = Marketplace::new();
        let mut e = sample_entry("a");
        e.tags = vec!["performance".to_string()];
        mp.add(e);
        let results = mp.search("performance");
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn search_empty_query_returns_all() {
        let mut mp = Marketplace::new();
        mp.add(sample_entry("a"));
        mp.add(sample_entry("b"));
        assert_eq!(mp.search("").len(), 2);
    }

    #[test]
    fn by_tag_filters() {
        let mut mp = Marketplace::new();
        let mut a = sample_entry("a");
        a.tags = vec!["x".to_string()];
        let b = sample_entry("b");
        mp.add(a);
        mp.add(b);
        assert_eq!(mp.by_tag("x").len(), 1);
    }

    #[test]
    fn by_runtime_includes_any() {
        let mut mp = Marketplace::new();
        let mut a = sample_entry("a");
        a.runtime = "code".to_string();
        let b = sample_entry("b"); // default: "code"
        let mut c = sample_entry("c");
        c.runtime = "any".to_string();
        mp.add(a);
        mp.add(b);
        mp.add(c);
        // by_runtime("code") 应包括 runtime=code + runtime=any
        let results = mp.by_runtime("code");
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn serialize_and_deserialize_roundtrip() {
        let mut mp = Marketplace::new();
        mp.add(sample_entry("a"));
        let json = mp.to_json().unwrap();
        let restored = Marketplace::from_json(&json).unwrap();
        assert_eq!(restored.skills.len(), 1);
        assert_eq!(restored.lookup("a").unwrap().name, "Sample a");
    }
}
