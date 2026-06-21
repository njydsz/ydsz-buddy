//! # Shell 命令检测模块
//!
//! 检测用户在终端中输入的命令类型，辅助 UI 提供针对性提示与快捷操作。
//!
//! ## 分类
//!
//! - `git` 类：`git status`, `git log -p`, `git diff` …
 //! - `package` 类：`npm install`, `pnpm add`, `cargo build`, `go mod` …
 //! - `test` 类：`npm test`, `cargo test`, `pytest`, `jest` …
 //! - `build` 类：`cargo build`, `make`, `tsc`, `webpack` …
 //! - `lint` 类：`eslint`, `prettier`, `cargo clippy`, `ruff` …
 //! - `network` 类：`curl`, `wget`, `ssh`, `nc` …
 //! - `danger` 类：`rm -rf /`, `mkfs`, `dd if=` …（需用户二次确认）
//! - `interactive` 类：`vim`, `less`, `top` …（需分配 PTY）
//! - `unknown` 兜底

use serde::{Deserialize, Serialize};

/// 命令类别
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandKind {
    /// Git 操作
    Git,
    /// 包管理
    Package,
    /// 测试
    Test,
    /// 构建
    Build,
    /// Lint / 格式化
    Lint,
    /// 网络请求
    Network,
    /// 高危操作（需二次确认）
    Danger,
    /// 交互式（需 PTY）
    Interactive,
    /// 数据库相关
    Database,
    /// 容器相关
    Container,
    /// 文件操作（cp / mv / mkdir …）
    FileOp,
    /// 进程查看（ps / top / kill …）
    Process,
    /// 未知
    Unknown,
}

/// 命令检测结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandClassification {
    /// 命令类型
    pub kind: CommandKind,
    /// 置信度（0.0 ~ 1.0）
    pub confidence: f32,
    /// 解析出的子命令（如 `git status` → `status`）
    pub subcommand: Option<String>,
    /// 是否需要 PTY
    pub needs_pty: bool,
    /// 是否需要用户二次确认
    pub needs_confirmation: bool,
    /// 备注（用于 UI 提示）
    pub note: Option<String>,
}

/// 主分类函数
pub fn classify(line: &str) -> CommandClassification {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return CommandClassification {
            kind: CommandKind::Unknown,
            confidence: 0.0,
            subcommand: None,
            needs_pty: false,
            needs_confirmation: false,
            note: Some("空命令".into()),
        };
    }
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    let program = parts[0];
    let sub = parts.get(1).copied();

    // 1) Interactive
    for kw in INTERACTIVE {
        if program.eq_ignore_ascii_case(kw) || program.starts_with(kw) {
            return CommandClassification {
                kind: CommandKind::Interactive,
                confidence: 0.95,
                subcommand: None,
                needs_pty: true,
                needs_confirmation: false,
                note: Some(format!("{} 需要 PTY 交互", program)),
            };
        }
    }
    // 2) Danger
    for kw in DANGER {
        if program.eq_ignore_ascii_case(kw) {
            return CommandClassification {
                kind: CommandKind::Danger,
                confidence: 0.95,
                subcommand: None,
                needs_pty: false,
                needs_confirmation: true,
                note: Some(format!("{} 属于高危操作", program)),
            };
        }
    }
    if is_dangerous_rm(trimmed) {
        return CommandClassification {
            kind: CommandKind::Danger,
            confidence: 0.9,
            subcommand: None,
            needs_pty: false,
            needs_confirmation: true,
            note: Some("rm -rf 目标含根目录/家目录/上级目录".into()),
        };
    }
    // 3) Git
    if program.eq_ignore_ascii_case("git") {
        return CommandClassification {
            kind: CommandKind::Git,
            confidence: 0.99,
            subcommand: sub.map(|s| s.to_string()),
            needs_pty: false,
            needs_confirmation: false,
            note: None,
        };
    }
    // 4) Package / Build / Test / Lint
    // 对 cargo 这种"包管理 + 自带子命令"的工具，优先根据子命令再分类
    if let Some(sub_lower) = sub.map(|s| s.to_lowercase()) {
        let cargo_test_kinds: &[&str] = &["test", "bench", "nextest", "tarpaulin"];
        let cargo_build_kinds: &[&str] = &["build", "check", "clippy", "fmt", "rustc", "bench"];
        let cargo_lint_kinds: &[&str] = &["clippy", "fmt", "fix", "miri"];
        if program.eq_ignore_ascii_case("cargo") {
            if cargo_test_kinds.contains(&sub_lower.as_str()) {
                return CommandClassification {
                    kind: CommandKind::Test,
                    confidence: 0.95,
                    subcommand: sub.map(|s| s.to_string()),
                    needs_pty: false,
                    needs_confirmation: false,
                    note: Some(format!("cargo {} => 测试", sub_lower)),
                };
            }
            if cargo_build_kinds.contains(&sub_lower.as_str()) && sub_lower != "test" {
                return CommandClassification {
                    kind: CommandKind::Build,
                    confidence: 0.95,
                    subcommand: sub.map(|s| s.to_string()),
                    needs_pty: false,
                    needs_confirmation: false,
                    note: Some(format!("cargo {} => 构建", sub_lower)),
                };
            }
            if cargo_lint_kinds.contains(&sub_lower.as_str()) && sub_lower != "test" {
                return CommandClassification {
                    kind: CommandKind::Lint,
                    confidence: 0.9,
                    subcommand: sub.map(|s| s.to_string()),
                    needs_pty: false,
                    needs_confirmation: false,
                    note: Some(format!("cargo {} => Lint", sub_lower)),
                };
            }
        }
    }
    if PACKAGE.contains(&program.to_lowercase().as_str()) {
        return CommandClassification {
            kind: CommandKind::Package,
            confidence: 0.9,
            subcommand: sub.map(|s| s.to_string()),
            needs_pty: false,
            needs_confirmation: false,
            note: None,
        };
    }
    if TEST.contains(&program.to_lowercase().as_str()) {
        return CommandClassification {
            kind: CommandKind::Test,
            confidence: 0.85,
            subcommand: sub.map(|s| s.to_string()),
            needs_pty: false,
            needs_confirmation: false,
            note: None,
        };
    }
    if BUILD.contains(&program.to_lowercase().as_str()) {
        return CommandClassification {
            kind: CommandKind::Build,
            confidence: 0.85,
            subcommand: sub.map(|s| s.to_string()),
            needs_pty: false,
            needs_confirmation: false,
            note: None,
        };
    }
    if LINT.contains(&program.to_lowercase().as_str()) {
        return CommandClassification {
            kind: CommandKind::Lint,
            confidence: 0.85,
            subcommand: sub.map(|s| s.to_string()),
            needs_pty: false,
            needs_confirmation: false,
            note: None,
        };
    }
    // 5) Network
    for kw in NETWORK {
        if program.eq_ignore_ascii_case(kw) {
            return CommandClassification {
                kind: CommandKind::Network,
                confidence: 0.9,
                subcommand: None,
                needs_pty: false,
                needs_confirmation: false,
                note: Some(format!("{} 可能发起网络请求", program)),
            };
        }
    }
    // 6) Database
    for kw in DATABASE {
        if program.eq_ignore_ascii_case(kw) {
            return CommandClassification {
                kind: CommandKind::Database,
                confidence: 0.85,
                subcommand: None,
                needs_pty: false,
                needs_confirmation: false,
                note: None,
            };
        }
    }
    // 7) Container
    for kw in CONTAINER {
        if program.eq_ignore_ascii_case(kw) {
            return CommandClassification {
                kind: CommandKind::Container,
                confidence: 0.85,
                subcommand: None,
                needs_pty: false,
                needs_confirmation: false,
                note: None,
            };
        }
    }
    // 8) Process
    for kw in PROCESS {
        if program.eq_ignore_ascii_case(kw) {
            let needs_pty = {
                let p = program.to_lowercase();
                p == "top" || p == "htop"
            };
            return CommandClassification {
                kind: CommandKind::Process,
                confidence: 0.8,
                subcommand: None,
                needs_pty,
                needs_confirmation: false,
                note: None,
            };
        }
    }
    // 9) FileOp
    for kw in FILE_OP {
        if program.eq_ignore_ascii_case(kw) {
            return CommandClassification {
                kind: CommandKind::FileOp,
                confidence: 0.8,
                subcommand: None,
                needs_pty: false,
                needs_confirmation: false,
                note: None,
            };
        }
    }

    // 兜底
    CommandClassification {
        kind: CommandKind::Unknown,
        confidence: 0.3,
        subcommand: None,
        needs_pty: false,
        needs_confirmation: false,
        note: Some(format!("未识别: {}", program)),
    }
}

const INTERACTIVE: &[&str] = &[
    "vim", "vi", "nano", "emacs", "less", "more", "man", "top", "htop", "btop", "ssh", "mysql", "psql", "redis-cli", "mongosh", "ftp", "sftp", "telnet",
];

const DANGER: &[&str] = &[
    "mkfs", "fdisk", "parted", "dd", "shutdown", "reboot", "halt", "poweroff", "init", "systemctl", "killall", "iptables", "firewall-cmd", "userdel", "groupdel",
];

const PACKAGE: &[&str] = &[
    "npm", "pnpm", "yarn", "bun", "deno", "cargo", "pip", "pip3", "pipx", "poetry", "uv", "gem", "brew", "apt", "apt-get", "yum", "dnf", "zypper", "pacman", "go", "rustup", "composer",
];

const TEST: &[&str] = &[
    "jest", "vitest", "mocha", "pytest", "tox", "nox", "phpunit", "rspec", "cargo test", "go test",
];

const BUILD: &[&str] = &[
    "make", "cmake", "ninja", "tsc", "ts-node", "esbuild", "vite", "webpack", "rollup", "parcel", "turbo", "swc", "babel", "gradle", "mvn", "ant", "sbt", "dotnet", "msbuild",
];

const LINT: &[&str] = &[
    "eslint", "prettier", "biome", "stylelint", "tslint", "shellcheck", "hadolint", "ruff", "flake8", "pylint", "mypy", "black", "isort", "gofmt", "golangci-lint", "cargo clippy", "cargo fmt",
];

const NETWORK: &[&str] = &["curl", "wget", "httpie", "http", "nc", "netcat", "ncat", "rsync", "scp"];

const DATABASE: &[&str] = &["mysql", "psql", "pg_dump", "psql", "mongo", "mongosh", "redis-cli", "sqlite3", "influx"];

const CONTAINER: &[&str] = &["docker", "docker-compose", "podman", "kubectl", "helm", "k9s", "ctr", "crictl"];

const PROCESS: &[&str] = &["ps", "top", "htop", "btop", "pgrep", "pkill", "kill", "killall", "systemctl", "service", "launchctl"];

const FILE_OP: &[&str] = &["cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown", "ln", "tar", "zip", "unzip", "rsync"];

/// 检测 `rm -rf` 是否指向根目录/家目录/上级目录
fn is_dangerous_rm(line: &str) -> bool {
    let lower = line.to_lowercase();
    if !lower.contains("rm ") {
        return false;
    }
    let dangerous_targets = [
        " /", " /*", " ~", " ~/*", " .", " ./", " ..", " ../", " $home", " $HOME",
    ];
    dangerous_targets
        .iter()
        .any(|t| lower.contains(t) || line.contains(t))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_classified_as_git() {
        let c = classify("git status");
        assert_eq!(c.kind, CommandKind::Git);
        assert_eq!(c.subcommand.as_deref(), Some("status"));
    }

    #[test]
    fn vim_is_interactive() {
        let c = classify("vim README.md");
        assert_eq!(c.kind, CommandKind::Interactive);
        assert!(c.needs_pty);
    }

    #[test]
    fn npm_install_is_package() {
        let c = classify("npm install react");
        assert_eq!(c.kind, CommandKind::Package);
    }

    #[test]
    fn cargo_test_is_test() {
        let c = classify("cargo test --workspace");
        assert_eq!(c.kind, CommandKind::Test);
    }

    #[test]
    fn curl_is_network() {
        let c = classify("curl https://example.com");
        assert_eq!(c.kind, CommandKind::Network);
    }

    #[test]
    fn dd_is_danger() {
        let c = classify("dd if=/dev/zero of=/dev/sda");
        assert_eq!(c.kind, CommandKind::Danger);
        assert!(c.needs_confirmation);
    }

    #[test]
    fn rm_rf_root_is_danger() {
        let c = classify("rm -rf /");
        assert_eq!(c.kind, CommandKind::Danger);
    }

    #[test]
    fn rm_rf_subdir_not_danger() {
        let c = classify("rm -rf build");
        assert_ne!(c.kind, CommandKind::Danger);
    }

    #[test]
    fn docker_is_container() {
        let c = classify("docker compose up -d");
        assert_eq!(c.kind, CommandKind::Container);
    }

    #[test]
    fn empty_line_is_unknown() {
        let c = classify("");
        assert_eq!(c.kind, CommandKind::Unknown);
    }

    #[test]
    fn arbitrary_command_is_unknown() {
        let c = classify("xyzzy --foo");
        assert_eq!(c.kind, CommandKind::Unknown);
    }

    #[test]
    fn ps_is_process() {
        let c = classify("ps aux");
        assert_eq!(c.kind, CommandKind::Process);
    }
}
