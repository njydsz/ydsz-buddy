//! # GitHub CLI 包装模块
//!
//! 本模块将 GitHub CLI (`gh`) 封装为类型安全的异步接口，
//! 为 [`GitManager`](crate::manager::GitManager) 提供更丰富的 PR 管理能力。
//!
//! ## 模块职责
//!
//! - 列出当前仓库的 Pull Requests
//! - 查看单个 PR 的元数据与 diff
//! - 合并 PR（merge / squash / rebase）
//! - 获取 PR 的审查意见与状态检查结果
//! - 创建/编辑 PR 评论
//!
//! ## 设计说明
//!
//! - 所有方法都通过 `gh` CLI 实现，因此必须先安装并完成 `gh auth login`
//! - 命令输出统一解析为 Rust 数据结构，避免字符串拼接错误
//! - 错误信息会附带 `gh` 退出码与 stderr，便于排错

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tracing::{debug, info, warn};

use crate::error::{GitError, GitResult};

/// Pull Request 列表元素
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestSummary {
    /// PR 编号
    pub number: u64,
    /// PR 标题
    pub title: String,
    /// 源分支
    pub head_ref: String,
    /// 目标分支
    pub base_ref: String,
    /// 状态
    pub state: String,
    /// 是否为草稿
    pub is_draft: bool,
    /// 作者登录名
    pub author: Option<String>,
    /// PR URL
    pub url: String,
}

/// Pull Request 详细信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestDetail {
    #[serde(flatten)]
    pub summary: PullRequestSummary,
    /// 合并提交 SHA
    pub merge_commit_sha: Option<String>,
    /// 主体内容（Markdown）
    pub body: String,
    /// 标签列表
    pub labels: Vec<String>,
    /// 受让人登录名列表
    pub assignees: Vec<String>,
    /// 里程碑
    pub milestone: Option<String>,
}

/// 合并策略
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MergeMethod {
    /// 普通 merge commit
    Merge,
    /// 压缩 squash
    Squash,
    /// 变基 rebase
    Rebase,
}

impl MergeMethod {
    fn as_flag(self) -> &'static str {
        match self {
            MergeMethod::Merge => "--merge",
            MergeMethod::Squash => "--squash",
            MergeMethod::Rebase => "--rebase",
        }
    }
}

/// GitHub CLI 客户端
///
/// 封装 `gh` 命令的常用 PR/仓库操作。
#[derive(Debug, Default, Clone)]
pub struct GitHubCli;

impl GitHubCli {
    /// 创建新的客户端实例
    pub fn new() -> Self {
        Self
    }

    /// 列出指定仓库（或当前目录对应仓库）的 PR
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `state`: 过滤状态，可选 `open` / `closed` / `merged` / `all`
    /// - `limit`: 最多返回多少条
    pub async fn list_pull_requests(
        &self,
        cwd: &str,
        state: Option<&str>,
        limit: Option<u32>,
    ) -> GitResult<Vec<PullRequestSummary>> {
        info!("gh: list PRs (cwd={}, state={:?}, limit={:?})", cwd, state, limit);
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args([
                "pr", "list",
                "--json", "number,title,headRefName,baseRefName,state,isDraft,author,url",
            ]);
        if let Some(s) = state {
            cmd.args(["--state", s]);
        }
        if let Some(l) = limit {
            cmd.args(["--limit", &l.to_string()]);
        }

        let output = run_gh(cmd, "gh pr list").await?;
        let items: Vec<PullRequestSummary> = serde_json::from_str(&output)
            .map_err(|e| GitError::InternalError(format!("parse json: {e}")))?;
        Ok(items)
    }

    /// 查看单个 PR 的完整信息
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `pr_number`: PR 编号
    pub async fn view_pull_request(
        &self,
        cwd: &str,
        pr_number: u64,
    ) -> GitResult<PullRequestDetail> {
        info!("gh: view PR #{}", pr_number);
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args([
                "pr", "view", &pr_number.to_string(),
                "--json",
                "number,title,headRefName,baseRefName,state,isDraft,author,url,mergeCommit,body,labels,assignees,milestone",
            ]);
        let output = run_gh(cmd, "gh pr view").await?;
        let detail: PullRequestDetail = serde_json::from_str(&output)
            .map_err(|e| GitError::InternalError(format!("parse json: {e}")))?;
        Ok(detail)
    }

    /// 合并 PR
    ///
    /// 通过 `gh pr merge` 命令合并指定的 Pull Request。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    /// - `pr_number`: PR 编号（必须是已开放且可合并的 PR）
    /// - `method`: 合并策略（Merge/Squash/Rebase）
    /// - `delete_branch`: 合并后是否删除远程源分支
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 合并成功
    /// - `Err(GitError::CommandError)`: 合并失败（PR 不存在、有冲突、未通过检查等）
    ///
    /// # 注意事项
    ///
    /// - 合并前请确保 PR 已通过所有必需的审查和状态检查
    /// - 如果有合并冲突，需要先解决冲突才能合并
    /// - `delete_branch` 为 true 时，合并成功后会自动删除远程源分支
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// client.merge_pull_request("/path/to/repo", 123, MergeMethod::Squash, true).await?;
    /// ```
    pub async fn merge_pull_request(
        &self,
        cwd: &str,
        pr_number: u64,
        method: MergeMethod,
        delete_branch: bool,
    ) -> GitResult<()> {
        info!(
            "gh: merge PR #{} via {:?}, delete_branch={}",
            pr_number, method, delete_branch
        );
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args(["pr", "merge", &pr_number.to_string(), method.as_flag()]);
        if delete_branch {
            cmd.arg("--delete-branch");
        }
        run_gh(cmd, "gh pr merge").await?;
        Ok(())
    }

    /// 给 PR 添加评论
    ///
    /// 通过 `gh pr comment` 命令在指定的 Pull Request 上添加评论。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    /// - `pr_number`: PR 编号
    /// - `body`: 评论内容（支持 Markdown 格式）
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 评论添加成功
    /// - `Err(GitError::CommandError)`: 评论失败（PR 不存在、权限不足等）
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// client.comment_pull_request("/path/to/repo", 123, "LGTM! 🎉").await?;
    /// ```
    pub async fn comment_pull_request(
        &self,
        cwd: &str,
        pr_number: u64,
        body: &str,
    ) -> GitResult<()> {
        info!("gh: comment on PR #{}", pr_number);
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args(["pr", "comment", &pr_number.to_string(), "--body", body]);
        run_gh(cmd, "gh pr comment").await?;
        Ok(())
    }

    /// 获取 PR diff（统一格式）
    pub async fn diff_pull_request(&self, cwd: &str, pr_number: u64) -> GitResult<String> {
        info!("gh: diff PR #{}", pr_number);
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args(["pr", "diff", &pr_number.to_string()]);
        run_gh(cmd, "gh pr diff").await
    }

    /// 关闭 PR（不合并）
    pub async fn close_pull_request(&self, cwd: &str, pr_number: u64) -> GitResult<()> {
        info!("gh: close PR #{}", pr_number);
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args(["pr", "close", &pr_number.to_string()]);
        run_gh(cmd, "gh pr close").await?;
        Ok(())
    }

    /// 重新打开已关闭 PR
    pub async fn reopen_pull_request(&self, cwd: &str, pr_number: u64) -> GitResult<()> {
        info!("gh: reopen PR #{}", pr_number);
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args(["pr", "reopen", &pr_number.to_string()]);
        run_gh(cmd, "gh pr reopen").await?;
        Ok(())
    }

    /// 查看当前 gh 认证状态
    pub async fn auth_status(&self) -> GitResult<GitHubAuthStatus> {
        debug!("gh: auth status");
        let mut cmd = Command::new("gh");
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args(["auth", "status"]);
        let output = cmd.output().await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                GitError::CommandError(
                    "未找到 gh CLI，请安装 GitHub CLI (https://cli.github.com)".to_string(),
                )
            } else {
                GitError::CommandError(format!("执行 gh auth status 失败: {}", e))
            }
        })?;
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let logged_in = output.status.success();
        Ok(GitHubAuthStatus {
            logged_in,
            account: extract_account(&stdout, &stderr),
            protocol: extract_protocol(&stdout, &stderr),
        })
    }
}

/// gh 认证状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAuthStatus {
    /// 是否已登录
    pub logged_in: bool,
    /// 登录账号（如 'octocat'）
    pub account: Option<String>,
    /// 认证协议（'HTTPS' / 'SSH'）
    pub protocol: Option<String>,
}

fn extract_account(stdout: &str, stderr: &str) -> Option<String> {
    for line in format!("{stdout}\n{stderr}").lines() {
        if let Some(rest) = line.strip_prefix("Logged in to github.com account ") {
            // 形如 'Logged in to github.com account octocat (oauth_token)'
            let token = rest.split_whitespace().next()?;
            return Some(token.to_string());
        }
    }
    None
}

fn extract_protocol(stdout: &str, stderr: &str) -> Option<String> {
    for line in format!("{stdout}\n{stderr}").lines() {
        if let Some(rest) = line.strip_prefix("Git operations for ") {
            if let Some(parens) = rest.find('(') {
                return Some(rest[parens + 1..rest.len().saturating_sub(1)].to_string());
            }
        }
    }
    None
}

async fn run_gh(mut cmd: Command, op_desc: &str) -> GitResult<String> {
    let output = cmd.output().await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            GitError::CommandError(
                "未找到 gh CLI，请安装 GitHub CLI (https://cli.github.com) 并执行 gh auth login".to_string(),
            )
        } else {
            GitError::CommandError(format!("执行 {op_desc} 失败: {}", e))
        }
    })?;
    let code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        warn!("{} failed: exit={}, stderr={}", op_desc, code, stderr);
        return Err(GitError::CommandError(format!(
            "{} failed (exit {}): {}",
            op_desc, code, stderr
        )));
    }
    Ok(stdout)
}
