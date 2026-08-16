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

use super::error::{GitError, GitResult};

/// Pull Request 列表元素
///
/// 从 GitHub API 返回的 PR 摘要信息，用于列表展示。
///
/// # 字段说明
///
/// - `number`: PR 编号，唯一标识
/// - `title`: PR 标题
/// - `head_ref`: 源分支名称
/// - `base_ref`: 目标分支名称
/// - `state`: PR 状态（`OPEN`, `CLOSED`, `MERGED`）
/// - `is_draft`: 是否为草稿 PR
/// - `author`: 作者的 GitHub 登录名
/// - `url`: PR 的完整 URL
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
///
/// 包含 PR 的完整元数据，包括摘要信息、合并状态、标签、受让人等。
///
/// # 字段说明
///
/// - `summary`: PR 摘要信息（使用 `#[serde(flatten)]` 扁平化）
/// - `merge_commit_sha`: 合并提交的 SHA 哈希（未合并时为 `None`）
/// - `body`: PR 主体内容（Markdown 格式）
/// - `labels`: 标签列表
/// - `assignees`: 受让人登录名列表
/// - `milestone`: 里程碑名称
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
    ///
    /// 通过 `gh pr diff` 命令获取指定 PR 的文件差异，输出为统一的 diff 格式。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    /// - `pr_number`: PR 编号
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: PR 的完整 diff 内容（统一格式）
    /// - `Err(GitError::CommandError)`: 获取失败（PR 不存在等）
    ///
    /// # 使用场景
    ///
    /// - 代码审查时查看 PR 包含的所有更改
    /// - 分析 PR 的代码变更范围
    /// - 为 AI Agent 提供 PR 的差异上下文
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// let diff = client.diff_pull_request("/path/to/repo", 123).await?;
    /// println!("Diff:\n{}", diff);
    /// ```
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
    ///
    /// 通过 `gh pr close` 命令关闭指定的 Pull Request，但不执行合并操作。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    /// - `pr_number`: PR 编号（必须是已开放的 PR）
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 关闭成功
    /// - `Err(GitError::CommandError)`: 关闭失败（PR 不存在、已关闭等）
    ///
    /// # 注意事项
    ///
    /// - 关闭后的 PR 可以通过 `reopen_pull_request` 重新打开
    /// - 关闭操作不会删除分支，仅标记 PR 为已关闭状态
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// client.close_pull_request("/path/to/repo", 123).await?;
    /// ```
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
    ///
    /// 通过 `gh pr reopen` 命令重新打开之前关闭的 Pull Request。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    /// - `pr_number`: PR 编号（必须是已关闭的 PR）
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 重新打开成功
    /// - `Err(GitError::CommandError)`: 操作失败（PR 不存在、已经是开放状态等）
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// client.reopen_pull_request("/path/to/repo", 123).await?;
    /// ```
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
    ///
    /// 通过 `gh auth status` 命令检查 GitHub CLI 的认证状态，包括是否已登录、
    /// 登录账号和使用的认证协议。
    ///
    /// # 返回值
    ///
    /// - `Ok(GitHubAuthStatus)`: 认证状态信息
    /// - `Err(GitError::CommandError)`: 命令执行失败（`gh` 未安装等）
    ///
    /// # 使用场景
    ///
    /// - 在执行 PR 操作前检查认证状态
    /// - 诊断 `gh` CLI 的认证问题
    /// - 获取当前登录的账号信息
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// let status = client.auth_status().await?;
    /// if status.logged_in {
    ///     println!("已登录: {:?}", status.account);
    /// } else {
    ///     println!("未登录，请执行 gh auth login");
    /// }
    /// ```
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
///
/// 封装 GitHub CLI 的认证信息，用于检查是否已登录以及登录的账号详情。
///
/// # 字段说明
///
/// - `logged_in`: 是否已成功登录 GitHub CLI
/// - `account`: 登录的 GitHub 用户名（如 'octocat'），未登录时为 None
/// - `protocol`: 使用的认证协议（'HTTPS' 或 'SSH'），未登录时为 None
///
/// # 数据来源
///
/// 通过 `gh auth status` 命令获取，由 `auth_status` 方法解析。
///
/// # 使用场景
///
/// - 在执行 PR 操作前验证认证状态
/// - 显示当前登录的账号信息
/// - 诊断认证相关问题
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAuthStatus {
    /// 是否已登录 GitHub CLI
    pub logged_in: bool,
    /// 登录账号（如 'octocat'）
    pub account: Option<String>,
    /// 认证协议（'HTTPS' / 'SSH'）
    pub protocol: Option<String>,
}

/// 从 `gh auth status` 的输出中提取已登录的账号名称
///
/// 解析 stdout 和 stderr 中形如 `'Logged in to github.com account octocat (oauth_token)'` 的行，
/// 提取出账号名称。
///
/// # 参数
///
/// - `stdout`: 命令的标准输出
/// - `stderr`: 命令的标准错误输出
///
/// # 返回值
///
/// 返回 `Some(账号名)` 如果找到匹配行，否则返回 `None`。
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

/// 从 `gh auth status` 的输出中提取认证协议
///
/// 解析 stdout 和 stderr 中形如 `'Git operations for ... (HTTPS)'` 的行，
/// 提取出括号中的协议名称。
///
/// # 参数
///
/// - `stdout`: 命令的标准输出
/// - `stderr`: 命令的标准错误输出
///
/// # 返回值
///
/// 返回 `Some(协议名)` 如果找到匹配行，否则返回 `None`。
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

/// 执行 `gh` CLI 命令并返回标准输出
///
/// 统一的 `gh` 命令执行入口，处理进程创建、输出捕获和错误转换。
///
/// # 参数
///
/// - `cmd`: 已配置好的 `Command` 实例（已设置工作目录和参数）
/// - `op_desc`: 操作描述，用于错误消息中（如 `'gh pr list'`）
///
/// # 返回值
///
/// - `Ok(String)`: 命令的标准输出内容
/// - `Err(GitError::CommandError)`: 命令执行失败或 `gh` 未安装
///
/// # 错误处理
///
/// - 如果 `gh` 可执行文件不存在，返回包含安装提示的错误
/// - 如果命令返回非零退出码，返回包含 stderr 内容的错误
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
