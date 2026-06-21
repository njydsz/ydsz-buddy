//! 终端标题追踪模块
//!
//! 本模块提供终端会话标题/描述的追踪功能，支持从终端输出内容中
//! 自动推断标题（如识别运行中的命令），也支持手动设置标题。

use std::collections::HashMap;
use std::sync::RwLock;

/// 终端标题追踪器
///
/// 维护终端会话 ID 到标题字符串的映射，支持手动设置标题和从输出内容推断标题。
/// 内部使用 `RwLock<HashMap>` 保证线程安全，适合通过 `Arc` 在多处共享使用。
pub struct TerminalTitleTracker {
    titles: RwLock<HashMap<String, String>>,
}

impl TerminalTitleTracker {
    /// 创建新的终端标题追踪器
    pub fn new() -> Self {
        Self {
            titles: RwLock::new(HashMap::new()),
        }
    }

    /// 设置指定会话的标题
    ///
    /// # 参数
    ///
    /// - `session_id`: 终端会话 ID
    /// - `title`: 标题字符串
    pub fn update_title(&self, session_id: &str, title: &str) {
        let mut titles = self.titles.write().expect("RwLock poisoned");
        titles.insert(session_id.to_string(), title.to_string());
    }

    /// 获取指定会话的标题
    ///
    /// # 参数
    ///
    /// - `session_id`: 终端会话 ID
    ///
    /// # 返回值
    ///
    /// 返回标题字符串的克隆，如果不存在则返回 `None`
    pub fn get_title(&self, session_id: &str) -> Option<String> {
        let titles = self.titles.read().expect("RwLock poisoned");
        titles.get(session_id).cloned()
    }

    /// 从终端输出中推断标题
    ///
    /// 通过扫描输出内容中的常见命令模式来推测当前运行的命令。
    /// 支持检测的命令包括：
    ///
    /// - `npm run` / `yarn` / `pnpm` / `npx`
    /// - `cargo build` / `cargo run` / `cargo test`
    /// - `git commit` / `git push` / `git pull` / `git clone`
    /// - `python` / `python3`
    /// - `make`
    /// - `docker` / `docker-compose`
    /// - `go build` / `go run` / `go test`
    ///
    /// 如果找不到匹配的命令，则返回 `None`（不更新标题）。
    ///
    /// # 参数
    ///
    /// - `session_id`: 终端会话 ID
    /// - `output_text`: 终端输出文本
    ///
    /// # 返回值
    ///
    /// 如果成功推断出标题，返回 `Some(title)`，否则返回 `None`
    pub fn infer_title_from_output(
        &self,
        session_id: &str,
        output_text: &str,
    ) -> Option<String> {
        let title = Self::extract_title(output_text)?;
        self.update_title(session_id, &title);
        Some(title)
    }

    /// 从输出文本中提取标题（不修改内部状态）
    fn extract_title(output_text: &str) -> Option<String> {
        let text = output_text.trim();

        // 按行分割，取最后几行中可能包含命令的行
        let lines: Vec<&str> = text.lines().collect();

        // 常见的命令前缀模式
        let patterns: &[(&str, &str)] = &[
            ("npm run", "npm run"),
            ("npm install", "npm install"),
            ("npm test", "npm test"),
            ("npm build", "npm build"),
            ("npm start", "npm start"),
            ("npx", "npx"),
            ("yarn", "yarn"),
            ("pnpm", "pnpm"),
            ("cargo build", "cargo build"),
            ("cargo run", "cargo run"),
            ("cargo test", "cargo test"),
            ("cargo check", "cargo check"),
            ("cargo clippy", "cargo clippy"),
            ("cargo fmt", "cargo fmt"),
            ("git commit", "git commit"),
            ("git push", "git push"),
            ("git pull", "git pull"),
            ("git clone", "git clone"),
            ("git checkout", "git checkout"),
            ("git merge", "git merge"),
            ("git rebase", "git rebase"),
            ("git add", "git add"),
            ("git status", "git status"),
            ("git log", "git log"),
            ("git diff", "git diff"),
            ("python3", "python3"),
            ("python", "python"),
            ("pip install", "pip install"),
            ("pip3 install", "pip3 install"),
            ("make", "make"),
            ("cmake", "cmake"),
            ("docker-compose", "docker-compose"),
            ("docker build", "docker build"),
            ("docker run", "docker run"),
            ("docker", "docker"),
            ("go build", "go build"),
            ("go run", "go run"),
            ("go test", "go test"),
            ("go mod", "go mod"),
            ("rustc", "rustc"),
            ("node", "node"),
            ("tsc", "tsc"),
            ("eslint", "eslint"),
            ("prettier", "prettier"),
            ("jest", "jest"),
            ("vitest", "vitest"),
            ("mocha", "mocha"),
            ("gradle", "gradle"),
            ("mvn", "mvn"),
            ("javac", "javac"),
            ("gcc", "gcc"),
            ("g++", "g++"),
            ("clang", "clang"),
            ("./configure", "./configure"),
            ("curl", "curl"),
            ("wget", "wget"),
            ("ssh", "ssh"),
            ("scp", "scp"),
            ("rsync", "rsync"),
            ("tar", "tar"),
            ("unzip", "unzip"),
            ("zip", "zip"),
        ];

        // 先检查每一行是否包含已知命令
        for line in lines.iter().rev() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            for (prefix, title) in patterns {
                if let Some(rest) = trimmed.strip_prefix(prefix) {
                    // 尝试提取更多上下文：命令后的参数
                    let rest = rest.trim();
                    if rest.is_empty() {
                        return Some(title.to_string());
                    }
                    // 取第一个参数作为补充信息
                    let first_arg = rest.split_whitespace().next().unwrap_or("");
                    if first_arg.is_empty() {
                        return Some(title.to_string());
                    }
                    return Some(format!("{} {}", title, first_arg));
                }
            }
        }

        // 如果逐行检查没有匹配，尝试在整个文本中搜索
        for (prefix, title) in patterns {
            if let Some(pos) = text.find(prefix) {
                let rest = text[pos + prefix.len()..].trim();
                let first_arg = rest.split_whitespace().next().unwrap_or("");
                if first_arg.is_empty() {
                    return Some(title.to_string());
                }
                return Some(format!("{} {}", title, first_arg));
            }
        }

        None
    }

    /// 移除指定会话的标题记录
    ///
    /// # 参数
    ///
    /// - `session_id`: 终端会话 ID
    pub fn remove_session(&self, session_id: &str) {
        let mut titles = self.titles.write().expect("RwLock poisoned");
        titles.remove(session_id);
    }
}

impl Default for TerminalTitleTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_and_get_title() {
        let tracker = TerminalTitleTracker::new();
        tracker.update_title("session-1", "Building...");
        assert_eq!(tracker.get_title("session-1"), Some("Building...".to_string()));
        assert_eq!(tracker.get_title("nonexistent"), None);
    }

    #[test]
    fn test_remove_session() {
        let tracker = TerminalTitleTracker::new();
        tracker.update_title("session-1", "Building...");
        tracker.remove_session("session-1");
        assert_eq!(tracker.get_title("session-1"), None);
    }

    #[test]
    fn test_infer_npm_run() {
        let tracker = TerminalTitleTracker::new();
        let result = tracker.infer_title_from_output("s1", "npm run dev");
        assert_eq!(result, Some("npm run dev".to_string()));
        assert_eq!(tracker.get_title("s1"), Some("npm run dev".to_string()));
    }

    #[test]
    fn test_infer_cargo_build() {
        let tracker = TerminalTitleTracker::new();
        let result = tracker.infer_title_from_output("s1", "cargo build --release");
        assert_eq!(result, Some("cargo build --release".to_string()));
    }

    #[test]
    fn test_infer_git_commit() {
        let tracker = TerminalTitleTracker::new();
        let result = tracker.infer_title_from_output("s1", "git commit -m 'fix bug'");
        assert_eq!(result, Some("git commit -m".to_string()));
    }

    #[test]
    fn test_infer_from_multiline_output() {
        let tracker = TerminalTitleTracker::new();
        let output = "Compiling...\nFinished dev\nnpm run build";
        let result = tracker.infer_title_from_output("s1", output);
        assert_eq!(result, Some("npm run build".to_string()));
    }

    #[test]
    fn test_infer_no_match() {
        let tracker = TerminalTitleTracker::new();
        let result = tracker.infer_title_from_output("s1", "hello world");
        assert_eq!(result, None);
    }

    #[test]
    fn test_title_is_thread_safe() {
        use std::sync::Arc;
        use std::thread;

        let tracker = Arc::new(TerminalTitleTracker::new());
        let t1 = tracker.clone();
        let t2 = tracker.clone();

        let h1 = thread::spawn(move || {
            for i in 0..100 {
                t1.update_title(&format!("s{}", i), &format!("title-{}", i));
            }
        });

        let h2 = thread::spawn(move || {
            for i in 0..100 {
                t2.update_title(&format!("s{}", i), &format!("title-{}", i));
            }
        });

        h1.join().unwrap();
        h2.join().unwrap();

        for i in 0..100 {
            assert!(tracker.get_title(&format!("s{}", i)).is_some());
        }
    }
}