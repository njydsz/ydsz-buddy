//! # 项目规则加载器
//!
//! 扫描项目根目录下的"AI 协作规则文件",聚合成可注入到 Composer / Provider turn
//! 的统一 markdown 上下文。
//!
//! ## 支持的规则文件
//!
//! 按优先级(先匹配先用)扫描以下文件:
//!
//! | 文件名 | 起源 | 备注 |
//! |--------|------|------|
//! | `AGENTS.md` | Codex / OpenAI / Cursor / Gemini CLI **行业事实标准** | 首选 |
//! | `CLAUDE.md` | Claude Code | 与 AGENTS.md 等价 |
//! | `.ydsz/rules.md` | ydsz-buddy | 自家规范,支持多文件聚合 |
//! | `.codex/instructions.md` | Codex 备选 | 优先级低于根目录 AGENTS.md |
//! | `.cursorrules` | Cursor | 无扩展名纯文本 |
//! | `.windsurfrules` | Windsurf | 无扩展名纯文本 |
//!
//! ## 大小与深度
//!
//! - 单文件上限 32 KiB(对齐 Codex `project_doc_max_bytes` 默认值)
//! - 聚合总大小上限 128 KiB
//! - `.ydsz/rules/` 目录递归最多 3 层
//! - 单次加载最多 8 个文件(防止 turn 过大)
//!
//! ## 行为
//!
//! - 文件不存在 → 静默跳过,不抛错
//! - 文件存在但内容超限 → 截断并标注 `[truncated]`
//! - `.ydsz/rules/` 下的多个文件按文件名升序聚合,带 `## <name>` 标题
//!
//! ## 用法
//!
//! ```no_run
//! use ydsz_code::project_rules::ProjectRulesLoader;
//! use std::path::Path;
//!
//! let rules = ProjectRulesLoader::load(Path::new("."));
//! for r in &rules.files {
//!     println!("{} ({} bytes) -> {}", r.source, r.content.len(), r.path.display());
//! }
//! if let Some(merged) = rules.merged_markdown() {
//!     // 注入到 Provider turn 作为 system context
//! }
//! ```

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

/// 单文件 32 KiB 上限(对齐 Codex `project_doc_max_bytes` 默认)
pub const MAX_FILE_BYTES: usize = 32 * 1024;

/// 聚合总大小 128 KiB 上限
pub const MAX_TOTAL_BYTES: usize = 128 * 1024;

/// `.ydsz/rules/` 递归深度上限
pub const MAX_RECURSION_DEPTH: usize = 3;

/// 单次加载文件数量上限
pub const MAX_FILES: usize = 8;

/// 规则来源标识
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuleSource {
    /// AGENTS.md(Codex 行业标准)
    AgentsMd,
    /// CLAUDE.md(Claude Code 等价)
    ClaudeMd,
    /// .ydsz/rules.md(云顶数字 自家单文件)
    YdszRulesFile,
    /// .ydsz/rules/*.md(云顶数字 自家目录)
    YdszRulesDir,
    /// .codex/instructions.md(Codex 备选)
    CodexInstructions,
    /// .cursorrules(Cursor 兼容)
    CursorRules,
    /// .windsurfrules(Windsurf 兼容)
    WindsurfRules,
}

impl RuleSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AgentsMd => "AGENTS.md",
            Self::ClaudeMd => "CLAUDE.md",
            Self::YdszRulesFile => ".ydsz/rules.md",
            Self::YdszRulesDir => ".ydsz/rules/",
            Self::CodexInstructions => ".codex/instructions.md",
            Self::CursorRules => ".cursorrules",
            Self::WindsurfRules => ".windsurfrules",
        }
    }

    /// 优先级(数字越小越高)
    fn priority(self) -> u8 {
        match self {
            Self::AgentsMd => 0,
            Self::ClaudeMd => 1,
            Self::YdszRulesFile | Self::YdszRulesDir => 2,
            Self::CodexInstructions => 3,
            Self::CursorRules => 4,
            Self::WindsurfRules => 5,
        }
    }
}

impl std::fmt::Display for RuleSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// 单个加载到的规则文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRuleFile {
    /// 来源类型
    pub source: RuleSource,
    /// 文件绝对或相对路径
    pub path: PathBuf,
    /// 文件内容(可能已截断)
    pub content: String,
    /// 原始字节数(截断前)
    pub original_bytes: usize,
    /// 是否被截断
    pub truncated: bool,
}

/// 项目规则加载结果
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectRules {
    /// 加载到的文件(按优先级 + 路径排序)
    pub files: Vec<ProjectRuleFile>,
    /// 跳过的文件数(超上限后被丢弃)
    pub skipped: usize,
}

impl ProjectRules {
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// 合并所有文件为单一 markdown,带"## <源名>" 标题分隔。
    /// 适合直接注入 Provider turn 的 system message。
    pub fn merged_markdown(&self) -> Option<String> {
        if self.files.is_empty() {
            return None;
        }
        let mut out = String::new();
        out.push_str("# Project Rules\n\n");
        out.push_str("以下规则由项目根目录自动加载,请严格遵守。\n\n");
        for f in &self.files {
            out.push_str(&format!("## {}\n\n", f.source.as_str()));
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

    /// 聚合大小
    pub fn total_bytes(&self) -> usize {
        self.files.iter().map(|f| f.content.len()).sum()
    }
}

/// 项目规则加载器
pub struct ProjectRulesLoader;

impl ProjectRulesLoader {
    /// 扫描项目根目录,加载所有支持的规则文件。
    ///
    /// # 参数
    ///
    /// - `workspace_root`: 项目根目录(不存在不会报错,返回空 `ProjectRules`)
    pub fn load(workspace_root: &Path) -> ProjectRules {
        let mut files: Vec<ProjectRuleFile> = Vec::new();
        let mut total: usize = 0;

        if !workspace_root.exists() || !workspace_root.is_dir() {
            return ProjectRules::default();
        }

        // 1. AGENTS.md(首选)
        Self::try_load_file(
            workspace_root,
            "AGENTS.md",
            RuleSource::AgentsMd,
            &mut files,
            &mut total,
        );

        // 2. CLAUDE.md
        Self::try_load_file(
            workspace_root,
            "CLAUDE.md",
            RuleSource::ClaudeMd,
            &mut files,
            &mut total,
        );

        // 3. .ydsz/rules.md(单文件)
        Self::try_load_file(
            workspace_root,
            ".ydsz/rules.md",
            RuleSource::YdszRulesFile,
            &mut files,
            &mut total,
        );

        // 4. .ydsz/rules/*.md(目录聚合)
        if files.len() < MAX_FILES {
            Self::try_load_rules_dir(
                workspace_root,
                &PathBuf::from(".ydsz/rules"),
                RuleSource::YdszRulesDir,
                &mut files,
                &mut total,
            );
        }

        // 5. .codex/instructions.md
        Self::try_load_file(
            workspace_root,
            ".codex/instructions.md",
            RuleSource::CodexInstructions,
            &mut files,
            &mut total,
        );

        // 6. .cursorrules
        Self::try_load_file(
            workspace_root,
            ".cursorrules",
            RuleSource::CursorRules,
            &mut files,
            &mut total,
        );

        // 7. .windsurfrules
        Self::try_load_file(
            workspace_root,
            ".windsurfrules",
            RuleSource::WindsurfRules,
            &mut files,
            &mut total,
        );

        // 按优先级排序
        files.sort_by_key(|f| (f.source.priority(), f.path.display().to_string()));

        let skipped = 0;
        ProjectRules { files, skipped }
    }

    fn try_load_file(
        root: &Path,
        rel: &str,
        source: RuleSource,
        files: &mut Vec<ProjectRuleFile>,
        total: &mut usize,
    ) {
        if files.len() >= MAX_FILES || *total >= MAX_TOTAL_BYTES {
            return;
        }
        let path = root.join(rel);
        let Ok(content) = std::fs::read_to_string(&path) else {
            return;
        };
        let original = content.len();
        let (content, truncated) = if original > MAX_FILE_BYTES {
            // 安全截断到最近的 UTF-8 char 边界
            let mut end = MAX_FILE_BYTES;
            while end > 0 && !content.is_char_boundary(end) {
                end -= 1;
            }
            (content[..end].to_string(), true)
        } else {
            (content, false)
        };
        *total += content.len();
        files.push(ProjectRuleFile {
            source,
            path,
            content,
            original_bytes: original,
            truncated,
        });
    }

    fn try_load_rules_dir(
        root: &Path,
        rel: &Path,
        source: RuleSource,
        files: &mut Vec<ProjectRuleFile>,
        total: &mut usize,
    ) {
        let dir = root.join(rel);
        if !dir.is_dir() {
            return;
        }

        // 收集 .md 文件,按文件名升序
        let mut entries: Vec<PathBuf> = WalkDir::new(&dir)
            .max_depth(MAX_RECURSION_DEPTH)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
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
            if files.len() >= MAX_FILES || *total >= MAX_TOTAL_BYTES {
                break;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
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
            *total += content.len();
            files.push(ProjectRuleFile {
                source,
                path,
                content,
                original_bytes: original,
                truncated,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_workspace(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ydsz-rules-test-{}-{}", tag, uuid::Uuid::new_v4()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn empty_workspace_returns_empty() {
        let dir = make_workspace("empty");
        let rules = ProjectRulesLoader::load(&dir);
        assert!(rules.is_empty());
        assert!(rules.merged_markdown().is_none());
    }

    #[test]
    fn nonexistent_workspace_returns_empty() {
        let dir = std::env::temp_dir().join("ydsz-rules-nonexistent-xyz-does-not-exist");
        let _ = fs::remove_dir_all(&dir);
        let rules = ProjectRulesLoader::load(&dir);
        assert!(rules.is_empty());
    }

    #[test]
    fn loads_agents_md() {
        let dir = make_workspace("agents");
        fs::write(
            dir.join("AGENTS.md"),
            "# Project Rules\n- 总是用中文回复\n- 不要修改 src/db/",
        )
        .unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        assert_eq!(rules.files.len(), 1);
        assert_eq!(rules.files[0].source, RuleSource::AgentsMd);
        assert!(rules.files[0].content.contains("中文"));
        assert!(!rules.files[0].truncated);
    }

    #[test]
    fn priority_order_agents_then_claude() {
        let dir = make_workspace("order");
        fs::write(dir.join("AGENTS.md"), "from agents").unwrap();
        fs::write(dir.join("CLAUDE.md"), "from claude").unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        assert_eq!(rules.files.len(), 2);
        assert_eq!(rules.files[0].source, RuleSource::AgentsMd);
        assert_eq!(rules.files[1].source, RuleSource::ClaudeMd);
    }

    #[test]
    fn loads_ydsz_rules_directory() {
        let dir = make_workspace("ydszdir");
        let rules_dir = dir.join(".ydsz").join("rules");
        fs::create_dir_all(&rules_dir).unwrap();
        fs::write(rules_dir.join("01-style.md"), "use tabs").unwrap();
        fs::write(rules_dir.join("02-test.md"), "always test").unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        // 应该有 2 个 .ydsz/rules/*.md 文件
        let ydsz_files: Vec<_> = rules
            .files
            .iter()
            .filter(|f| f.source == RuleSource::YdszRulesDir)
            .collect();
        assert_eq!(ydsz_files.len(), 2);
        // 排序: 01-style.md 排在 02-test.md 前
        assert!(ydsz_files[0].path.ends_with("01-style.md"));
        assert!(ydsz_files[1].path.ends_with("02-test.md"));
    }

    #[test]
    fn loads_cursor_and_windsurf_files() {
        let dir = make_workspace("cw");
        fs::write(dir.join(".cursorrules"), "cursor rules").unwrap();
        fs::write(dir.join(".windsurfrules"), "windsurf rules").unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        assert_eq!(rules.files.len(), 2);
        assert!(rules
            .files
            .iter()
            .any(|f| f.source == RuleSource::CursorRules));
        assert!(rules
            .files
            .iter()
            .any(|f| f.source == RuleSource::WindsurfRules));
    }

    #[test]
    fn truncates_oversized_file() {
        let dir = make_workspace("big");
        let big = "x".repeat(MAX_FILE_BYTES + 1000);
        fs::write(dir.join("AGENTS.md"), &big).unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        assert_eq!(rules.files.len(), 1);
        assert!(rules.files[0].truncated);
        assert!(rules.files[0].content.len() <= MAX_FILE_BYTES);
        assert_eq!(rules.files[0].original_bytes, big.len());
    }

    #[test]
    fn merged_markdown_includes_all_files() {
        let dir = make_workspace("merged");
        fs::write(dir.join("AGENTS.md"), "rule A").unwrap();
        fs::write(dir.join("CLAUDE.md"), "rule B").unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        let md = rules.merged_markdown().expect("not empty");
        assert!(md.contains("rule A"));
        assert!(md.contains("rule B"));
        assert!(md.contains("## AGENTS.md"));
        assert!(md.contains("## CLAUDE.md"));
    }

    #[test]
    fn handles_non_utf8_boundary_safely() {
        let dir = make_workspace("utf8");
        // 写入 4 字节中文,截断位置在中间不应 panic
        let content: String = "中".repeat(MAX_FILE_BYTES + 100);
        fs::write(dir.join("AGENTS.md"), &content).unwrap();
        let rules = ProjectRulesLoader::load(&dir);
        assert!(!rules.is_empty());
        assert!(rules.files[0].truncated);
    }
}
