//! Git 核心操作

use std::process::Stdio;

use tokio::process::Command;
use tracing::{debug, warn};

use crate::error::{GitError, GitResult};

/// Git 执行输入
#[derive(Debug, Clone)]
pub struct ExecuteGitInput {
    /// 操作名称
    pub operation: String,
    /// 工作目录
    pub cwd: String,
    /// Git 参数
    pub args: Vec<String>,
    /// 环境变量
    pub env: Vec<(String, String)>,
    /// 是否允许非零退出码
    pub allow_non_zero_exit: bool,
    /// 超时毫秒数
    pub timeout_ms: Option<u64>,
}

/// Git 执行结果
#[derive(Debug, Clone)]
pub struct ExecuteGitResult {
    /// 退出码
    pub code: i32,
    /// 标准输出
    pub stdout: String,
    /// 标准错误
    pub stderr: String,
}

/// Git 状态结果
#[derive(Debug, Clone)]
pub struct GitStatusResult {
    /// 当前分支
    pub current_branch: Option<String>,
    /// 上游引用
    pub upstream_ref: Option<String>,
    /// 是否有未提交的更改
    pub is_dirty: bool,
    /// 暂存的文件
    pub staged_files: Vec<String>,
    /// 修改的文件
    pub modified_files: Vec<String>,
    /// 未跟踪的文件
    pub untracked_files: Vec<String>,
    /// 关联的 PR
    pub pr: Option<PullRequestInfo>,
}

/// Pull Request 信息
#[derive(Debug, Clone)]
pub struct PullRequestInfo {
    /// PR 编号
    pub number: u64,
    /// PR 标题
    pub title: String,
    /// PR URL
    pub url: String,
}

/// Git 核心服务
pub struct GitCore;

impl GitCore {
    /// 创建新的 Git 核心服务
    pub fn new() -> Self {
        Self
    }

    /// 执行 Git 命令
    pub async fn execute(&self, input: ExecuteGitInput) -> GitResult<ExecuteGitResult> {
        debug!("执行 Git 命令: {} {}", input.operation, input.args.join(" "));

        let mut cmd = Command::new("git");
        cmd.current_dir(&input.cwd);
        cmd.args(&input.args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // 设置环境变量
        for (key, value) in &input.env {
            cmd.env(key, value);
        }

        let output = cmd.output().await.map_err(|e| {
            GitError::CommandError(format!("执行 Git 命令失败: {}", e))
        })?;

        let code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if code != 0 && !input.allow_non_zero_exit {
            warn!("Git 命令失败: {} - {}", input.operation, stderr);
            return Err(GitError::CommandError(format!(
                "Git {} 失败 (exit code {}): {}",
                input.operation, code, stderr
            )));
        }

        Ok(ExecuteGitResult {
            code,
            stdout,
            stderr,
        })
    }

    /// 获取 Git 状态
    pub async fn status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        // 获取当前分支
        let branch_result = self
            .execute(ExecuteGitInput {
                operation: "rev-parse --abbrev-ref HEAD".to_string(),
                cwd: cwd.to_string(),
                args: vec!["rev-parse".to_string(), "--abbrev-ref".to_string(), "HEAD".to_string()],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: None,
            })
            .await?;

        let current_branch = if branch_result.code == 0 {
            Some(branch_result.stdout.trim().to_string())
        } else {
            None
        };

        // 获取上游引用
        let upstream_result = self
            .execute(ExecuteGitInput {
                operation: "rev-parse --abbrev-ref --symbolic-full-name @{u}".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "rev-parse".to_string(),
                    "--abbrev-ref".to_string(),
                    "--symbolic-full-name".to_string(),
                    "@{u}".to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: None,
            })
            .await?;

        let upstream_ref = if upstream_result.code == 0 {
            Some(upstream_result.stdout.trim().to_string())
        } else {
            None
        };

        // 获取状态
        let status_result = self
            .execute(ExecuteGitInput {
                operation: "status --porcelain".to_string(),
                cwd: cwd.to_string(),
                args: vec!["status".to_string(), "--porcelain".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        let mut staged_files = Vec::new();
        let mut modified_files = Vec::new();
        let mut untracked_files = Vec::new();

        for line in status_result.stdout.lines() {
            if line.len() < 3 {
                continue;
            }

            let status = &line[0..2];
            let file = line[3..].to_string();

            match status {
                "??" => untracked_files.push(file),
                "M " | "A " | "D " => staged_files.push(file),
                " M" | " A" | " D" => modified_files.push(file),
                "MM" | "AM" | "DM" => {
                    staged_files.push(file.clone());
                    modified_files.push(file);
                }
                _ => {}
            }
        }

        let is_dirty = !staged_files.is_empty() || !modified_files.is_empty() || !untracked_files.is_empty();

        Ok(GitStatusResult {
            current_branch,
            upstream_ref,
            is_dirty,
            staged_files,
            modified_files,
            untracked_files,
            pr: None, // TODO: 实现 PR 信息获取
        })
    }

    /// 创建分支
    pub async fn create_branch(&self, cwd: &str, branch_name: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "branch".to_string(),
            cwd: cwd.to_string(),
            args: vec!["branch".to_string(), branch_name.to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 切换分支
    pub async fn checkout_branch(&self, cwd: &str, branch_name: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "checkout".to_string(),
            cwd: cwd.to_string(),
            args: vec!["checkout".to_string(), branch_name.to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 创建并提交
    pub async fn commit(&self, cwd: &str, message: &str) -> GitResult<String> {
        let _result = self
            .execute(ExecuteGitInput {
                operation: "commit".to_string(),
                cwd: cwd.to_string(),
                args: vec!["commit".to_string(), "-m".to_string(), message.to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        // 提取 commit SHA
        let sha_result = self
            .execute(ExecuteGitInput {
                operation: "rev-parse HEAD".to_string(),
                cwd: cwd.to_string(),
                args: vec!["rev-parse".to_string(), "HEAD".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(sha_result.stdout.trim().to_string())
    }

    /// 推送当前分支
    pub async fn push_current_branch(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "push".to_string(),
            cwd: cwd.to_string(),
            args: vec!["push".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 拉取当前分支
    pub async fn pull_current_branch(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "pull".to_string(),
            cwd: cwd.to_string(),
            args: vec!["pull".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 创建 worktree
    pub async fn create_worktree(
        &self,
        cwd: &str,
        worktree_path: &str,
        branch_name: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "worktree add".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "worktree".to_string(),
                "add".to_string(),
                worktree_path.to_string(),
                "-b".to_string(),
                branch_name.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 删除 worktree
    pub async fn remove_worktree(&self, cwd: &str, worktree_path: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "worktree remove".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "worktree".to_string(),
                "remove".to_string(),
                worktree_path.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 暂存更改
    pub async fn stash(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "stash".to_string(),
            cwd: cwd.to_string(),
            args: vec!["stash".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 恢复暂存
    pub async fn stash_pop(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "stash pop".to_string(),
            cwd: cwd.to_string(),
            args: vec!["stash".to_string(), "pop".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 初始化仓库
    pub async fn init_repo(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "init".to_string(),
            cwd: cwd.to_string(),
            args: vec!["init".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 列出分支
    pub async fn list_branches(&self, cwd: &str) -> GitResult<Vec<String>> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "branch --list".to_string(),
                cwd: cwd.to_string(),
                args: vec!["branch".to_string(), "--list".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        let branches: Vec<String> = result
            .stdout
            .lines()
            .map(|line| {
                // 移除前导空格和星号
                let branch = line.trim_start();
                if let Some(stripped) = branch.strip_prefix("* ") {
                    stripped.to_string()
                } else {
                    branch.to_string()
                }
            })
            .filter(|b| !b.is_empty())
            .collect();

        Ok(branches)
    }

    /// 获取 diff
    pub async fn diff(&self, cwd: &str, staged: bool) -> GitResult<String> {
        let mut args = vec!["diff".to_string()];
        if staged {
            args.push("--cached".to_string());
        }

        let result = self
            .execute(ExecuteGitInput {
                operation: "diff".to_string(),
                cwd: cwd.to_string(),
                args,
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(result.stdout)
    }

    /// 获取 log
    pub async fn log(&self, cwd: &str, max_count: usize) -> GitResult<String> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "log".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "log".to_string(),
                    format!("--max-count={}", max_count),
                    "--oneline".to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(result.stdout)
    }

    /// 回滚到指定 commit
    pub async fn revert_to_commit(&self, commit_sha: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "reset --hard".to_string(),
            cwd: ".".to_string(),
            args: vec!["reset".to_string(), "--hard".to_string(), commit_sha.to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 获取两个 commit 之间的 diff
    pub async fn diff_between_commits(
        &self,
        from_commit: &str,
        to_commit: &str,
    ) -> GitResult<String> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "diff".to_string(),
                cwd: ".".to_string(),
                args: vec![
                    "diff".to_string(),
                    format!("{}...{}", from_commit, to_commit),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(result.stdout)
    }
}

impl Default for GitCore {
    fn default() -> Self {
        Self::new()
    }
}
