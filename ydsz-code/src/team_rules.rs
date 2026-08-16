//! # 团队共享规则加载器
//!
//! 提供跨项目的"团队共享规则"能力。与项目级 `.ydsz/rules/` 不同,
//! 团队规则存储在用户全局目录(`~/.ydsz-buddy/team-rules/`),适合:
//!
//! - 多人团队统一规范(代码风格 / 测试要求 / 评审清单)
//! - 公司内部"AI 协作守则"
//! - 个人在多个项目复用的全局规则
//!
//! ## 目录结构
//!
//! ```text
//! ~/.ydsz-buddy/team-rules/
//! ├── 00-default-style.md     # 团队编码风格
//! ├── 01-test-policy.md       # 团队测试要求
//! ├── manifest.json           # 元数据(版本/最后同步时间/启用状态)
//! └── archive/                # 已废弃规则归档
//! ```
//!
//! ## 与项目级规则的关系
//!
//! | 来源 | 优先级 | 命名 | 存储位置 |
//! |------|--------|------|----------|
//! | 项目内 `AGENTS.md` | 0 | 事实标准 | `<project_root>/AGENTS.md` |
//! | 项目内 `.ydsz/rules/` | 2 | 项目级 | `<project_root>/.ydsz/rules/*.md` |
//! | 团队共享 | 3 | 全局 | `~/.ydsz-buddy/team-rules/*.md` |
//!
//! **项目级规则优先于团队共享**——团队规则只作为"项目无规则时的兜底"。
//!
//! ## 合并策略
//!
//! 1. 先加载项目级规则(`ProjectRulesLoader::load`)
//! 2. 若项目级完全没有 `.ydsz/` 相关规则,自动追加团队共享规则
//! 3. 团队规则可被项目级 `.ydsz/rules/` 中的同名文件覆盖(项目覆盖原则)

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

/// 团队规则目录名
pub const TEAM_RULES_DIR_NAME: &str = "team-rules";
/// manifest 文件名
pub const MANIFEST_FILE: &str = "manifest.json";
/// 单文件上限(沿用项目规则限制)
pub const MAX_FILE_BYTES: usize = 32 * 1024;
/// 聚合总大小上限
pub const MAX_TOTAL_BYTES: usize = 128 * 1024;
/// 目录递归深度
pub const MAX_RECURSION_DEPTH: usize = 3;
/// 文件数量上限
pub const MAX_FILES: usize = 8;

/// 团队共享规则元数据(写到 manifest.json)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TeamRulesManifest {
    /// 规则 schema 版本
    pub schema_version: u32,
    /// manifest 最后写入时间(RFC 3339)
    pub updated_at: String,
    /// 团队名称(可选,仅展示用)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
    /// 远程 git 仓库地址(可选,用于"团队同步"功能)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_url: Option<String>,
    /// 远程版本 commit hash
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_commit: Option<String>,
    /// 是否已禁用(false 表示整组规则被静默)
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

impl Default for TeamRulesManifest {
    fn default() -> Self {
        Self {
            schema_version: 1,
            updated_at: now_iso(),
            team_name: None,
            remote_url: None,
            remote_commit: None,
            enabled: true,
        }
    }
}

/// 单个团队规则文件
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TeamRuleFile {
    /// 文件名(不含目录,排序用)
    pub name: String,
    /// 完整路径
    pub path: PathBuf,
    /// 文件内容(可能已截断)
    pub content: String,
    /// 原始字节数
    pub original_bytes: usize,
    /// 是否被截断
    pub truncated: bool,
    /// 最后修改时间(unix epoch 秒)
    pub modified_at: u64,
}

/// 团队规则加载结果
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TeamRules {
    /// 团队规则目录根路径
    pub root: Option<PathBuf>,
    /// manifest(若存在)
    pub manifest: Option<TeamRulesManifest>,
    /// 加载到的文件(按文件名升序)
    pub files: Vec<TeamRuleFile>,
    /// 跳过的文件数
    pub skipped: usize,
    /// 错误信息(目录不可读等)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl TeamRules {
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// 聚合大小
    pub fn total_bytes(&self) -> usize {
        self.files.iter().map(|f| f.content.len()).sum()
    }

    /// 合并为单一 markdown,适合注入到 Provider turn
    pub fn merged_markdown(&self) -> Option<String> {
        if self.files.is_empty() {
            return None;
        }
        let mut out = String::new();
        out.push_str("# Team Rules\n\n");
        out.push_str("以下规则由团队共享,跨项目自动加载,请严格遵守。\n\n");
        for f in &self.files {
            out.push_str(&format!("## {}\n\n", f.name));
            if f.truncated {
                out.push_str(&format!(
                    "_[注: 原文件 {} bytes,已截断到 {} bytes]_\n\n",
                    f.original_bytes,
                    f.content.len()
                ));
            }
            out.push_str(&f.content);
            if !f.content.ends_with('\n') {
                out.push('\n');
            }
            out.push('\n');
        }
        Some(out)
    }
}

/// 团队规则加载器
pub struct TeamRulesLoader;

impl TeamRulesLoader {
    /// 加载指定 base_dir 下的团队共享规则
    ///
    /// `base_dir` 一般是 `~/.ydsz-buddy/`,内部应有 `team-rules/` 子目录
    pub fn load(base_dir: &Path) -> TeamRules {
        let root = base_dir.join(TEAM_RULES_DIR_NAME);
        if !root.exists() {
            return TeamRules {
                root: None,
                ..Default::default()
            };
        }
        if !root.is_dir() {
            return TeamRules {
                root: Some(root.clone()),
                error: Some(format!(
                    "{} 存在但不是目录",
                    root.display()
                )),
                ..Default::default()
            };
        }

        // 1. 读 manifest(若存在)
        let manifest = read_manifest(&root);

        // 若 manifest 显式禁用,直接返回空(但不报错)
        if let Some(m) = &manifest {
            if !m.enabled {
                return TeamRules {
                    root: Some(root),
                    manifest,
                    ..Default::default()
                };
            }
        }

        // 2. 遍历 .md 文件
        let mut files: Vec<TeamRuleFile> = Vec::new();
        let mut total: usize = 0;
        let mut skipped: usize = 0;

        let mut entries: Vec<PathBuf> = WalkDir::new(&root)
            .max_depth(MAX_RECURSION_DEPTH)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                let name = e.file_name().to_string_lossy();
                // 跳过 manifest.json 自身
                if name == MANIFEST_FILE {
                    return false;
                }
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|x| x.eq_ignore_ascii_case("md"))
                    .unwrap_or(false)
            })
            .map(|e| e.path().to_path_buf())
            .collect();
        entries.sort();

        for path in entries {
            if files.len() >= MAX_FILES || total >= MAX_TOTAL_BYTES {
                skipped += 1;
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                skipped += 1;
                continue;
            };
            let original = content.len();
            let (content, truncated) = if original > MAX_FILE_BYTES {
                let mut end = MAX_FILE_BYTES;
                while end > 0 && !content.is_char_boundary(end) {
                    end -= 1;
                }
                (content[..end].to_string(), true)
            } else {
                (content, false)
            };
            total += content.len();
            let modified_at = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            files.push(TeamRuleFile {
                name,
                path,
                content,
                original_bytes: original,
                truncated,
                modified_at,
            });
        }

        TeamRules {
            root: Some(root),
            manifest,
            files,
            skipped,
            error: None,
        }
    }

    /// 确保团队规则目录存在(若不存在则创建)
    pub fn ensure_root(base_dir: &Path) -> Result<PathBuf, String> {
        let root = base_dir.join(TEAM_RULES_DIR_NAME);
        std::fs::create_dir_all(&root)
            .map_err(|e| format!("创建团队规则目录失败 {}: {e}", root.display()))?;
        Ok(root)
    }
}

/// 读取 manifest.json(若不存在返回 None)
fn read_manifest(root: &Path) -> Option<TeamRulesManifest> {
    let path = root.join(MANIFEST_FILE);
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// 写入 manifest.json(原子写入,先写临时文件再 rename)
pub fn write_manifest(root: &Path, manifest: &TeamRulesManifest) -> Result<(), String> {
    let path = root.join(MANIFEST_FILE);
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("序列化 manifest 失败: {e}"))?;
    std::fs::write(&tmp, body).map_err(|e| format!("写 manifest 临时文件失败: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename manifest 失败: {e}"))?;
    Ok(())
}

/// 生成 RFC 3339 时间戳(简化:不依赖 chrono,直接 format unix epoch)
fn now_iso() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("1970-01-01T00:00:00Z+{now}s")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ydsz-team-rules-test-{}-{}",
            tag,
            uuid::Uuid::new_v4()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn empty_base_dir_returns_empty() {
        let dir = make_base("empty");
        let rules = TeamRulesLoader::load(&dir);
        assert!(rules.is_empty());
        assert!(rules.root.is_none());
    }

    #[test]
    fn nonexistent_subdir_returns_empty() {
        let dir = make_base("none");
        // 不创建 team-rules 子目录
        let rules = TeamRulesLoader::load(&dir);
        assert!(rules.is_empty());
    }

    #[test]
    fn loads_simple_team_files() {
        let dir = make_base("simple");
        let team = dir.join(TEAM_RULES_DIR_NAME);
        fs::create_dir_all(&team).unwrap();
        fs::write(team.join("00-style.md"), "use tabs").unwrap();
        fs::write(team.join("01-test.md"), "always test").unwrap();
        let rules = TeamRulesLoader::load(&dir);
        assert_eq!(rules.files.len(), 2);
        assert_eq!(rules.files[0].name, "00-style.md");
        assert_eq!(rules.files[1].name, "01-test.md");
        assert_eq!(rules.files[0].content, "use tabs");
    }

    #[test]
    fn manifest_disabled_returns_empty_files() {
        let dir = make_base("disabled");
        let team = dir.join(TEAM_RULES_DIR_NAME);
        fs::create_dir_all(&team).unwrap();
        fs::write(team.join("rule.md"), "should not load").unwrap();
        let manifest = TeamRulesManifest {
            enabled: false,
            ..Default::default()
        };
        write_manifest(&team, &manifest).unwrap();
        let rules = TeamRulesLoader::load(&dir);
        // 禁用时文件应为空,但 manifest 仍可读
        assert!(rules.files.is_empty());
        assert!(rules.manifest.is_some());
        assert!(!rules.manifest.as_ref().unwrap().enabled);
    }

    #[test]
    fn truncates_oversized_file() {
        let dir = make_base("big");
        let team = dir.join(TEAM_RULES_DIR_NAME);
        fs::create_dir_all(&team).unwrap();
        let big = "x".repeat(MAX_FILE_BYTES + 1000);
        fs::write(team.join("big.md"), &big).unwrap();
        let rules = TeamRulesLoader::load(&dir);
        assert_eq!(rules.files.len(), 1);
        assert!(rules.files[0].truncated);
        assert!(rules.files[0].content.len() <= MAX_FILE_BYTES);
    }

    #[test]
    fn skips_manifest_file_itself() {
        let dir = make_base("manifest");
        let team = dir.join(TEAM_RULES_DIR_NAME);
        fs::create_dir_all(&team).unwrap();
        write_manifest(
            &team,
            &TeamRulesManifest {
                team_name: Some("Platform".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        fs::write(team.join("rule.md"), "x").unwrap();
        let rules = TeamRulesLoader::load(&dir);
        // manifest.json 不应被当成规则文件
        assert_eq!(rules.files.len(), 1);
        assert_eq!(rules.files[0].name, "rule.md");
        assert!(rules.manifest.is_some());
        assert_eq!(
            rules.manifest.as_ref().unwrap().team_name.as_deref(),
            Some("Platform")
        );
    }

    #[test]
    fn ensure_root_creates_dir() {
        let dir = make_base("ensure");
        let root = TeamRulesLoader::ensure_root(&dir).unwrap();
        assert!(root.is_dir());
        assert!(root.ends_with(TEAM_RULES_DIR_NAME));
    }

    #[test]
    fn merged_markdown_includes_all_files() {
        let dir = make_base("merged");
        let team = dir.join(TEAM_RULES_DIR_NAME);
        fs::create_dir_all(&team).unwrap();
        fs::write(team.join("a.md"), "rule A").unwrap();
        fs::write(team.join("b.md"), "rule B").unwrap();
        let rules = TeamRulesLoader::load(&dir);
        let md = rules.merged_markdown().unwrap();
        assert!(md.contains("rule A"));
        assert!(md.contains("rule B"));
        assert!(md.contains("# Team Rules"));
        assert!(md.contains("## a.md"));
    }

    #[test]
    fn corrupted_manifest_treated_as_none() {
        let dir = make_base("badmanifest");
        let team = dir.join(TEAM_RULES_DIR_NAME);
        fs::create_dir_all(&team).unwrap();
        fs::write(team.join(MANIFEST_FILE), "not valid json {").unwrap();
        fs::write(team.join("rule.md"), "x").unwrap();
        let rules = TeamRulesLoader::load(&dir);
        // manifest 解析失败 → 视作 None,但规则文件应照常加载
        assert!(rules.manifest.is_none());
        assert_eq!(rules.files.len(), 1);
    }
}
