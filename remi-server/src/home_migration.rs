//! # Home 目录迁移
//!
//! 在 Remi Claw 第一次启动时，将用户在其他工具（Peak Code / Codex / Claude Code / OpenCode）下
//! 积累的全局配置、Session 历史、模型选择等数据迁移到 Remi 自己的 home 目录。
//!
//! ## 迁移策略
//!
//! - **幂等**：每个迁移 step 通过 `state.json` 记录是否完成，多次启动不会重复执行
//! - **保守**：只读源目录，写入目标目录，绝不修改源数据
//! - **降级**：源目录不存在 / 权限不足 / 数据格式不识别时，记 warning 并跳过
//!
//! ## 支持的源
//!
//! | 来源 | 路径 | 内容 |
//! | --- | --- | --- |
//! | Peak Code | `~/.peakcode/` | sessions、preferences、auth |
//! | Codex CLI | `~/.codex/` | config.toml、history.jsonl、auth.json |
//! | Claude Code | `~/.claude/` | settings.json、history、mcp |
//! | OpenCode | `~/.opencode/` | config、sessions |
//!
//! ## 使用场景
//!
//! - 新用户首次打开 Remi 时自动调用 `migrate_home()` 把已有数据拉过来
//! - 用户切换设备后通过 CLI `remi-cli import-home <path>` 手动触发
//!
//! ## 架构
//!
//! ```text
//!  src_dirs (Peak/Codex/Claude/OpenCode)
//!        │
//!        ▼
//!  HomeMigrator ── step: each source
//!        │
//!        ▼
//!  dest_dir: <RemiHome>/imported/<source>/
//!        │
//!        ▼
//!  state.json: { peakcode: 'done', codex: 'skipped', ... }
//! ```

use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

use crate::error::ServerResult;

/// 单个迁移步骤的执行状态
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepStatus {
    /// 迁移成功完成
    Done,
    /// 源目录不存在，跳过
    Skipped,
    /// 执行过程中出错
    Failed(String),
}

/// 整次 home 迁移的汇总结果
#[derive(Debug, Clone)]
pub struct MigrationReport {
    /// 各来源的迁移结果
    pub steps: Vec<(String, StepStatus)>,
    /// 复制到目标的文件总数
    pub copied_files: usize,
    /// 复制到目标的字节总数
    pub copied_bytes: u64,
}

impl MigrationReport {
    /// 判断是否所有步骤都成功（Done 或 Skipped 都算 OK）
    pub fn all_succeeded(&self) -> bool {
        self.steps
            .iter()
            .all(|(_, s)| !matches!(s, StepStatus::Failed(_)))
    }
}

/// 已知的数据源标识符
pub const SOURCE_PEAKCODE: &str = "peakcode";
pub const SOURCE_CODEX: &str = "codex";
pub const SOURCE_CLAUDE: &str = "claude";
pub const SOURCE_OPENCODE: &str = "opencode";

/// Home 迁移器
///
/// 负责把已知来源（Peak/Codex/Claude/OpenCode）的 home 目录数据
/// 复制到 Remi 的 home 下，并对每个 source 记录幂等状态。
pub struct HomeMigrator {
    /// Remi 自己的 home 目录（如 `~/.remi`）
    dest_root: PathBuf,
    /// 状态文件路径（`<dest_root>/migration_state.json`）
    state_path: PathBuf,
}

impl HomeMigrator {
    /// 创建新的迁移器实例
    ///
    /// # 参数
    ///
    /// - `dest_root`: Remi 的 home 根目录；若不存在会自动创建
    pub fn new(dest_root: impl Into<PathBuf>) -> ServerResult<Self> {
        let dest_root = dest_root.into();
        fs::create_dir_all(&dest_root)?;
        let state_path = dest_root.join("migration_state.json");
        Ok(Self {
            dest_root,
            state_path,
        })
    }

    /// 一次性执行全部已知来源的迁移
    ///
    /// 流程：
    /// 1. 解析 `~/.<source>` 路径
    /// 2. 若已 Done 则跳过（幂等）
    /// 3. 把整个目录复制到 `<dest_root>/imported/<source>/`
    /// 4. 记录状态
    pub fn migrate_all(&self) -> ServerResult<MigrationReport> {
        let sources = [
            SOURCE_PEAKCODE,
            SOURCE_CODEX,
            SOURCE_CLAUDE,
            SOURCE_OPENCODE,
        ];

        let mut report = MigrationReport {
            steps: Vec::with_capacity(sources.len()),
            copied_files: 0,
            copied_bytes: 0,
        };

        for src in sources {
            match self.migrate_source(src) {
                Ok((status, files, bytes)) => {
                    report.copied_files += files;
                    report.copied_bytes += bytes;
                    report.steps.push((src.to_string(), status));
                }
                Err(e) => {
                    warn!("迁移 {} 失败: {}", src, e);
                    report
                        .steps
                        .push((src.to_string(), StepStatus::Failed(e.to_string())));
                }
            }
        }

        Ok(report)
    }

    /// 迁移单个数据源
    ///
    /// # 返回
    ///
    /// - `(StepStatus, copied_files, copied_bytes)`
    fn migrate_source(&self, source: &str) -> ServerResult<(StepStatus, usize, u64)> {
        // 幂等检查
        if self.is_done(source)? {
            info!("home 迁移 {} 已完成，跳过", source);
            return Ok((StepStatus::Skipped, 0, 0));
        }

        let src_path = self.resolve_source_path(source);
        if !src_path.exists() {
            info!("home 源 {} 不存在：{:?}", source, src_path);
            self.mark_done(source, "skipped")?;
            return Ok((StepStatus::Skipped, 0, 0));
        }
        if !src_path.is_dir() {
            return Ok((
                StepStatus::Failed(format!("{:?} 不是目录", src_path)),
                0,
                0,
            ));
        }

        // 目标目录
        let dest_path = self.dest_root.join("imported").join(source);
        fs::create_dir_all(&dest_path)?;

        // 递归复制
        let (files, bytes) = copy_dir_recursive(&src_path, &dest_path)?;
        self.mark_done(source, "done")?;

        info!(
            "home 迁移 {} 完成：{} 个文件，{} 字节 → {:?}",
            source, files, bytes, dest_path
        );
        Ok((StepStatus::Done, files, bytes))
    }

    /// 解析一个 source 的候选 home 路径
    ///
    /// 同时检查标准位置和带 `.config` 的位置（如 Linux 上 `~/.config/peakcode/`）。
    fn resolve_source_path(&self, source: &str) -> PathBuf {
        if let Some(home) = home_dir() {
            // 标准位置：~/.<source>
            let primary = home.join(format!(".{}", source));
            if primary.exists() {
                return primary;
            }
            // Linux XDG 位置：~/.config/<source>
            let xdg = home.join(".config").join(source);
            if xdg.exists() {
                return xdg;
            }
            // macOS 备用：~/Library/Application Support/<source>
            #[cfg(target_os = "macos")]
            {
                let mac = home.join("Library/Application Support").join(source);
                if mac.exists() {
                    return mac;
                }
            }
            primary
        } else {
            PathBuf::from(format!(".{}", source))
        }
    }

    /// 读取状态文件
    fn read_state(&self) -> ServerResult<std::collections::HashMap<String, String>> {
        if !self.state_path.exists() {
            return Ok(Default::default());
        }
        let raw = fs::read_to_string(&self.state_path)?;
        if raw.trim().is_empty() {
            return Ok(Default::default());
        }
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    /// 写入状态文件
    fn write_state(
        &self,
        state: &std::collections::HashMap<String, String>,
    ) -> ServerResult<()> {
        let raw = serde_json::to_string_pretty(state).unwrap_or_else(|_| "{}".to_string());
        fs::write(&self.state_path, raw)?;
        Ok(())
    }

    fn is_done(&self, source: &str) -> ServerResult<bool> {
        let state = self.read_state()?;
        Ok(matches!(state.get(source).map(String::as_str), Some("done") | Some("skipped")))
    }

    fn mark_done(&self, source: &str, status: &str) -> ServerResult<()> {
        let mut state = self.read_state()?;
        state.insert(source.to_string(), status.to_string());
        self.write_state(&state)
    }
}

/// 解析当前用户的 home 目录
///
/// 优先 `HOME`（Unix）/ `USERPROFILE`（Windows），再退到 `dirs` crate。
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir())
}

/// 递归复制目录
///
/// 跳过符号链接、socket、权限拒绝的文件。返回复制的文件数和字节数。
fn copy_dir_recursive(src: &Path, dest: &Path) -> ServerResult<(usize, u64)> {
    let mut files = 0usize;
    let mut bytes = 0u64;
    copy_dir_recursive_inner(src, dest, &mut files, &mut bytes)?;
    Ok((files, bytes))
}

fn copy_dir_recursive_inner(
    src: &Path,
    dest: &Path,
    files: &mut usize,
    bytes: &mut u64,
) -> ServerResult<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_child = entry.path();
        let dest_child = dest.join(entry.file_name());

        // 跳过符号链接，避免循环
        if file_type.is_symlink() {
            continue;
        }
        // 跳过 socket / fifo / block / char 设备
        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }

        if file_type.is_dir() {
            copy_dir_recursive_inner(&src_child, &dest_child, files, bytes)?;
        } else {
            // 单文件
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            // 跳过超大文件（> 64MB）防止误导入日志/缓存
            if meta.len() > 64 * 1024 * 1024 {
                continue;
            }
            match fs::copy(&src_child, &dest_child) {
                Ok(n) => {
                    *files += 1;
                    *bytes += n;
                }
                Err(e) => {
                    warn!("复制 {:?} 失败: {}", src_child, e);
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    #[test]
    fn migrator_creates_dest_dir() {
        let tmp = env::temp_dir().join(format!("remi-home-mig-{}", uuid::Uuid::new_v4()));
        let m = HomeMigrator::new(&tmp).unwrap();
        assert!(tmp.exists());
        // 状态文件路径合法
        assert!(m
            .state_path
            .ends_with("migration_state.json"));
    }

    #[test]
    fn migrate_missing_source_marks_skipped() {
        let tmp = env::temp_dir().join(format!("remi-home-mig-{}", uuid::Uuid::new_v4()));
        let m = HomeMigrator::new(&tmp).unwrap();
        let report = m.migrate_all().unwrap();
        // 至少 4 个 step 都被记录
        assert_eq!(report.steps.len(), 4);
        // 任何 Failed 都不应该出现
        assert!(report.all_succeeded());
    }

    #[test]
    fn idempotent_rerun() {
        let tmp = env::temp_dir().join(format!("remi-home-mig-{}", uuid::Uuid::new_v4()));
        let m = HomeMigrator::new(&tmp).unwrap();
        let _r1 = m.migrate_all().unwrap();
        let r2 = m.migrate_all().unwrap();
        // 第二次运行不应再复制任何文件（幂等）
        assert_eq!(r2.copied_files, 0);
        assert_eq!(r2.copied_bytes, 0);
    }

    #[test]
    fn copy_dir_recursive_basic() {
        let src = env::temp_dir().join(format!("remi-home-src-{}", uuid::Uuid::new_v4()));
        let dest = env::temp_dir().join(format!("remi-home-dst-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("a.txt"), b"hello").unwrap();
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("sub").join("b.txt"), b"world").unwrap();

        let (files, bytes) = copy_dir_recursive(&src, &dest).unwrap();
        assert_eq!(files, 2);
        assert_eq!(bytes, (b"hello".len() + b"world".len()) as u64);
        assert!(dest.join("a.txt").exists());
        assert!(dest.join("sub").join("b.txt").exists());
    }
}
