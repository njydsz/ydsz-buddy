//! GitHub CLI 集成。
//!
//! 大厂标准：AI 编辑代码后应能一键创建 PR / Issue。
//! 本模块包装 `gh` CLI（用户机器上预装的官方工具），不直接
//! 走 HTTP API（避免管理 token）。
//!
//! # 用法
//!
//! ```no_run
//! use remi_orchestration::integrations::github::GitHubCli;
//!
//! # async fn run() -> Result<(), remi_core::Error> {
//! let gh = GitHubCli::new();
//! let prs = gh.list_open_prs("remi-org", "remi-code").await?;
//! for pr in prs {
//!     println!("#{}: {}", pr.number, pr.title);
//! }
//! # Ok(())
//! # }
//! ```

use remi_core::Result;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::process::Command;
use tracing::{debug, warn};

/// GitHub 仓库信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    /// owner/name 形式。
    pub full_name: String,
    /// 仓库描述。
    pub description: Option<String>,
    /// 默认分支。
    pub default_branch: String,
    /// 仓库是否 fork。
    pub fork: bool,
}

/// GitHub PR 信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubPullRequest {
    /// PR 编号。
    pub number: u32,
    /// 标题。
    pub title: String,
    /// body / description。
    pub body: Option<String>,
    /// 状态。
    pub state: String,
    /// 作者 login。
    pub author: String,
    /// head 分支。
    pub head_ref: String,
    /// base 分支。
    pub base_ref: String,
    /// URL。
    pub url: String,
    /// 是否可合并。
    pub mergeable: Option<bool>,
    /// 创建时间。
    pub created_at: String,
}

/// GitHub Issue 信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubIssue {
    /// Issue 编号。
    pub number: u32,
    /// 标题。
    pub title: String,
    /// body。
    pub body: Option<String>,
    /// 状态。
    pub state: String,
    /// 作者。
    pub author: String,
    /// 标签。
    pub labels: Vec<String>,
    /// URL。
    pub url: String,
    /// 创建时间。
    pub created_at: String,
}

/// GitHub CLI 包装。
#[derive(Clone)]
pub struct GitHubCli {
    /// `gh` 可执行文件路径。
    binary: String,
}

impl Default for GitHubCli {
    fn default() -> Self {
        Self::new()
    }
}

impl GitHubCli {
    /// 创建一个使用默认 `gh` 二进制的客户端。
    pub fn new() -> Self {
        Self {
            binary: "gh".to_string(),
        }
    }

    /// 自定义 `gh` 路径。
    pub fn with_binary(mut self, path: impl Into<String>) -> Self {
        self.binary = path.into();
        self
    }

    /// 检查 `gh` 是否安装。
    pub async fn is_available(&self) -> bool {
        let output = Command::new(&self.binary)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .await;
        matches!(output, Ok(o) if o.status.success())
    }

    /// 列出指定仓库的 open PR。
    pub async fn list_open_prs(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<GitHubPullRequest>> {
        let output = self
            .run(&[
                "pr",
                "list",
                "--repo",
                &format!("{owner}/{repo}"),
                "--state",
                "open",
                "--json",
                "number,title,body,state,author,headRefName,baseRefName,url,mergeable,createdAt",
            ])
            .await?;
        let prs: Vec<GitHubPullRequest> = serde_json::from_str(&output)
            .map_err(|e| remi_core::Error::Parse(format!("解析 PR 列表失败: {e}")))?;
        Ok(prs)
    }

    /// 列出指定仓库的 Issue。
    pub async fn list_issues(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<GitHubIssue>> {
        let output = self
            .run(&[
                "issue",
                "list",
                "--repo",
                &format!("{owner}/{repo}"),
                "--state",
                "open",
                "--json",
                "number,title,body,state,author,labels,url,createdAt",
            ])
            .await?;
        let issues: Vec<GitHubIssue> = serde_json::from_str(&output)
            .map_err(|e| remi_core::Error::Parse(format!("解析 Issue 列表失败: {e}")))?;
        Ok(issues)
    }

    /// 创建一个 PR。
    pub async fn create_pr(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: &str,
        base: &str,
        head: &str,
        draft: bool,
    ) -> Result<GitHubPullRequest> {
        let mut args = vec![
            "pr".to_string(),
            "create".to_string(),
            "--repo".to_string(),
            format!("{owner}/{repo}"),
            "--title".to_string(),
            title.to_string(),
            "--body".to_string(),
            body.to_string(),
            "--base".to_string(),
            base.to_string(),
            "--head".to_string(),
            head.to_string(),
        ];
        if draft {
            args.push("--draft".to_string());
        }
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let output = self.run(&arg_refs).await?;
        // gh pr create 输出 URL
        let url = output.trim().to_string();
        Ok(GitHubPullRequest {
            number: 0, // 创建时不知道编号
            title: title.to_string(),
            body: Some(body.to_string()),
            state: "open".to_string(),
            author: "".to_string(),
            head_ref: head.to_string(),
            base_ref: base.to_string(),
            url,
            mergeable: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// 创建一个 Issue。
    pub async fn create_issue(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: &str,
        labels: &[&str],
    ) -> Result<GitHubIssue> {
        let mut args = vec![
            "issue".to_string(),
            "create".to_string(),
            "--repo".to_string(),
            format!("{owner}/{repo}"),
            "--title".to_string(),
            title.to_string(),
            "--body".to_string(),
            body.to_string(),
        ];
        for label in labels {
            args.push("--label".to_string());
            args.push((*label).to_string());
        }
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let output = self.run(&arg_refs).await?;
        let url = output.trim().to_string();
        Ok(GitHubIssue {
            number: 0,
            title: title.to_string(),
            body: Some(body.to_string()),
            state: "open".to_string(),
            author: "".to_string(),
            labels: labels.iter().map(|s| s.to_string()).collect(),
            url,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// 获取仓库信息。
    pub async fn get_repo(&self, owner: &str, repo: &str) -> Result<GitHubRepo> {
        let output = self
            .run(&[
                "repo",
                "view",
                &format!("{owner}/{repo}"),
                "--json",
                "nameWithOwner,description,defaultBranchRef,isFork",
            ])
            .await?;
        let v: serde_json::Value = serde_json::from_str(&output)
            .map_err(|e| remi_core::Error::Parse(format!("解析 repo 失败: {e}")))?;
        let full_name = v
            .get("nameWithOwner")
            .and_then(|n| n.as_str())
            .unwrap_or(&format!("{owner}/{repo}"))
            .to_string();
        let description = v
            .get("description")
            .and_then(|d| d.as_str())
            .map(String::from);
        let default_branch = v
            .get("defaultBranchRef")
            .and_then(|d| d.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("main")
            .to_string();
        let fork = v.get("isFork").and_then(|f| f.as_bool()).unwrap_or(false);
        Ok(GitHubRepo {
            full_name,
            description,
            default_branch,
            fork,
        })
    }

    /// 执行 `gh` 命令并返回 stdout。
    async fn run(&self, args: &[&str]) -> Result<String> {
        debug!(binary = %self.binary, ?args, "执行 gh 命令");
        let output = Command::new(&self.binary)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| remi_core::Error::Internal(format!("执行 gh 失败: {e}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!(stderr = %stderr, "gh 命令失败");
            return Err(remi_core::Error::Internal(format!(
                "gh 命令失败: {}",
                stderr
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_github_cli_creation() {
        let gh = GitHubCli::new();
        assert_eq!(gh.binary, "gh");
    }

    #[test]
    fn test_with_binary() {
        let gh = GitHubCli::new().with_binary("/usr/local/bin/gh");
        assert_eq!(gh.binary, "/usr/local/bin/gh");
    }
}
