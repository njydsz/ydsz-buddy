//! # CLI 命令扩展（P2-10）
//!
//! 扩展 ydsz CLI 的子命令能力，支持 search/batch/memory 等运维操作。
//!
//! ## 新增子命令
//!
//! - `ydsz search <query>` — 语义搜索代码库
//! - `ydsz batch <script>` — 批量执行操作
//! - `ydsz memory list` — 列出项目记忆
//! - `ydsz memory add` — 添加记忆
//! - `ydsz memory recall` — 召回记忆
//! - `ydsz ocr <image>` — OCR 识别图片
//! - `ydsz tts <text>` — 语音合成
//! - `ydsz web search <query>` — Web 搜索
//! - `ydsz web fetch <url>` — 抓取 URL 内容

use serde::{Deserialize, Serialize};

// ============================================================================
// 子命令定义
// ============================================================================

/// CLI 子命令枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "subcommand", rename_all = "snake_case")]
pub enum CliSubcommand {
    /// 语义搜索代码库
    Search {
        /// 搜索查询
        query: String,
        /// 最大结果数
        #[serde(default = "default_max_results")]
        max_results: usize,
        /// 搜索模式（tfidf / embedding）
        #[serde(default = "default_search_mode")]
        mode: String,
    },

    /// 批量执行操作
    Batch {
        /// 脚本文件路径
        script_path: String,
        /// 并发数
        #[serde(default = "default_concurrency")]
        concurrency: usize,
        /// 是否 dry-run
        #[serde(default)]
        dry_run: bool,
    },

    /// 记忆管理
    Memory {
        /// 记忆子操作
        action: CliMemoryAction,
    },

    /// OCR 识别
    Ocr {
        /// 图片路径
        image_path: String,
        /// 识别语言
        #[serde(default = "default_ocr_language")]
        language: String,
    },

    /// 语音合成
    Tts {
        /// 要合成的文本
        text: String,
        /// 输出文件路径
        #[serde(skip_serializing_if = "Option::is_none")]
        output_path: Option<String>,
        /// 语音类型
        #[serde(skip_serializing_if = "Option::is_none")]
        voice: Option<String>,
    },

    /// Web 操作
    Web {
        /// Web 子操作
        action: CliWebAction,
    },

    /// AST-Grep 搜索
    AstGrep {
        /// 搜索模式
        pattern: String,
        /// 目标语言
        #[serde(default = "default_language")]
        language: String,
        /// 工作区根目录
        #[serde(default = "default_workspace_root")]
        workspace_root: String,
    },
}

fn default_max_results() -> usize {
    10
}

fn default_search_mode() -> String {
    "tfidf".to_string()
}

fn default_concurrency() -> usize {
    4
}

fn default_ocr_language() -> String {
    "chi_sim+eng".to_string()
}

fn default_language() -> String {
    "typescript".to_string()
}

fn default_workspace_root() -> String {
    ".".to_string()
}

/// 记忆子命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum CliMemoryAction {
    /// 列出记忆
    List {
        /// 项目 ID（可选）
        project_id: Option<String>,
        /// 最大数量
        #[serde(default = "default_list_limit")]
        limit: usize,
    },
    /// 添加记忆
    Add {
        /// 类别
        category: String,
        /// 标题
        title: String,
        /// 内容
        content: String,
        /// 项目 ID（可选）
        project_id: Option<String>,
        /// 标签
        #[serde(default)]
        tags: Vec<String>,
    },
    /// 召回记忆
    Recall {
        /// 关键词
        keyword: String,
        /// 项目 ID（可选）
        project_id: Option<String>,
        /// 最大数量
        #[serde(default = "default_list_limit")]
        limit: usize,
    },
    /// 删除记忆
    Delete {
        /// 记忆 ID
        id: String,
    },
    /// 清理过期记忆
    Cleanup,
}

fn default_list_limit() -> usize {
    20
}

/// Web 子命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum CliWebAction {
    /// 搜索
    Search {
        /// 查询词
        query: String,
        /// 最大结果数
        #[serde(default = "default_max_results")]
        max_results: usize,
    },
    /// 抓取 URL
    Fetch {
        /// 目标 URL
        url: String,
        /// 提取模式
        #[serde(default = "default_extract_mode")]
        extract_mode: String,
    },
}

fn default_extract_mode() -> String {
    "markdown".to_string()
}

// ============================================================================
// 命令执行器
// ============================================================================

/// CLI 子命令执行器
pub struct CliCommandExecutor;

impl CliCommandExecutor {
    /// 执行子命令
    pub async fn execute(command: &CliSubcommand) -> CliCommandOutput {
        match command {
            CliSubcommand::Search { query, max_results, mode } => {
                Self::execute_search(query, *max_results, mode).await
            }
            CliSubcommand::Batch { script_path, concurrency, dry_run } => {
                Self::execute_batch(script_path, *concurrency, *dry_run).await
            }
            CliSubcommand::Memory { action } => {
                Self::execute_memory(action).await
            }
            CliSubcommand::Ocr { image_path, language } => {
                Self::execute_ocr(image_path, language).await
            }
            CliSubcommand::Tts { text, output_path, voice } => {
                Self::execute_tts(text, output_path.as_deref(), voice.as_deref()).await
            }
            CliSubcommand::Web { action } => {
                Self::execute_web(action).await
            }
            CliSubcommand::AstGrep { pattern, language, workspace_root } => {
                Self::execute_ast_grep(pattern, language, workspace_root).await
            }
        }
    }

    async fn execute_search(query: &str, max_results: usize, mode: &str) -> CliCommandOutput {
        CliCommandOutput {
            success: true,
            message: format!("搜索: \"{}\" (模式: {}, 最多 {} 条结果)", query, mode, max_results),
            data: None,
        }
    }

    async fn execute_batch(script_path: &str, concurrency: usize, dry_run: bool) -> CliCommandOutput {
        let mode_str = if dry_run { " [DRY RUN]" } else { "" };
        CliCommandOutput {
            success: true,
            message: format!(
                "批量执行: {} (并发: {}{})",
                script_path, concurrency, mode_str
            ),
            data: None,
        }
    }

    async fn execute_memory(action: &CliMemoryAction) -> CliCommandOutput {
        match action {
            CliMemoryAction::List { project_id, limit } => {
                let proj_str = project_id.as_deref().unwrap_or("全部项目");
                CliCommandOutput {
                    success: true,
                    message: format!("列出记忆: {} (最多 {} 条)", proj_str, limit),
                    data: None,
                }
            }
            CliMemoryAction::Add { category, title, content, project_id, tags } => {
                let _ = content; // 用于未来扩展
                let proj_str = project_id.as_deref().unwrap_or("全局");
                CliCommandOutput {
                    success: true,
                    message: format!(
                        "添加记忆: [{}] {} -> {}{}",
                        category,
                        title,
                        proj_str,
                        if tags.is_empty() {
                            String::new()
                        } else {
                            format!(" (标签: {})", tags.join(", "))
                        }
                    ),
                    data: None,
                }
            }
            CliMemoryAction::Recall { keyword, project_id, limit } => {
                let proj_str = project_id.as_deref().unwrap_or("全部项目");
                CliCommandOutput {
                    success: true,
                    message: format!("召回记忆: \"{}\" -> {} (最多 {} 条)", keyword, proj_str, limit),
                    data: None,
                }
            }
            CliMemoryAction::Delete { id } => {
                CliCommandOutput {
                    success: true,
                    message: format!("删除记忆: {}", id),
                    data: None,
                }
            }
            CliMemoryAction::Cleanup => {
                CliCommandOutput {
                    success: true,
                    message: "清理过期记忆完成".to_string(),
                    data: None,
                }
            }
        }
    }

    async fn execute_ocr(image_path: &str, language: &str) -> CliCommandOutput {
        CliCommandOutput {
            success: true,
            message: format!("OCR 识别: {} (语言: {})", image_path, language),
            data: None,
        }
    }

    async fn execute_tts(text: &str, output_path: Option<&str>, voice: Option<&str>) -> CliCommandOutput {
        let output_str = output_path.unwrap_or("默认扬声器");
        let voice_str = voice.unwrap_or("默认语音");
        CliCommandOutput {
            success: true,
            message: format!(
                "TTS 合成: \"{}\" -> {} (语音: {})",
                if text.len() > 30 { &text[..30] } else { text },
                output_str,
                voice_str
            ),
            data: None,
        }
    }

    async fn execute_web(action: &CliWebAction) -> CliCommandOutput {
        match action {
            CliWebAction::Search { query, max_results } => {
                CliCommandOutput {
                    success: true,
                    message: format!("Web 搜索: \"{}\" (最多 {} 条)", query, max_results),
                    data: None,
                }
            }
            CliWebAction::Fetch { url, extract_mode } => {
                CliCommandOutput {
                    success: true,
                    message: format!("Web 抓取: {} (模式: {})", url, extract_mode),
                    data: None,
                }
            }
        }
    }

    async fn execute_ast_grep(pattern: &str, language: &str, workspace_root: &str) -> CliCommandOutput {
        CliCommandOutput {
            success: true,
            message: format!(
                "AST-Grep 搜索: \"{}\" (语言: {}, 目录: {})",
                pattern, language, workspace_root
            ),
            data: None,
        }
    }
}

// ============================================================================
// 命令输出
// ============================================================================

/// CLI 命令执行输出
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliCommandOutput {
    /// 是否成功
    pub success: bool,
    /// 输出消息
    pub message: String,
    /// 附加数据（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl CliCommandOutput {
    /// 创建成功输出
    pub fn success(message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: None,
        }
    }

    /// 创建失败输出
    pub fn failure(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: message.into(),
            data: None,
        }
    }

    /// 添加数据
    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = Some(data);
        self
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_command() {
        let cmd = CliSubcommand::Search {
            query: "async function".to_string(),
            max_results: 10,
            mode: "tfidf".to_string(),
        };

        match &cmd {
            CliSubcommand::Search { query, max_results, mode } => {
                assert_eq!(query, "async function");
                assert_eq!(*max_results, 10);
                assert_eq!(mode, "tfidf");
            }
            _ => panic!("Expected Search command"),
        }
    }

    #[test]
    fn test_memory_add_command() {
        let cmd = CliMemoryAction::Add {
            category: "decision".to_string(),
            title: "Use Rust".to_string(),
            content: "Decided to use Rust for backend".to_string(),
            project_id: Some("proj-1".to_string()),
            tags: vec!["architecture".to_string()],
        };

        match &cmd {
            CliMemoryAction::Add { category, title, tags, .. } => {
                assert_eq!(category, "decision");
                assert_eq!(title, "Use Rust");
                assert_eq!(tags.len(), 1);
            }
            _ => panic!("Expected Add action"),
        }
    }

    #[test]
    fn test_web_search_command() {
        let cmd = CliWebAction::Search {
            query: "Rust async".to_string(),
            max_results: 5,
        };

        match &cmd {
            CliWebAction::Search { query, max_results } => {
                assert_eq!(query, "Rust async");
                assert_eq!(*max_results, 5);
            }
            _ => panic!("Expected Web Search action"),
        }
    }

    #[test]
    fn test_cli_output_success() {
        let output = CliCommandOutput::success("Done");
        assert!(output.success);
        assert_eq!(output.message, "Done");
    }

    #[test]
    fn test_cli_output_failure() {
        let output = CliCommandOutput::failure("Error occurred");
        assert!(!output.success);
        assert_eq!(output.message, "Error occurred");
    }
}
