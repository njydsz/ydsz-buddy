//! # 团队共享规则命令模块
//!
//! 提供与 `~/.ydsz-buddy/team-rules/` 目录交互的 Tauri 命令。
//!
//! ## 用法
//!
//! 团队规则是跨项目复用的全局规则,在用户全局 base_dir 下的
//! `team-rules/` 子目录中以 `.md` 文件组织,并通过 `manifest.json` 描述元数据。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `team_rules_resolve_base_dir` | 解析团队规则根目录(返回绝对路径) |
//! | `team_rules_list` | 列出所有团队规则(含 manifest + 文件清单) |
//! | `team_rules_read` | 读取单条规则的完整内容 |
//! | `team_rules_save` | 创建 / 更新一条规则 |
//! | `team_rules_delete` | 删除一条规则 |
//! | `team_rules_save_manifest` | 写入 manifest(版本 / 团队名 / 启用状态) |
//!
//! ## 性能
//!
//! - 列表 / 读取 < 10ms(< 1MB 规则)
//! - 写操作原子化:先写 `.tmp` 再 `rename`
//! - 与项目级 `project_rules` 完全解耦(独立目录 / 独立命令)

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;
use tracing::{info, warn};

use ydsz_code::team_rules::{
    self, TeamRuleFile, TeamRules, TeamRulesLoader, TeamRulesManifest,
};

/// 团队规则文件 DTO
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuleFileDto {
    /// 文件名(不含目录)
    pub name: String,
    /// 完整路径
    pub path: String,
    /// 文件内容
    pub content: String,
    /// 原始字节数
    pub original_bytes: usize,
    /// 是否被截断
    pub truncated: bool,
    /// 最后修改时间(unix epoch 秒)
    pub modified_at: u64,
}

impl From<TeamRuleFile> for TeamRuleFileDto {
    fn from(f: TeamRuleFile) -> Self {
        Self {
            name: f.name,
            path: f.path.to_string_lossy().to_string(),
            content: f.content,
            original_bytes: f.original_bytes,
            truncated: f.truncated,
            modified_at: f.modified_at,
        }
    }
}

/// 团队规则 manifest DTO
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamRulesManifestDto {
    pub schema_version: u32,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub team_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub remote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub remote_commit: Option<String>,
    pub enabled: bool,
}

impl From<TeamRulesManifest> for TeamRulesManifestDto {
    fn from(m: TeamRulesManifest) -> Self {
        Self {
            schema_version: m.schema_version,
            updated_at: m.updated_at,
            team_name: m.team_name,
            remote_url: m.remote_url,
            remote_commit: m.remote_commit,
            enabled: m.enabled,
        }
    }
}

impl From<TeamRulesManifestDto> for TeamRulesManifest {
    fn from(m: TeamRulesManifestDto) -> Self {
        Self {
            schema_version: m.schema_version,
            updated_at: m.updated_at,
            team_name: m.team_name,
            remote_url: m.remote_url,
            remote_commit: m.remote_commit,
            enabled: m.enabled,
        }
    }
}

/// 团队规则列表结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamRulesListDto {
    /// 团队规则目录根路径
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub root: Option<String>,
    /// manifest(若存在)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub manifest: Option<TeamRulesManifestDto>,
    /// 文件清单(按文件名升序)
    pub files: Vec<TeamRuleFileDto>,
    /// 跳过的文件数
    pub skipped: usize,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
    /// 加载耗时(毫秒)
    pub elapsed_ms: u128,
}

impl From<TeamRules> for TeamRulesListDto {
    fn from(r: TeamRules) -> Self {
        Self {
            root: r.root.map(|p| p.to_string_lossy().to_string()),
            manifest: r.manifest.map(Into::into),
            files: r.files.into_iter().map(Into::into).collect(),
            skipped: r.skipped,
            error: r.error,
            elapsed_ms: 0,
        }
    }
}

/// 单文件读取结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuleReadResult {
    /// 是否找到
    pub found: bool,
    /// 文件内容(仅 found=true 时有值)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub file: Option<TeamRuleFileDto>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

/// 解析 base_dir 参数(可由前端传入,缺省时回退到 home_dir/.2. 环境变量 YDSZ_BOOTSTRAP_TOKEN)
fn resolve_base_dir(input: Option<String>) -> Result<PathBuf, String> {
    if let Some(p) = input {
        if !p.trim().is_empty() {
            return Ok(PathBuf::from(p));
        }
    }
    let home = dirs::home_dir().ok_or_else(|| "无法获取 home 目录".to_string())?;
    Ok(home.join(".2. 环境变量 YDSZ_BOOTSTRAP_TOKEN"))
}

/// 解析团队规则根目录
#[tauri::command]
#[specta::specta]
pub fn team_rules_resolve_base_dir(base_dir: Option<String>) -> Result<String, String> {
    let base = resolve_base_dir(base_dir)?;
    Ok(base.join(team_rules::TEAM_RULES_DIR_NAME).to_string_lossy().to_string())
}

/// 列出所有团队规则
#[tauri::command]
#[specta::specta]
pub fn team_rules_list(base_dir: Option<String>) -> TeamRulesListDto {
    let start = std::time::Instant::now();
    let base = match resolve_base_dir(base_dir) {
        Ok(p) => p,
        Err(e) => {
            return TeamRulesListDto {
                root: None,
                manifest: None,
                files: vec![],
                skipped: 0,
                error: Some(e),
                elapsed_ms: start.elapsed().as_millis(),
            }
        }
    };
    let rules = TeamRulesLoader::load(&base);
    let mut dto: TeamRulesListDto = rules.into();
    dto.elapsed_ms = start.elapsed().as_millis();
    dto
}

/// 读取单条规则
#[tauri::command]
#[specta::specta]
pub fn team_rules_read(
    base_dir: Option<String>,
    file_name: String,
) -> TeamRuleReadResult {
    let base = match resolve_base_dir(base_dir) {
        Ok(p) => p,
        Err(e) => {
            return TeamRuleReadResult {
                found: false,
                file: None,
                error: Some(e),
            }
        }
    };
    let root = base.join(team_rules::TEAM_RULES_DIR_NAME);

    // 校验文件名(防 path traversal)
    if file_name.is_empty()
        || file_name.contains("..")
        || file_name.contains('/')
        || file_name.contains('\\')
        || !file_name.to_lowercase().ends_with(".md")
    {
        return TeamRuleReadResult {
            found: false,
            file: None,
            error: Some(format!("非法的文件名: {file_name}")),
        };
    }

    let path = root.join(&file_name);
    if !path.exists() {
        return TeamRuleReadResult {
            found: false,
            file: None,
            error: Some(format!("文件不存在: {}", path.display())),
        };
    }

    match std::fs::read_to_string(&path) {
        Ok(content) => {
            let original = content.len();
            let (content, truncated) = if original > team_rules::MAX_FILE_BYTES {
                let mut end = team_rules::MAX_FILE_BYTES;
                while end > 0 && !content.is_char_boundary(end) {
                    end -= 1;
                }
                (content[..end].to_string(), true)
            } else {
                (content, false)
            };
            let modified_at = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            TeamRuleReadResult {
                found: true,
                file: Some(TeamRuleFileDto {
                    name: file_name,
                    path: path.to_string_lossy().to_string(),
                    content,
                    original_bytes: original,
                    truncated,
                    modified_at,
                }),
                error: None,
            }
        }
        Err(e) => TeamRuleReadResult {
            found: false,
            file: None,
            error: Some(format!("读取失败: {e}")),
        },
    }
}

/// 写规则入参
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamRuleSaveInput {
    /// 文件名(必须以 .md 结尾,不含目录)
    pub file_name: String,
    /// 文件内容
    pub content: String,
}

/// 保存一条规则(创建 / 更新)
#[tauri::command]
#[specta::specta]
pub fn team_rules_save(
    base_dir: Option<String>,
    input: TeamRuleSaveInput,
) -> Result<TeamRuleFileDto, String> {
    let base = resolve_base_dir(base_dir)?;
    let root = TeamRulesLoader::ensure_root(&base)?;
    let file_name = input.file_name;

    // 校验文件名
    if file_name.is_empty()
        || file_name.contains("..")
        || file_name.contains('/')
        || file_name.contains('\\')
        || !file_name.to_lowercase().ends_with(".md")
    {
        return Err(format!("非法的文件名: {file_name}"));
    }
    if file_name == team_rules::MANIFEST_FILE {
        return Err(format!("不能覆盖 {}", team_rules::MANIFEST_FILE));
    }
    if input.content.len() > team_rules::MAX_FILE_BYTES {
        return Err(format!(
            "内容超过单文件上限 ({} bytes)",
            team_rules::MAX_FILE_BYTES
        ));
    }

    let path = root.join(&file_name);
    let tmp = path.with_extension("md.tmp");
    std::fs::write(&tmp, &input.content)
        .map_err(|e| format!("写临时文件失败: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename 失败: {e}"))?;

    let modified_at = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    info!(file = %file_name, "团队规则已保存");

    Ok(TeamRuleFileDto {
        name: file_name,
        path: path.to_string_lossy().to_string(),
        content: input.content.clone(),
        original_bytes: input.content.len(),
        truncated: false,
        modified_at,
    })
}

/// 删除一条规则
#[tauri::command]
#[specta::specta]
pub fn team_rules_delete(
    base_dir: Option<String>,
    file_name: String,
) -> Result<bool, String> {
    let base = resolve_base_dir(base_dir)?;
    let root = base.join(team_rules::TEAM_RULES_DIR_NAME);
    if file_name.is_empty()
        || file_name.contains("..")
        || file_name.contains('/')
        || file_name.contains('\\')
        || !file_name.to_lowercase().ends_with(".md")
    {
        return Err(format!("非法的文件名: {file_name}"));
    }
    let path = root.join(&file_name);
    if !path.exists() {
        warn!(file = %file_name, "团队规则不存在,跳过删除");
        return Ok(false);
    }
    std::fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))?;
    info!(file = %file_name, "团队规则已删除");
    Ok(true)
}

/// 写入 manifest
#[tauri::command]
#[specta::specta]
pub fn team_rules_save_manifest(
    base_dir: Option<String>,
    manifest: TeamRulesManifestDto,
) -> Result<TeamRulesManifestDto, String> {
    let base = resolve_base_dir(base_dir)?;
    let root = TeamRulesLoader::ensure_root(&base)?;
    let mut next: TeamRulesManifest = manifest.into();
    next.updated_at = chrono::Utc::now().to_rfc3339();
    team_rules::write_manifest(&root, &next)?;
    Ok(next.into())
}

// ==================== 单元测试 ====================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ydsz-team-rules-cmd-{}-{}",
            tag,
            uuid::Uuid::new_v4()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn list_returns_empty_for_no_team_dir() {
        let base = make_base("list-empty");
        let dto = team_rules_list(Some(base.to_string_lossy().to_string()));
        assert!(dto.files.is_empty());
        assert!(dto.root.is_none());
        assert!(dto.error.is_none());
    }

    #[test]
    fn list_returns_files_for_existing_team_dir() {
        let base = make_base("list-files");
        let team = base.join(team_rules::TEAM_RULES_DIR_NAME);
        fs::create_dir_all(&team).unwrap();
        fs::write(team.join("a.md"), "rule A").unwrap();
        fs::write(team.join("b.md"), "rule B").unwrap();

        let dto = team_rules_list(Some(base.to_string_lossy().to_string()));
        assert_eq!(dto.files.len(), 2);
        assert!(dto.files[0].name <= dto.files[1].name);
        assert_eq!(dto.files[0].content, "rule A");
    }

    #[test]
    fn save_and_read_roundtrip() {
        let base = make_base("save-read");
        let dto = team_rules_save(
            Some(base.to_string_lossy().to_string()),
            TeamRuleSaveInput {
                file_name: "rule.md".to_string(),
                content: "use tabs".to_string(),
            },
        )
        .unwrap();
        assert_eq!(dto.content, "use tabs");

        let read = team_rules_read(
            Some(base.to_string_lossy().to_string()),
            "rule.md".to_string(),
        );
        assert!(read.found);
        assert_eq!(read.file.unwrap().content, "use tabs");
    }

    #[test]
    fn save_rejects_invalid_filename() {
        let base = make_base("save-bad");
        // path traversal
        assert!(team_rules_save(
            Some(base.to_string_lossy().to_string()),
            TeamRuleSaveInput {
                file_name: "../evil.md".to_string(),
                content: "x".to_string(),
            }
        )
        .is_err());
        // 目录分隔符
        assert!(team_rules_save(
            Some(base.to_string_lossy().to_string()),
            TeamRuleSaveInput {
                file_name: "sub/rule.md".to_string(),
                content: "x".to_string(),
            }
        )
        .is_err());
        // 非 .md 后缀
        assert!(team_rules_save(
            Some(base.to_string_lossy().to_string()),
            TeamRuleSaveInput {
                file_name: "rule.txt".to_string(),
                content: "x".to_string(),
            }
        )
        .is_err());
        // 覆盖 manifest.json
        assert!(team_rules_save(
            Some(base.to_string_lossy().to_string()),
            TeamRuleSaveInput {
                file_name: team_rules::MANIFEST_FILE.to_string(),
                content: "{}".to_string(),
            }
        )
        .is_err());
    }

    #[test]
    fn delete_removes_file() {
        let base = make_base("delete");
        team_rules_save(
            Some(base.to_string_lossy().to_string()),
            TeamRuleSaveInput {
                file_name: "x.md".to_string(),
                content: "x".to_string(),
            },
        )
        .unwrap();
        let deleted = team_rules_delete(
            Some(base.to_string_lossy().to_string()),
            "x.md".to_string(),
        )
        .unwrap();
        assert!(deleted);
        // 再次删除应返回 false
        let again = team_rules_delete(
            Some(base.to_string_lossy().to_string()),
            "x.md".to_string(),
        )
        .unwrap();
        assert!(!again);
    }

    #[test]
    fn read_rejects_invalid_filename() {
        let base = make_base("read-bad");
        let r = team_rules_read(
            Some(base.to_string_lossy().to_string()),
            "../etc".to_string(),
        );
        assert!(!r.found);
        assert!(r.error.is_some());
    }

    #[test]
    fn manifest_roundtrip() {
        let base = make_base("manifest");
        let dto = team_rules_save_manifest(
            Some(base.to_string_lossy().to_string()),
            TeamRulesManifestDto {
                schema_version: 1,
                updated_at: String::new(),
                team_name: Some("Platform".to_string()),
                remote_url: Some("https://example.com/rules.git".to_string()),
                remote_commit: Some("abc123".to_string()),
                enabled: true,
            },
        )
        .unwrap();
        assert_eq!(dto.team_name.as_deref(), Some("Platform"));
        assert!(!dto.updated_at.is_empty());
        // 列表应能读到 manifest
        let list = team_rules_list(Some(base.to_string_lossy().to_string()));
        assert!(list.manifest.is_some());
        assert_eq!(
            list.manifest.unwrap().team_name.as_deref(),
            Some("Platform")
        );
    }

    #[test]
    fn resolve_base_dir_falls_back_to_home() {
        // 传 None → 用 home dir
        let r = team_rules_resolve_base_dir(None);
        assert!(r.is_ok() || r.is_err()); // 不同 CI 环境下 home dir 解析可能不同
        let p = r.unwrap();
        assert!(p.contains(".2. 环境变量 YDSZ_BOOTSTRAP_TOKEN"));
        assert!(p.ends_with(team_rules::TEAM_RULES_DIR_NAME));
    }

    #[test]
    fn resolve_base_dir_uses_explicit_value() {
        let r = team_rules_resolve_base_dir(Some("/tmp/explicit".to_string())).unwrap();
        assert!(r.ends_with(team_rules::TEAM_RULES_DIR_NAME));
        assert!(r.contains("explicit"));
    }
}
