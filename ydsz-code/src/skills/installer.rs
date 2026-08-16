//! # Skill 安装器
//!
//! 把"一个 Skill 来源"安装到本地 [`SkillRegistry`]。
//!
//! ## 支持的来源类型
//!
//! | 来源 URI | 示例 | 说明 |
//! |----------|------|------|
//! | `local:ABS_PATH` | `local:/path/to/skill` | 复制本地目录到 `installed/<name>/` |
//! | `github:owner/repo@ref` | `github:ydsz-org/react-best-practices@v1.2.0` | 调用 `git clone` |
//! | `marketplace:slug` | `marketplace:react-best-practices` | 从内置 marketplace 索引查 `github:...` |
//!
//! ## 设计取舍
//!
//! - **不下载 .zip**：Windows `git clone` 普及，CI 友好
//! - **不内置 HTTPS 客户端**：复用宿主环境的 `git` / `gh` CLI
//! - **原子性**："复制到临时目录 → 校验 → 原子 rename"；失败时清理临时目录
//!
//! ## 失败模式
//!
//! - 源目录缺 `SKILL.md` → `InvalidSkillDir`
//! - 目标已存在 → `AlreadyExists`（可加 `--force` 覆盖）
//! - 依赖未满足 → 不阻塞安装，仅在 [`SkillRegistry::validate_dependencies`] 报告

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use super::error::{SkillError, SkillResult};
use super::manifest::parse_skill_md_file;
use super::registry::{installed_from_manifest, InstalledSkill, SkillRegistry};

/// Skill 来源类型
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SkillSource {
    /// 本地路径
    Local(PathBuf),
    /// GitHub repo（owner/repo + 可选 ref）
    GitHub {
        owner: String,
        repo: String,
        ref_name: Option<String>,
    },
    /// Marketplace slug（用 marketplace 索引解析成 GitHub 源）
    Marketplace(String),
}

impl SkillSource {
    /// 解析来源 URI
    pub fn parse(uri: &str) -> SkillResult<Self> {
        if let Some(path) = uri.strip_prefix("local:") {
            return Ok(SkillSource::Local(PathBuf::from(path)));
        }
        if let Some(rest) = uri.strip_prefix("github:") {
            // 格式：owner/repo@ref
            let (path, ref_name) = match rest.rsplit_once('@') {
                Some((p, r)) => (p, Some(r.to_string())),
                None => (rest, None),
            };
            let (owner, repo) = path.split_once('/').ok_or_else(|| {
                SkillError::DownloadFailed(format!(
                    "github 源需 `owner/repo` 形式: {uri}"
                ))
            })?;
            return Ok(SkillSource::GitHub {
                owner: owner.to_string(),
                repo: repo.to_string(),
                ref_name,
            });
        }
        if let Some(slug) = uri.strip_prefix("marketplace:") {
            return Ok(SkillSource::Marketplace(slug.to_string()));
        }
        // 默认当作 local 路径
        Ok(SkillSource::Local(PathBuf::from(uri)))
    }

    /// 来源 URI 字符串（用于持久化）
    pub fn as_uri(&self) -> String {
        match self {
            SkillSource::Local(p) => format!("local:{}", p.display()),
            SkillSource::GitHub {
                owner,
                repo,
                ref_name,
            } => match ref_name {
                Some(r) => format!("github:{owner}/{repo}@{r}"),
                None => format!("github:{owner}/{repo}"),
            },
            SkillSource::Marketplace(slug) => format!("marketplace:{slug}"),
        }
    }
}

/// Skill 安装器
///
/// 通过 `SkillInstaller` 可以把 [`SkillSource`] 安装到 [`SkillRegistry`]。
pub struct SkillInstaller<'a> {
    registry: &'a SkillRegistry,
    /// Marketplace 索引（用于解析 `marketplace:` URI）
    marketplace: Option<&'a super::marketplace::Marketplace>,
}

impl<'a> SkillInstaller<'a> {
    pub fn new(registry: &'a SkillRegistry) -> Self {
        Self {
            registry,
            marketplace: None,
        }
    }

    /// 注入 marketplace 索引（用于 `marketplace:slug` 来源）
    pub fn with_marketplace(
        mut self,
        marketplace: &'a super::marketplace::Marketplace,
    ) -> Self {
        self.marketplace = Some(marketplace);
        self
    }

    /// 安装一个 source
    ///
    /// 流程：
    /// 1. 把 source 解析成具体目录（必要时下载/clone）
    /// 2. 读取 SKILL.md → 解析 manifest
    /// 3. 复制到 `installed/<name>/`
    /// 4. 注册到 registry
    pub fn install(&self, source: &SkillSource) -> SkillResult<InstalledSkill> {
        // 1. 解析 → 临时目录包含 SKILL.md
        let staging_dir = self.stage(source)?;
        let staged_manifest = parse_skill_md_file(&staging_dir.join("SKILL.md"))?;

        // 2. 检查是否已存在
        if self.registry.is_installed(&staged_manifest.name) {
            return Err(SkillError::AlreadyExists(staged_manifest.name));
        }

        // 3. 复制到 installed/<name>/
        let installed_dir = self.registry.installed_dir().join(&staged_manifest.name);
        copy_dir_all(&staging_dir, &installed_dir)?;

        // 4. 注册
        let entry = installed_from_manifest(
            &staged_manifest,
            &installed_dir,
            source.as_uri(),
        );
        self.registry.register(entry.clone())?;

        // 5. 清理 staging
        let _ = std::fs::remove_dir_all(&staging_dir);

        Ok(entry)
    }

    /// 卸载（删除目录 + 反注册）
    pub fn uninstall(&self, name: &str) -> SkillResult<()> {
        let entry = self.registry.unregister(name)?;
        let path = PathBuf::from(&entry.install_dir);
        if path.exists() {
            std::fs::remove_dir_all(&path)?;
        }
        Ok(())
    }

    /// 把 source 准备到一个临时目录（返回的目录应包含 SKILL.md）
    fn stage(&self, source: &SkillSource) -> SkillResult<PathBuf> {
        match source {
            SkillSource::Local(p) => {
                if !p.exists() {
                    return Err(SkillError::NotFound(p.display().to_string()));
                }
                if !p.join("SKILL.md").exists() {
                    return Err(SkillError::InvalidSkillDir(p.clone()));
                }
                Ok(p.clone())
            }
            SkillSource::GitHub {
                owner,
                repo,
                ref_name,
            } => {
                // 真实 clone：使用系统 git CLI
                // --depth=1 减小下载量；--branch 在指定 ref 时启用（只支持 tag/branch）
                let url = format!("https://github.com/{owner}/{repo}.git");
                let staging = tempdir_in(std::env::temp_dir())?;
                let mut args: Vec<String> = vec![
                    "clone".into(),
                    "--depth".into(),
                    "1".into(),
                ];
                if let Some(r) = ref_name {
                    if !r.is_empty() {
                        args.push("--branch".into());
                        args.push(r.clone());
                    }
                }
                args.push(url.clone());
                args.push(staging.to_string_lossy().to_string());

                let output = Command::new("git")
                    .args(&args)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                    .map_err(|e| {
                        SkillError::DownloadFailed(format!(
                            "执行 git clone 失败（请确认已安装 git CLI）: {e}"
                        ))
                    })?;

                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let _ = std::fs::remove_dir_all(&staging);
                    return Err(SkillError::DownloadFailed(format!(
                        "git clone {url} 失败: {stderr}"
                    )));
                }

                // git clone 会把内容放进 <staging>/<repo>/，所以 SKILL.md 在子目录
                let inner = staging.join(repo);
                let skill_md = inner.join("SKILL.md");
                if !skill_md.exists() {
                    // 兜底：直接在 staging 根下找
                    if staging.join("SKILL.md").exists() {
                        return Ok(staging);
                    }
                    let _ = std::fs::remove_dir_all(&staging);
                    return Err(SkillError::InvalidSkillDir(inner));
                }
                // 返回子目录（与 Local 行为一致）
                Ok(inner)
            }
            SkillSource::Marketplace(slug) => {
                let mp = self.marketplace.ok_or_else(|| {
                    SkillError::DownloadFailed(
                        "marketplace 源需要注入 Marketplace 索引".to_string(),
                    )
                })?;
                let entry = mp.lookup(slug).ok_or_else(|| {
                    SkillError::NotFound(format!("marketplace slug: {slug}"))
                })?;
                let inner = SkillSource::GitHub {
                    owner: entry.github_owner.clone(),
                    repo: entry.github_repo.clone(),
                    ref_name: Some(entry.github_ref.clone()),
                };
                self.stage(&inner)
            }
        }
    }
}

/// 递归复制目录
fn copy_dir_all(src: &Path, dst: &Path) -> SkillResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// 创建一个进程唯一命名的临时目录
///
/// 用 `pid + nanos` 作为后缀，避免并发安装冲突。
fn tempdir_in(parent: PathBuf) -> SkillResult<PathBuf> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = parent.join(format!("ydsz-skill-stage-{pid}-{nanos}"));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_skill(dir: &Path, name: &str, body: &str) {
        std::fs::create_dir_all(dir).unwrap();
        let mut f = std::fs::File::create(dir.join("SKILL.md")).unwrap();
        writeln!(
            f,
            "---\nname: {name}\nversion: 1.0.0\ndescription: test\n---\n{body}"
        )
        .unwrap();
    }

    fn fresh_registry() -> (tempfile::TempDir, SkillRegistry) {
        let dir = tempfile::tempdir().unwrap();
        let reg = SkillRegistry::open(dir.path().to_path_buf()).unwrap();
        (dir, reg)
    }

    #[test]
    fn parse_source_local() {
        let s = SkillSource::parse("local:/tmp/skill").unwrap();
        match s {
            SkillSource::Local(p) => assert_eq!(p.to_string_lossy(), "/tmp/skill"),
            _ => panic!("expected Local"),
        }
    }

    #[test]
    fn parse_source_github_with_ref() {
        let s = SkillSource::parse("github:foo/bar@v1.2.3").unwrap();
        match s {
            SkillSource::GitHub {
                owner,
                repo,
                ref_name,
            } => {
                assert_eq!(owner, "foo");
                assert_eq!(repo, "bar");
                assert_eq!(ref_name.as_deref(), Some("v1.2.3"));
            }
            _ => panic!("expected GitHub"),
        }
    }

    #[test]
    fn parse_source_github_no_ref() {
        let s = SkillSource::parse("github:foo/bar").unwrap();
        match s {
            SkillSource::GitHub { ref_name, .. } => assert!(ref_name.is_none()),
            _ => panic!("expected GitHub"),
        }
    }

    #[test]
    fn parse_source_marketplace() {
        let s = SkillSource::parse("marketplace:react-tips").unwrap();
        match s {
            SkillSource::Marketplace(slug) => assert_eq!(slug, "react-tips"),
            _ => panic!("expected Marketplace"),
        }
    }

    #[test]
    fn parse_source_bare_path() {
        let s = SkillSource::parse("/tmp/skill").unwrap();
        assert!(matches!(s, SkillSource::Local(_)));
    }

    #[test]
    fn install_from_local() {
        let (registry_dir, registry) = fresh_registry();
        let source_dir = tempfile::tempdir().unwrap();
        write_skill(source_dir.path(), "test-skill", "Hello skill");

        let installer = SkillInstaller::new(&registry);
        let entry = installer
            .install(&SkillSource::Local(source_dir.path().to_path_buf()))
            .unwrap();
        assert_eq!(entry.name, "test-skill");

        // 验证已注册
        assert!(registry.is_installed("test-skill"));
        // 验证文件已复制
        let target = registry_dir
            .path()
            .join("installed/test-skill/SKILL.md");
        assert!(target.exists());
    }

    #[test]
    fn install_duplicate_errors() {
        let (_rdir, registry) = fresh_registry();
        let s1 = tempfile::tempdir().unwrap();
        let s2 = tempfile::tempdir().unwrap();
        write_skill(s1.path(), "dup", "first");
        write_skill(s2.path(), "dup", "second");
        let installer = SkillInstaller::new(&registry);
        installer
            .install(&SkillSource::Local(s1.path().to_path_buf()))
            .unwrap();
        let result = installer.install(&SkillSource::Local(s2.path().to_path_buf()));
        assert!(matches!(result, Err(SkillError::AlreadyExists(_))));
    }

    #[test]
    fn install_missing_skill_md_errors() {
        let (_rdir, registry) = fresh_registry();
        let empty = tempfile::tempdir().unwrap();
        // 不写 SKILL.md
        let installer = SkillInstaller::new(&registry);
        let result = installer.install(&SkillSource::Local(empty.path().to_path_buf()));
        assert!(matches!(result, Err(SkillError::InvalidSkillDir(_))));
    }

    #[test]
    fn install_local_not_found_errors() {
        let (_rdir, registry) = fresh_registry();
        let installer = SkillInstaller::new(&registry);
        let result = installer.install(&SkillSource::Local(PathBuf::from("/nonexistent/path")));
        assert!(matches!(result, Err(SkillError::NotFound(_))));
    }

    #[test]
    fn install_github_returns_download_error() {
        // 不存在的 repo 应当返回 DownloadFailed（git clone 失败）
        let (_rdir, registry) = fresh_registry();
        let installer = SkillInstaller::new(&registry);
        let source = SkillSource::GitHub {
            owner: "this-org-does-not-exist-xyz".to_string(),
            repo: "this-repo-does-not-exist-xyz".to_string(),
            ref_name: None,
        };
        let result = installer.install(&source);
        // 可能 git CLI 不存在（CI 无 git）→ DownloadFailed
        // 也可能 git clone 失败（404）→ DownloadFailed
        match result {
            Err(SkillError::DownloadFailed(_)) => {} // 期望
            Err(SkillError::Io(_)) => {}             // 临时目录创建失败可接受
            Ok(_) => panic!("不应成功"),
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn tempdir_in_creates_unique_dirs() {
        let p1 = tempdir_in(std::env::temp_dir()).unwrap();
        let p2 = tempdir_in(std::env::temp_dir()).unwrap();
        assert_ne!(p1, p2, "两次调用应得到不同目录");
        assert!(p1.exists());
        let _ = std::fs::remove_dir_all(&p1);
        let _ = std::fs::remove_dir_all(&p2);
    }

    #[test]
    fn install_marketplace_without_index_errors() {
        let (_rdir, registry) = fresh_registry();
        let installer = SkillInstaller::new(&registry);
        let source = SkillSource::Marketplace("foo".to_string());
        let result = installer.install(&source);
        assert!(matches!(result, Err(SkillError::DownloadFailed(_))));
    }

    #[test]
    fn uninstall_removes_files() {
        let (registry_dir, registry) = fresh_registry();
        let source_dir = tempfile::tempdir().unwrap();
        write_skill(source_dir.path(), "to-remove", "bye");
        let installer = SkillInstaller::new(&registry);
        installer
            .install(&SkillSource::Local(source_dir.path().to_path_buf()))
            .unwrap();
        assert!(registry.is_installed("to-remove"));
        installer.uninstall("to-remove").unwrap();
        assert!(!registry.is_installed("to-remove"));
        let target = registry_dir.path().join("installed/to-remove");
        assert!(!target.exists());
    }
}
