//! # Build/Test Runner 集成（Code 域能力）
//!
//! 提供自动检测项目类型并执行构建/测试的能力：
//!
//! - [`BuildRunner`] — 构建测试运行器
//! - [`detect_project_type`] — 检测项目类型
//! - [`ProjectType`] — 项目类型枚举
//! - [`BuildResult`] — 构建/测试结果
//!
//! ## 设计
//!
//! - 自动检测项目类型（Rust / Node / Python / Go 等）
//! - 根据项目类型选择正确的构建/测试命令
//! - 支持自定义命令覆盖
//! - 复用 `CommandExecutor` 执行命令

use std::path::Path;

use serde::{Deserialize, Serialize};
use tracing::info;

use crate::runner::{CommandExecutor, CommandResult, ExecutorConfig};

/// 项目类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectType {
    /// Rust (Cargo)
    Rust,
    /// Node.js (npm / yarn / pnpm)
    Node,
    /// Python (pytest / unittest)
    Python,
    /// Go (go build / go test)
    Go,
    /// Java (Maven / Gradle)
    Java,
    /// C/C++ (make / cmake)
    Cpp,
    /// 未知类型
    Unknown,
}

impl ProjectType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Rust => "rust",
            Self::Node => "node",
            Self::Python => "python",
            Self::Go => "go",
            Self::Java => "java",
            Self::Cpp => "cpp",
            Self::Unknown => "unknown",
        }
    }
}

/// 构建命令配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildCommands {
    /// 构建命令
    pub build: String,
    /// 测试命令
    pub test: String,
    /// lint 命令
    pub lint: Option<String>,
    /// 格式化检查命令
    pub format_check: Option<String>,
}

/// 构建/测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildResult {
    /// 项目类型
    pub project_type: String,
    /// 执行的操作（build / test / lint）
    pub action: String,
    /// 执行的命令
    pub command: String,
    /// 退出码
    pub exit_code: i32,
    /// 标准输出
    pub stdout: String,
    /// 标准错误
    pub stderr: String,
    /// 执行时长（毫秒）
    pub duration_ms: u64,
    /// 是否成功
    pub success: bool,
    /// 是否超时
    pub timed_out: bool,
}

impl BuildResult {
    fn from_cmd(result: CommandResult, project_type: &str, action: &str) -> Self {
        let success = result.is_success();
        Self {
            project_type: project_type.to_string(),
            action: action.to_string(),
            command: result.command,
            exit_code: result.exit_code,
            stdout: result.stdout,
            stderr: result.stderr,
            duration_ms: result.duration_ms,
            success,
            timed_out: result.timed_out,
        }
    }
}

/// 检测项目类型
///
/// 根据工作区根目录中的标志性文件推断项目类型。
pub fn detect_project_type(workspace: &str) -> ProjectType {
    let path = Path::new(workspace);

    // Rust: Cargo.toml
    if path.join("Cargo.toml").exists() {
        return ProjectType::Rust;
    }

    // Node: package.json
    if path.join("package.json").exists() {
        return ProjectType::Node;
    }

    // Python: setup.py / pyproject.toml / requirements.txt
    if path.join("setup.py").exists()
        || path.join("pyproject.toml").exists()
        || path.join("requirements.txt").exists()
    {
        return ProjectType::Python;
    }

    // Go: go.mod
    if path.join("go.mod").exists() {
        return ProjectType::Go;
    }

    // Java: pom.xml (Maven) / build.gradle (Gradle)
    if path.join("pom.xml").exists() || path.join("build.gradle").exists() {
        return ProjectType::Java;
    }

    // C/C++: Makefile / CMakeLists.txt
    if path.join("Makefile").exists() || path.join("CMakeLists.txt").exists() {
        return ProjectType::Cpp;
    }

    ProjectType::Unknown
}

/// 获取项目类型的默认构建命令
pub fn default_commands(project_type: ProjectType) -> BuildCommands {
    match project_type {
        ProjectType::Rust => BuildCommands {
            build: "cargo build".into(),
            test: "cargo test".into(),
            lint: Some("cargo clippy".into()),
            format_check: Some("cargo fmt --check".into()),
        },
        ProjectType::Node => BuildCommands {
            build: "npm run build".into(),
            test: "npm test".into(),
            lint: Some("npm run lint".into()),
            format_check: Some("npx prettier --check .".into()),
        },
        ProjectType::Python => BuildCommands {
            build: "python -m build".into(),
            test: "python -m pytest".into(),
            lint: Some("ruff check .".into()),
            format_check: Some("ruff format --check .".into()),
        },
        ProjectType::Go => BuildCommands {
            build: "go build ./...".into(),
            test: "go test ./...".into(),
            lint: Some("golangci-lint run".into()),
            format_check: Some("gofmt -l .".into()),
        },
        ProjectType::Java => {
            // 检测 Maven vs Gradle
            let has_maven = Path::new("pom.xml").exists();
            if has_maven {
                BuildCommands {
                    build: "mvn compile".into(),
                    test: "mvn test".into(),
                    lint: None,
                    format_check: None,
                }
            } else {
                BuildCommands {
                    build: "gradle build -x test".into(),
                    test: "gradle test".into(),
                    lint: None,
                    format_check: None,
                }
            }
        }
        ProjectType::Cpp => {
            let has_cmake = Path::new("CMakeLists.txt").exists();
            if has_cmake {
                BuildCommands {
                    build: "cmake --build build".into(),
                    test: "ctest --test-dir build".into(),
                    lint: None,
                    format_check: None,
                }
            } else {
                BuildCommands {
                    build: "make".into(),
                    test: "make test".into(),
                    lint: None,
                    format_check: None,
                }
            }
        }
        ProjectType::Unknown => BuildCommands {
            build: "make".into(),
            test: "make test".into(),
            lint: None,
            format_check: None,
        },
    }
}

/// Build/Test Runner
///
/// 自动检测项目类型并执行构建/测试命令。
pub struct BuildRunner {
    executor: CommandExecutor,
}

impl Default for BuildRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl BuildRunner {
    /// 创建新的 Build Runner（5 分钟超时）
    pub fn new() -> Self {
        Self {
            executor: CommandExecutor::new(ExecutorConfig {
                timeout: std::time::Duration::from_secs(300),
                ..Default::default()
            }),
        }
    }

    /// 执行构建
    pub async fn build(&self, workspace: &str) -> BuildResult {
        let ptype = detect_project_type(workspace);
        let cmds = default_commands(ptype);
        info!(workspace = %workspace, ptype = ptype.as_str(), "执行构建");
        let result = self
            .executor
            .execute(&cmds.build, Some(workspace), None, None)
            .await
            .unwrap_or_else(|e| CommandResult {
                command: cmds.build.clone(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("构建执行失败: {e}"),
                duration_ms: 0,
                timed_out: false,
            });
        BuildResult::from_cmd(result, ptype.as_str(), "build")
    }

    /// 执行测试
    pub async fn test(&self, workspace: &str) -> BuildResult {
        let ptype = detect_project_type(workspace);
        let cmds = default_commands(ptype);
        info!(workspace = %workspace, ptype = ptype.as_str(), "执行测试");
        let result = self
            .executor
            .execute(&cmds.test, Some(workspace), None, None)
            .await
            .unwrap_or_else(|e| CommandResult {
                command: cmds.test.clone(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("测试执行失败: {e}"),
                duration_ms: 0,
                timed_out: false,
            });
        BuildResult::from_cmd(result, ptype.as_str(), "test")
    }

    /// 执行 lint
    pub async fn lint(&self, workspace: &str) -> Option<BuildResult> {
        let ptype = detect_project_type(workspace);
        let cmds = default_commands(ptype);
        let lint_cmd = cmds.lint?;
        info!(workspace = %workspace, ptype = ptype.as_str(), "执行 lint");
        let result = self
            .executor
            .execute(&lint_cmd, Some(workspace), None, None)
            .await
            .unwrap_or_else(|e| CommandResult {
                command: lint_cmd.clone(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("lint 执行失败: {e}"),
                duration_ms: 0,
                timed_out: false,
            });
        Some(BuildResult::from_cmd(result, ptype.as_str(), "lint"))
    }

    /// 执行格式化检查
    pub async fn format_check(&self, workspace: &str) -> Option<BuildResult> {
        let ptype = detect_project_type(workspace);
        let cmds = default_commands(ptype);
        let fmt_cmd = cmds.format_check?;
        info!(workspace = %workspace, ptype = ptype.as_str(), "执行格式化检查");
        let result = self
            .executor
            .execute(&fmt_cmd, Some(workspace), None, None)
            .await
            .unwrap_or_else(|e| CommandResult {
                command: fmt_cmd.clone(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("格式化检查执行失败: {e}"),
                duration_ms: 0,
                timed_out: false,
            });
        Some(BuildResult::from_cmd(result, ptype.as_str(), "format_check"))
    }

    /// 执行自定义命令
    pub async fn run_custom(&self, workspace: &str, command: &str) -> BuildResult {
        let ptype = detect_project_type(workspace);
        info!(workspace = %workspace, command = %command, "执行自定义命令");
        let result = self
            .executor
            .execute(command, Some(workspace), None, None)
            .await
            .unwrap_or_else(|e| CommandResult {
                command: command.to_string(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("命令执行失败: {e}"),
                duration_ms: 0,
                timed_out: false,
            });
        BuildResult::from_cmd(result, ptype.as_str(), "custom")
    }

    /// 一键全流程：build → test → lint
    pub async fn run_all(&self, workspace: &str) -> Vec<BuildResult> {
        let mut results = Vec::new();

        // build
        let build_result = self.build(workspace).await;
        let build_ok = build_result.success;
        results.push(build_result);

        // test（即使 build 失败也尝试 test）
        let test_result = self.test(workspace).await;
        results.push(test_result);

        // lint
        if let Some(lint_result) = self.lint(workspace).await {
            results.push(lint_result);
        }

        let _ = build_ok; // build 失败不阻止后续步骤
        results
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_project_type_rust() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "[package]\nname = \"test\"\n").unwrap();
        assert_eq!(detect_project_type(dir.path().to_str().unwrap()), ProjectType::Rust);
    }

    #[test]
    fn test_detect_project_type_node() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), "{}").unwrap();
        assert_eq!(detect_project_type(dir.path().to_str().unwrap()), ProjectType::Node);
    }

    #[test]
    fn test_detect_project_type_python() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("pyproject.toml"), "[project]\n").unwrap();
        assert_eq!(detect_project_type(dir.path().to_str().unwrap()), ProjectType::Python);
    }

    #[test]
    fn test_detect_project_type_go() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("go.mod"), "module test\n").unwrap();
        assert_eq!(detect_project_type(dir.path().to_str().unwrap()), ProjectType::Go);
    }

    #[test]
    fn test_detect_project_type_unknown() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(detect_project_type(dir.path().to_str().unwrap()), ProjectType::Unknown);
    }

    #[test]
    fn test_default_commands_rust() {
        let cmds = default_commands(ProjectType::Rust);
        assert!(cmds.build.contains("cargo build"));
        assert!(cmds.test.contains("cargo test"));
        assert!(cmds.lint.is_some());
        assert!(cmds.format_check.is_some());
    }

    #[test]
    fn test_default_commands_node() {
        let cmds = default_commands(ProjectType::Node);
        assert!(cmds.build.contains("npm run build"));
        assert!(cmds.test.contains("npm test"));
    }

    #[test]
    fn test_default_commands_python() {
        let cmds = default_commands(ProjectType::Python);
        assert!(cmds.test.contains("pytest"));
    }

    #[test]
    fn test_default_commands_go() {
        let cmds = default_commands(ProjectType::Go);
        assert!(cmds.build.contains("go build"));
        assert!(cmds.test.contains("go test"));
    }

    #[test]
    fn test_default_commands_unknown() {
        let cmds = default_commands(ProjectType::Unknown);
        assert!(!cmds.build.is_empty());
        assert!(!cmds.test.is_empty());
    }

    #[test]
    fn test_project_type_as_str() {
        assert_eq!(ProjectType::Rust.as_str(), "rust");
        assert_eq!(ProjectType::Node.as_str(), "node");
        assert_eq!(ProjectType::Unknown.as_str(), "unknown");
    }

    #[tokio::test]
    async fn test_build_runner_build_rust() {
        // 在本 crate 自身目录上运行 cargo build --check（快速）
        let runner = BuildRunner::new();
        let result = runner.build(".").await;
        assert_eq!(result.project_type, "rust");
        assert_eq!(result.action, "build");
        // 可能成功也可能失败取决于环境，但应返回有效结构
        assert!(!result.command.is_empty());
    }

    #[tokio::test]
    async fn test_build_runner_run_custom() {
        let runner = BuildRunner::new();
        let result = runner.run_custom(".", "echo hello").await;
        assert!(result.success);
        assert!(result.stdout.contains("hello"));
    }

    #[tokio::test]
    async fn test_build_runner_run_all() {
        let runner = BuildRunner::new();
        let results = runner.run_all(".").await;
        assert!(!results.is_empty());
        // 至少包含 build 和 test
        assert!(results.iter().any(|r| r.action == "build"));
        assert!(results.iter().any(|r| r.action == "test"));
    }
}
