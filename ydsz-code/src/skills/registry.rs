//! # 本地 Skill 注册表
//!
//! 维护"已安装 Skill 列表"，持久化到 `~/.ydsz/skills/registry.json`。
//!
//! ## 存储结构
//!
//! ```text
//! ~/.ydsz/skills/
//! ├── registry.json          # 已安装列表（带元数据）
//! └── installed/
//!     ├── react-best-practices/
//!     │   └── SKILL.md
//!     ├── typescript-strict/
//!     │   └── SKILL.md
//!     └── ...
//! ```
//!
//! ## 并发安全
//!
//! 使用 `parking_lot::Mutex` 保证多线程并发读写安全。
//! 写入采用"写临时文件 + rename"原子替换，避免半写状态。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
// `#[derive(specta::Type)]` 用的 derive 宏路径
#[allow(unused_imports)]
use specta::Type;

use super::error::{SkillError, SkillResult};
use super::manifest::SkillManifest;

/// 已安装 Skill 的元数据（registry.json 中存储）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    /// Skill 名称（与 manifest.name 一致，作为主键）
    pub name: String,
    /// 版本
    pub version: String,
    /// 描述
    pub description: String,
    /// 作者
    pub author: String,
    /// 运行时
    pub runtime: String,
    /// 标签
    pub tags: Vec<String>,
    /// 依赖
    pub depends: Vec<String>,
    /// 安装目录
    pub install_dir: String,
    /// 安装时间（RFC3339 字符串）
    pub installed_at: String,
    /// 安装源（`local:...` / `github:owner/repo@ref` / `marketplace:slug`）
    pub install_source: String,
}

/// 注册表持久化格式
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct RegistryFile {
    /// schema 版本（用于未来兼容）
    version: u32,
    /// 已安装列表（key = name）
    skills: HashMap<String, InstalledSkill>,
}

/// 本地 Skill 注册表
pub struct SkillRegistry {
    /// 注册表根目录（`~/.ydsz/skills/`）
    root: PathBuf,
    /// 内存中的注册表
    state: Mutex<RegistryFile>,
}

impl SkillRegistry {
    /// 打开或创建注册表
    ///
    /// - `root` 通常是 `~/.ydsz/skills/`，会自动创建
    /// - 已存在的 `registry.json` 会被加载
    /// - 不存在时初始化为空
    pub fn open(root: PathBuf) -> SkillResult<Self> {
        std::fs::create_dir_all(&root)?;
        let installed_dir = root.join("installed");
        std::fs::create_dir_all(&installed_dir)?;

        let registry_path = root.join("registry.json");
        let state = if registry_path.exists() {
            let content = std::fs::read_to_string(&registry_path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            RegistryFile {
                version: 1,
                skills: HashMap::new(),
            }
        };

        Ok(Self {
            root,
            state: Mutex::new(state),
        })
    }

    /// 注册表根目录
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Skill 安装目录（`~/.ydsz/skills/installed/`）
    pub fn installed_dir(&self) -> PathBuf {
        self.root.join("installed")
    }

    /// 列出所有已安装 skill
    pub fn list(&self) -> Vec<InstalledSkill> {
        let state = self.state.lock();
        let mut list: Vec<InstalledSkill> = state.skills.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    /// 按 name 查询
    pub fn get(&self, name: &str) -> Option<InstalledSkill> {
        self.state.lock().skills.get(name).cloned()
    }

    /// 检查是否已安装
    pub fn is_installed(&self, name: &str) -> bool {
        self.state.lock().skills.contains_key(name)
    }

    /// 注册一个已安装的 skill（带原子持久化）
    pub fn register(&self, entry: InstalledSkill) -> SkillResult<()> {
        {
            let mut state = self.state.lock();
            state.skills.insert(entry.name.clone(), entry);
        }
        self.persist()
    }

    /// 注销（uninstall）一个 skill
    pub fn unregister(&self, name: &str) -> SkillResult<InstalledSkill> {
        let removed = {
            let mut state = self.state.lock();
            state
                .skills
                .remove(name)
                .ok_or_else(|| SkillError::NotFound(name.to_string()))?
        };
        self.persist()?;
        Ok(removed)
    }

    /// 校验所有依赖是否已满足
    pub fn validate_dependencies(&self) -> Vec<String> {
        let state = self.state.lock();
        let names: std::collections::HashSet<&str> =
            state.skills.keys().map(String::as_str).collect();
        let mut missing = Vec::new();
        for skill in state.skills.values() {
            for dep in &skill.depends {
                if !names.contains(dep.as_str()) {
                    missing.push(format!("{} -> missing {}", skill.name, dep));
                }
            }
        }
        missing
    }

    /// 把内存状态持久化到 `registry.json`（原子写）
    fn persist(&self) -> SkillResult<()> {
        let json = {
            let state = self.state.lock();
            serde_json::to_string_pretty(&*state)
                .map_err(|e| SkillError::RegistryCorrupted(e.to_string()))?
        };
        let registry_path = self.root.join("registry.json");
        let tmp_path = registry_path.with_extension("json.tmp");
        std::fs::write(&tmp_path, json)?;
        // 原子 rename
        std::fs::rename(&tmp_path, &registry_path)?;
        Ok(())
    }
}

/// 从 SkillManifest 构造 InstalledSkill 元数据
pub fn installed_from_manifest(
    manifest: &SkillManifest,
    install_dir: &Path,
    install_source: String,
) -> InstalledSkill {
    InstalledSkill {
        name: manifest.name.clone(),
        version: manifest.version.clone(),
        description: manifest.description.clone(),
        author: manifest.author.clone(),
        runtime: manifest.runtime.clone(),
        tags: manifest.tags.clone(),
        depends: manifest.depends.clone(),
        install_dir: install_dir.to_string_lossy().to_string(),
        installed_at: chrono_now(),
        install_source,
    }
}

/// 当前时间 RFC3339 字符串（避免引入 chrono 完整功能）
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{now}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_registry() -> (tempfile::TempDir, SkillRegistry) {
        let dir = tempfile::tempdir().unwrap();
        let reg = SkillRegistry::open(dir.path().to_path_buf()).unwrap();
        (dir, reg)
    }

    #[test]
    fn open_creates_directory_structure() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("nested/skills");
        let _reg = SkillRegistry::open(root.clone()).unwrap();
        assert!(root.exists());
        assert!(root.join("installed").exists());
    }

    #[test]
    fn open_loads_existing_registry() {
        let dir = tempfile::tempdir().unwrap();
        // 第一次写一个
        {
            let reg = SkillRegistry::open(dir.path().to_path_buf()).unwrap();
            let manifest = SkillManifest {
                name: "test-skill".to_string(),
                version: "1.0.0".to_string(),
                description: "test".to_string(),
                author: "me".to_string(),
                runtime: "code".to_string(),
                tags: vec![],
                depends: vec![],
                body: "body".to_string(),
            };
            reg.register(installed_from_manifest(
                &manifest,
                &dir.path().join("installed/test-skill"),
                "local:./".to_string(),
            ))
            .unwrap();
        }
        // 重新打开应能加载
        let reg2 = SkillRegistry::open(dir.path().to_path_buf()).unwrap();
        assert!(reg2.is_installed("test-skill"));
        let entry = reg2.get("test-skill").unwrap();
        assert_eq!(entry.version, "1.0.0");
    }

    #[test]
    fn list_returns_sorted() {
        let (dir, reg) = fresh_registry();
        for name in &["zeta", "alpha", "beta"] {
            let manifest = SkillManifest {
                name: name.to_string(),
                version: "0.0.1".to_string(),
                description: "".to_string(),
                author: "".to_string(),
                runtime: "any".to_string(),
                tags: vec![],
                depends: vec![],
                body: "".to_string(),
            };
            reg.register(installed_from_manifest(
                &manifest,
                &dir.path().join(format!("installed/{name}")),
                format!("local:./{name}"),
            ))
            .unwrap();
        }
        let list = reg.list();
        assert_eq!(list[0].name, "alpha");
        assert_eq!(list[1].name, "beta");
        assert_eq!(list[2].name, "zeta");
    }

    #[test]
    fn unregister_removes() {
        let (dir, reg) = fresh_registry();
        let manifest = SkillManifest {
            name: "to-remove".to_string(),
            version: "0.0.1".to_string(),
            description: "".to_string(),
            author: "".to_string(),
            runtime: "any".to_string(),
            tags: vec![],
            depends: vec![],
            body: "".to_string(),
        };
        reg.register(installed_from_manifest(
            &manifest,
            &dir.path().join("installed/to-remove"),
            "local:".to_string(),
        ))
        .unwrap();
        assert!(reg.is_installed("to-remove"));
        let removed = reg.unregister("to-remove").unwrap();
        assert_eq!(removed.name, "to-remove");
        assert!(!reg.is_installed("to-remove"));
    }

    #[test]
    fn unregister_unknown_errors() {
        let (_dir, reg) = fresh_registry();
        let result = reg.unregister("not-here");
        assert!(matches!(result, Err(SkillError::NotFound(_))));
    }

    #[test]
    fn validate_dependencies_detects_missing() {
        let (dir, reg) = fresh_registry();
        // 装一个依赖 "missing-dep" 的 skill
        let manifest = SkillManifest {
            name: "needs-dep".to_string(),
            version: "0.0.1".to_string(),
            description: "".to_string(),
            author: "".to_string(),
            runtime: "any".to_string(),
            tags: vec![],
            depends: vec!["missing-dep".to_string()],
            body: "".to_string(),
        };
        reg.register(installed_from_manifest(
            &manifest,
            &dir.path().join("installed/needs-dep"),
            "local:".to_string(),
        ))
        .unwrap();
        let issues = reg.validate_dependencies();
        assert_eq!(issues.len(), 1);
        assert!(issues[0].contains("missing-dep"));
    }

    #[test]
    fn validate_dependencies_passes_when_satisfied() {
        let (dir, reg) = fresh_registry();
        // 先装 "a"，再装依赖 "a" 的 "b"
        for (name, depends) in [("a", vec![]), ("b", vec!["a".to_string()])] {
            let manifest = SkillManifest {
                name: name.to_string(),
                version: "0.0.1".to_string(),
                description: "".to_string(),
                author: "".to_string(),
                runtime: "any".to_string(),
                tags: vec![],
                depends: depends.clone(),
                body: "".to_string(),
            };
            reg.register(installed_from_manifest(
                &manifest,
                &dir.path().join(format!("installed/{name}")),
                format!("local:./{name}"),
            ))
            .unwrap();
        }
        let issues = reg.validate_dependencies();
        assert!(issues.is_empty());
    }
}
