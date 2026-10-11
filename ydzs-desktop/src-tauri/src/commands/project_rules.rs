//! # 项目规则加载命令
//!
//! 暴露 `project_rules_load` Tauri 命令供前端调用。
//!
//! ## 用法
//!
//! 前端在打开项目/线程时调用此命令,把返回的规则注入到 Composer / Provider turn
//! 的 system context。
//!
//! ## 性能
//!
//! - 单次扫描 < 5ms(空仓库)
//! - 单次扫描 < 50ms(典型 10k 文件仓库)
//! - 规则缓存 60 秒(避免同一项目重复 IO)

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;
use tracing::info;

use ydsz_code::project_rules::{ProjectRuleFile, ProjectRules, ProjectRulesLoader};
use ydsz_code::team_rules::TeamRulesLoader;

/// 缓存有效期 60 秒
const CACHE_TTL: Duration = Duration::from_secs(60);

/// 缓存条目
#[derive(Clone)]
struct CachedEntry {
    rules: ProjectRules,
    cached_at: Instant,
}

/// 项目规则缓存状态
#[derive(Default)]
pub struct ProjectRulesState {
    cache: Mutex<Option<(PathBuf, CachedEntry)>>,
}

impl ProjectRulesState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// 前端 DTO: 单个规则文件
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRuleFileDto {
    /// 来源标识字符串(AGENTS.md / CLAUDE.md / ...)
    pub source: String,
    /// 完整路径
    pub path: String,
    /// 文件内容
    pub content: String,
    /// 原始字节数
    pub original_bytes: usize,
    /// 是否被截断
    pub truncated: bool,
}

impl From<ProjectRuleFile> for ProjectRuleFileDto {
    fn from(f: ProjectRuleFile) -> Self {
        Self {
            source: f.source.as_str().to_string(),
            path: f.path.to_string_lossy().to_string(),
            content: f.content,
            original_bytes: f.original_bytes,
            truncated: f.truncated,
        }
    }
}

/// 前端 DTO: 加载结果
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRulesDto {
    /// 是否命中缓存
    pub from_cache: bool,
    /// 加载耗时(毫秒)
    pub elapsed_ms: u128,
    /// 规则文件列表
    pub files: Vec<ProjectRuleFileDto>,
    /// 合并后的 markdown(适合直接注入 Provider)
    /// - 含项目级规则 + (项目级 .ydsz/rules/ 为空时的) 团队规则兜底
    pub merged: Option<String>,
    /// 总字节数(项目级 + 兜底团队规则)
    pub total_bytes: usize,
    /// 跳过的文件数
    pub skipped: usize,
    /// 团队规则摘要(用于指示器展示与状态判断)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub team_rules: Option<TeamRulesSummaryDto>,
}

/// 前端 DTO: 团队规则摘要(只透传展示所需的元数据,files 留空)
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamRulesSummaryDto {
    /// 团队规则根目录绝对路径
    pub root: String,
    /// 文件数量
    pub file_count: usize,
    /// 总字节数
    pub total_bytes: usize,
    /// 是否启用(manifest.enabled = true)
    pub enabled: bool,
    /// 团队名称
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub team_name: Option<String>,
    /// 远程仓库地址
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub remote_url: Option<String>,
    /// 加载耗时
    pub elapsed_ms: u128,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

/// 项目规则加载参数
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRulesLoadParams {
    /// 项目根目录绝对路径
    pub workspace_root: String,
    /// 是否跳过缓存(默认 false)
    #[serde(default)]
    pub no_cache: bool,
}

/// 加载项目规则
///
/// 扫描 `workspace_root` 下的 AGENTS.md / CLAUDE.md / .ydsz/rules/ / .cursorrules / .windsurfrules
/// 等规则文件,返回聚合结果。同一项目 60 秒内重复调用命中内存缓存。
///
/// **P2-5 合并策略**:
/// 1. 项目级 `.ydsz/rules/`(含 `rules.md`)为空时,自动追加团队共享规则作为兜底
/// 2. 其他来源(AGENTS.md / CLAUDE.md 等)始终优先,不会追加团队规则
/// 3. `teamRules` 字段透传团队规则摘要(无论是否使用兜底)
#[tauri::command]
#[specta::specta]
pub async fn project_rules_load(
    state: State<'_, ProjectRulesState>,
    params: ProjectRulesLoadParams,
) -> Result<ProjectRulesDto, String> {
    let root = PathBuf::from(&params.workspace_root);
    let start = Instant::now();

    // 检查缓存
    if !params.no_cache {
        if let Ok(guard) = state.cache.lock() {
            if let Some((cached_root, entry)) = guard.as_ref() {
                if cached_root == &root && entry.cached_at.elapsed() < CACHE_TTL {
                    let elapsed = start.elapsed().as_millis();
                    info!(
                        workspace = %root.display(),
                        elapsed_ms = elapsed,
                        files = entry.rules.files.len(),
                        "命中项目规则缓存"
                    );
                    // 缓存命中时仍需重新探测团队规则摘要(团队规则改动无需重扫项目规则)
                    let (team_summary, team_elapsed) = load_team_rules_summary();
                    let mut dto = to_dto(entry.rules.clone(), true, elapsed);
                    dto.team_rules = team_summary;
                    dto.elapsed_ms = elapsed + team_elapsed;
                    return Ok(dto);
                }
            }
        }
    }

    info!(workspace = %root.display(), "扫描项目规则文件");

    let rules = ProjectRulesLoader::load(&root);
    let has_ydsz_rules = rules
        .files
        .iter()
        .any(|f| matches!(f.source, ydsz_code::project_rules::RuleSource::YdszRulesFile | ydsz_code::project_rules::RuleSource::YdszRulesDir));

    // 写缓存
    if let Ok(mut guard) = state.cache.lock() {
        *guard = Some((
            root.clone(),
            CachedEntry {
                rules: rules.clone(),
                cached_at: Instant::now(),
            },
        ));
    }

    let elapsed = start.elapsed().as_millis();

    // P2-5: 项目级 .ydsz/rules/ 为空时,加载团队规则作为兜底
    let (team_summary, team_elapsed, team_merged) = load_team_rules_with_merged();

    let mut merged = rules.merged_markdown();
    let mut total_bytes = rules.total_bytes();
    if !has_ydsz_rules {
        if let Some(team_md) = team_merged {
            // 拼接到项目规则之后
            merged = Some(match merged {
                Some(existing) => format!("{existing}\n{team_md}"),
                None => team_md,
            });
            // 累加团队规则字节(通过 team_summary.total_bytes)
            if let Some(ref s) = team_summary {
                total_bytes = total_bytes.saturating_add(s.total_bytes);
            }
        }
    }

    info!(
        workspace = %root.display(),
        elapsed_ms = elapsed,
        files = rules.files.len(),
        total_bytes,
        team_rules_used = !has_ydsz_rules,
        "项目规则加载完成"
    );

    let mut dto = to_dto_with_merged(rules, false, elapsed + team_elapsed, merged, total_bytes);
    dto.team_rules = team_summary;
    Ok(dto)
}

/// 加载团队规则摘要(仅元数据,无文件内容)
fn load_team_rules_summary() -> (Option<TeamRulesSummaryDto>, u128) {
    let start = Instant::now();
    let home = match dirs::home_dir() {
        Some(p) => p,
        None => {
            return (
                Some(TeamRulesSummaryDto {
                    root: String::new(),
                    file_count: 0,
                    total_bytes: 0,
                    enabled: false,
                    team_name: None,
                    remote_url: None,
                    elapsed_ms: start.elapsed().as_millis(),
                    error: Some("无法获取 home 目录".to_string()),
                }),
                start.elapsed().as_millis(),
            )
        }
    };
    let base = home.join(".2. 环境变量 YDSZ_BOOTSTRAP_TOKEN");
    let rules = TeamRulesLoader::load(&base);
    let summary = build_team_rules_summary(&rules, start.elapsed().as_millis());
    (summary, start.elapsed().as_millis())
}

/// 加载团队规则:同时返回 merged markdown 与摘要
fn load_team_rules_with_merged() -> (Option<TeamRulesSummaryDto>, u128, Option<String>) {
    let start = Instant::now();
    let home = match dirs::home_dir() {
        Some(p) => p,
        None => {
            return (
                Some(TeamRulesSummaryDto {
                    root: String::new(),
                    file_count: 0,
                    total_bytes: 0,
                    enabled: false,
                    team_name: None,
                    remote_url: None,
                    elapsed_ms: start.elapsed().as_millis(),
                    error: Some("无法获取 home 目录".to_string()),
                }),
                start.elapsed().as_millis(),
                None,
            )
        }
    };
    let base = home.join(".2. 环境变量 YDSZ_BOOTSTRAP_TOKEN");
    let rules = TeamRulesLoader::load(&base);
    let elapsed = start.elapsed().as_millis();
    let summary = build_team_rules_summary(&rules, elapsed);
    let merged = rules.merged_markdown();
    (summary, elapsed, merged)
}

/// 把 TeamRules 转成前端摘要(避免重复字段)
fn build_team_rules_summary(rules: &ydsz_code::team_rules::TeamRules, elapsed_ms: u128) -> Option<TeamRulesSummaryDto> {
    let root = rules.root.as_ref()?.to_string_lossy().to_string();
    // 错误(目录不可读等) 或 manifest 显式禁用 → 视为 disabled
    let enabled = rules.error.is_none()
        && rules
            .manifest
            .as_ref()
            .map(|m| m.enabled)
            .unwrap_or(true);
    let team_name = rules.manifest.as_ref().and_then(|m| m.team_name.clone());
    let remote_url = rules.manifest.as_ref().and_then(|m| m.remote_url.clone());
    Some(TeamRulesSummaryDto {
        root,
        file_count: rules.files.len(),
        total_bytes: rules.total_bytes(),
        enabled,
        team_name,
        remote_url,
        elapsed_ms,
        error: rules.error.clone(),
    })
}

fn to_dto(rules: ProjectRules, from_cache: bool, elapsed_ms: u128) -> ProjectRulesDto {
    let total_bytes = rules.total_bytes();
    let merged = rules.merged_markdown();
    let files: Vec<ProjectRuleFileDto> = rules.files.into_iter().map(Into::into).collect();
    let skipped = files.len(); // 当前未实现截断外的"跳过"
    ProjectRulesDto {
        from_cache,
        elapsed_ms,
        files,
        merged,
        total_bytes,
        skipped,
        team_rules: None,
    }
}

fn to_dto_with_merged(
    rules: ProjectRules,
    from_cache: bool,
    elapsed_ms: u128,
    merged: Option<String>,
    total_bytes: usize,
) -> ProjectRulesDto {
    let files: Vec<ProjectRuleFileDto> = rules.files.into_iter().map(Into::into).collect();
    let skipped = files.len();
    ProjectRulesDto {
        from_cache,
        elapsed_ms,
        files,
        merged,
        total_bytes,
        skipped,
        team_rules: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn cache_state_default_is_empty() {
        let state = ProjectRulesState::default();
        assert!(state.cache.lock().unwrap().is_none());
    }

    #[test]
    fn dto_conversion_preserves_fields() {
        let file = ProjectRuleFile {
            source: ydsz_code::project_rules::RuleSource::AgentsMd,
            path: PathBuf::from("/tmp/AGENTS.md"),
            content: "hello".into(),
            original_bytes: 5,
            truncated: false,
        };
        let dto: ProjectRuleFileDto = file.into();
        assert_eq!(dto.source, "AGENTS.md");
        assert_eq!(dto.path, "/tmp/AGENTS.md");
        assert_eq!(dto.content, "hello");
        assert_eq!(dto.original_bytes, 5);
        assert!(!dto.truncated);
    }

    #[test]
    fn to_dto_includes_merged_when_files_present() {
        let rules = ProjectRules {
            files: vec![ProjectRuleFile {
                source: ydsz_code::project_rules::RuleSource::AgentsMd,
                path: PathBuf::from("AGENTS.md"),
                content: "rule A".into(),
                original_bytes: 6,
                truncated: false,
            }],
            skipped: 0,
        };
        let dto = to_dto(rules, false, 5);
        assert_eq!(dto.files.len(), 1);
        assert!(dto.merged.is_some());
        assert!(dto.merged.unwrap().contains("rule A"));
        assert!(!dto.from_cache);
        assert_eq!(dto.elapsed_ms, 5);
    }

    #[test]
    fn to_dto_returns_none_merged_when_empty() {
        let rules = ProjectRules::default();
        let dto = to_dto(rules, true, 1);
        assert!(dto.merged.is_none());
        assert!(dto.from_cache);
    }

    #[test]
    fn integration_load_real_files() {
        let dir = std::env::temp_dir().join(format!(
            "ydsz-rules-cmd-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("AGENTS.md"), "use 中文").unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        assert_eq!(rules.files.len(), 1);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn build_team_rules_summary_returns_none_when_no_root() {
        // 临时设置 HOME 到空目录,确保 team-rules 不存在
        let _saved_home = std::env::var_os("HOME");
        let tmp = std::env::temp_dir().join(format!(
            "ydsz-team-summary-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&tmp).unwrap();
        std::env::set_var("HOME", &tmp);
        let rules = TeamRulesLoader::load(&tmp);
        let summary = build_team_rules_summary(&rules, 0);
        // 没有 team-rules 子目录,应返回 None
        assert!(summary.is_none());
        // 还原 HOME
        if let Some(h) = _saved_home {
            std::env::set_var("HOME", h);
        } else {
            std::env::remove_var("HOME");
        }
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn build_team_rules_summary_includes_metadata() {
        let tmp = std::env::temp_dir().join(format!(
            "ydsz-team-summary-test-{}",
            uuid::Uuid::new_v4()
        ));
        let team = tmp.join("team-rules");
        fs::create_dir_all(&team).unwrap();
        fs::write(team.join("rule.md"), "x").unwrap();
        let manifest = ydsz_code::team_rules::TeamRulesManifest {
            team_name: Some("Platform".to_string()),
            remote_url: Some("git@x:y.git".to_string()),
            ..Default::default()
        };
        ydsz_code::team_rules::write_manifest(&team, &manifest).unwrap();
        let rules = TeamRulesLoader::load(&tmp);
        let summary = build_team_rules_summary(&rules, 7).expect("not none");
        assert!(summary.enabled);
        assert_eq!(summary.file_count, 1);
        assert_eq!(summary.total_bytes, 1);
        assert_eq!(summary.elapsed_ms, 7);
        assert_eq!(summary.team_name.as_deref(), Some("Platform"));
        assert_eq!(summary.remote_url.as_deref(), Some("git@x:y.git"));
        assert!(summary.error.is_none());
        assert!(summary.root.ends_with("team-rules"));
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn build_team_rules_summary_propagates_error() {
        // 构造 team-rules 存在但不是目录的场景:用文件占位
        let tmp = std::env::temp_dir().join(format!(
            "ydsz-team-summary-error-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&tmp).unwrap();
        // 把 team-rules 创建为文件而非目录
        fs::write(tmp.join("team-rules"), b"not a directory").unwrap();
        let rules = TeamRulesLoader::load(&tmp);
        let summary = build_team_rules_summary(&rules, 0).expect("not none");
        assert!(!summary.enabled);
        assert!(summary.error.is_some());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn to_dto_with_merged_preserves_team_rules_none() {
        let rules = ProjectRules {
            files: vec![ProjectRuleFile {
                source: ydsz_code::project_rules::RuleSource::AgentsMd,
                path: PathBuf::from("AGENTS.md"),
                content: "rule".into(),
                original_bytes: 4,
                truncated: false,
            }],
            skipped: 0,
        };
        let dto = to_dto_with_merged(rules, false, 5, Some("merged".to_string()), 4);
        assert!(dto.merged.is_some());
        assert_eq!(dto.total_bytes, 4);
        assert!(dto.team_rules.is_none());
    }
}
