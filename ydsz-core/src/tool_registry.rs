//! # 工具注册表与模式过滤（P1-7）
//!
//! 根据 `RuntimeMode` 过滤可用工具，确保 Work 模式和 Code 模式只暴露各自域的工具。
//!
//! ## 设计
//!
//! - 每个工具声明其所属域（Work / Code / Shared）
//! - 运行时根据当前 `RuntimeMode` 过滤工具列表
//! - 支持动态注册自定义工具

use std::collections::HashMap;

use crate::models::RuntimeMode;
use serde::{Deserialize, Serialize};

/// 工具域归属
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolDomain {
    /// Work 域工具（搜索、Office、浏览器、数据分析、调度）
    Work,
    /// Code 域工具（命令执行、索引、LSP、Git、多文件编辑）
    Code,
    /// 共享工具（文件操作、OCR、MCP 等）
    Shared,
}

/// 工具描述
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDescriptor {
    /// 工具名称（如 "search_web"）
    pub name: String,
    /// 工具域
    pub domain: ToolDomain,
    /// 工具描述
    pub description: String,
    /// 参数 JSON Schema（简化）
    pub parameters: serde_json::Value,
}

/// 工具注册表
///
/// 维护所有工具的元信息，支持按模式过滤。
pub struct ToolRegistry {
    tools: HashMap<String, ToolDescriptor>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolRegistry {
    /// 创建空注册表
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// 创建包含所有内置工具的注册表
    pub fn with_builtin_tools() -> Self {
        let mut registry = Self::new();

        // === Work 域工具 ===
        registry.register(ToolDescriptor {
            name: "search_web".into(),
            domain: ToolDomain::Work,
            description: "执行网页搜索".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "搜索查询" }
                },
                "required": ["query"]
            }),
        });

        registry.register(ToolDescriptor {
            name: "search_fetch_url".into(),
            domain: ToolDomain::Work,
            description: "抓取 URL 内容".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "URL" }
                },
                "required": ["url"]
            }),
        });

        registry.register(ToolDescriptor {
            name: "search_fetch_url_summary".into(),
            domain: ToolDomain::Work,
            description: "抓取 URL 摘要".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string" }
                },
                "required": ["url"]
            }),
        });

        registry.register(ToolDescriptor {
            name: "browser_click".into(),
            domain: ToolDomain::Work,
            description: "点击浏览器元素".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "selector": { "type": "string" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "browser_fill".into(),
            domain: ToolDomain::Work,
            description: "填充输入框".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "selector": { "type": "string" },
                    "value": { "type": "string" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "browser_extract".into(),
            domain: ToolDomain::Work,
            description: "提取页面内容".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "selector": { "type": "string" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "browser_navigate".into(),
            domain: ToolDomain::Work,
            description: "导航到 URL".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "browser_screenshot".into(),
            domain: ToolDomain::Work,
            description: "截取页面截图".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "browser_get_page_source".into(),
            domain: ToolDomain::Work,
            description: "获取页面 HTML 源码".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "browser_evaluate_script".into(),
            domain: ToolDomain::Work,
            description: "执行 JavaScript".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "expression": { "type": "string" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "browser_set_viewport".into(),
            domain: ToolDomain::Work,
            description: "设置视口尺寸".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "width": { "type": "integer" },
                    "height": { "type": "integer" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "browser_get_cookies".into(),
            domain: ToolDomain::Work,
            description: "获取 Cookie".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "browser_wait_for_navigation".into(),
            domain: ToolDomain::Work,
            description: "等待导航完成".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "timeout_ms": { "type": "integer" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "office_docx_read".into(),
            domain: ToolDomain::Work,
            description: "读取 docx 文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "office_docx_write".into(),
            domain: ToolDomain::Work,
            description: "写入 docx 文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "paragraphs": { "type": "array", "items": { "type": "string" } }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "office_xlsx_read".into(),
            domain: ToolDomain::Work,
            description: "读取 xlsx 文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "office_xlsx_write".into(),
            domain: ToolDomain::Work,
            description: "写入 xlsx 文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "sheetName": { "type": "string" },
                    "rows": { "type": "array" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "office_pdf_extract".into(),
            domain: ToolDomain::Work,
            description: "提取 PDF 文本".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "office_pptx_generate".into(),
            domain: ToolDomain::Work,
            description: "生成 PPTX 文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "slides": { "type": "array" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "sandbox_analyze_csv".into(),
            domain: ToolDomain::Work,
            description: "分析 CSV 文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "sandbox_analyze_csv_content".into(),
            domain: ToolDomain::Work,
            description: "分析 CSV 内容".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "content": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "sandbox_analyze_json".into(),
            domain: ToolDomain::Work,
            description: "分析 JSON 数据".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "json": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "sandbox_transform_csv".into(),
            domain: ToolDomain::Work,
            description: "转换 CSV 数据".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "content": { "type": "string" },
                    "ops": { "type": "array" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "scheduler_task_create".into(),
            domain: ToolDomain::Work,
            description: "创建定时任务".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        // 文件系统管理工具
        registry.register(ToolDescriptor {
            name: "fs_list_directory".into(),
            domain: ToolDomain::Work,
            description: "列出目录内容".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } }
            }),
        });
        registry.register(ToolDescriptor {
            name: "fs_read_file".into(),
            domain: ToolDomain::Work,
            description: "读取文件内容".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } }
            }),
        });
        registry.register(ToolDescriptor {
            name: "fs_write_file".into(),
            domain: ToolDomain::Work,
            description: "写入文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                }
            }),
        });
        registry.register(ToolDescriptor {
            name: "fs_search_files".into(),
            domain: ToolDomain::Work,
            description: "搜索文件名".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "root": { "type": "string" },
                    "pattern": { "type": "string" }
                }
            }),
        });
        registry.register(ToolDescriptor {
            name: "fs_file_info".into(),
            domain: ToolDomain::Work,
            description: "获取文件信息".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } }
            }),
        });

        // === Code 域工具 ===
        registry.register(ToolDescriptor {
            name: "runner_execute".into(),
            domain: ToolDomain::Code,
            description: "执行命令".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string" },
                    "cwd": { "type": "string" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "runner_execute_batch".into(),
            domain: ToolDomain::Code,
            description: "批量执行命令".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "commands": { "type": "array", "items": { "type": "string" } }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "indexer_build".into(),
            domain: ToolDomain::Code,
            description: "构建代码索引".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "workspacePath": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "indexer_search_symbols".into(),
            domain: ToolDomain::Code,
            description: "搜索符号".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "query": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "indexer_search_text".into(),
            domain: ToolDomain::Code,
            description: "全文检索".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "query": { "type": "string" } }
            }),
        });

        registry.register(ToolDescriptor {
            name: "lsp_goto_definition".into(),
            domain: ToolDomain::Code,
            description: "跳转定义".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "lsp_references".into(),
            domain: ToolDomain::Code,
            description: "查找引用".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "lsp_diagnostics".into(),
            domain: ToolDomain::Code,
            description: "获取诊断".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "lsp_hover".into(),
            domain: ToolDomain::Code,
            description: "悬浮提示".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "lsp_rename".into(),
            domain: ToolDomain::Code,
            description: "重命名符号".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "multi_edit_execute".into(),
            domain: ToolDomain::Code,
            description: "批量编辑文件".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "workspaceRoot": { "type": "string" },
                    "edits": { "type": "array" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "multi_edit_preview".into(),
            domain: ToolDomain::Code,
            description: "预览批量编辑".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "workspaceRoot": { "type": "string" },
                    "edits": { "type": "array" }
                }
            }),
        });
        registry.register(ToolDescriptor {
            name: "semantic_build_index".into(),
            domain: ToolDomain::Code,
            description: "构建语义索引".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "directory": { "type": "string" },
                    "extensions": { "type": "array", "items": { "type": "string" } }
                }
            }),
        });
        registry.register(ToolDescriptor {
            name: "semantic_search".into(),
            domain: ToolDomain::Code,
            description: "语义搜索（TF-IDF / Embedding 双模式）".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "maxResults": { "type": "integer" },
                    "mode": { "type": "string", "enum": ["tfidf", "embedding"] }
                }
            }),
        });
        registry.register(ToolDescriptor {
            name: "semantic_build_embedding_index".into(),
            domain: ToolDomain::Code,
            description: "构建 Embedding 语义索引（调用 OpenAI 兼容 API）".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "directory": { "type": "string" },
                    "extensions": { "type": "array", "items": { "type": "string" } },
                    "baseUrl": { "type": "string" },
                    "apiKey": { "type": "string" },
                    "model": { "type": "string" }
                }
            }),
        });

        // Build/Test Runner 工具
        registry.register(ToolDescriptor {
            name: "build_runner_detect".into(),
            domain: ToolDomain::Code,
            description: "检测项目类型".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "workspace": { "type": "string" } }
            }),
        });
        registry.register(ToolDescriptor {
            name: "build_runner_build".into(),
            domain: ToolDomain::Code,
            description: "执行构建".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "workspace": { "type": "string" } }
            }),
        });
        registry.register(ToolDescriptor {
            name: "build_runner_test".into(),
            domain: ToolDomain::Code,
            description: "执行测试".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "workspace": { "type": "string" } }
            }),
        });
        registry.register(ToolDescriptor {
            name: "build_runner_lint".into(),
            domain: ToolDomain::Code,
            description: "执行 lint".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "workspace": { "type": "string" } }
            }),
        });
        registry.register(ToolDescriptor {
            name: "build_runner_run_all".into(),
            domain: ToolDomain::Code,
            description: "一键全流程（build → test → lint）".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "workspace": { "type": "string" } }
            }),
        });

        // === 共享工具 ===
        registry.register(ToolDescriptor {
            name: "mcp_list_tools".into(),
            domain: ToolDomain::Shared,
            description: "列出 MCP 工具".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry.register(ToolDescriptor {
            name: "ocr_recognize_text".into(),
            domain: ToolDomain::Shared,
            description: "OCR 文字识别".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });
        registry.register(ToolDescriptor {
            name: "ocr_recognize_from_path".into(),
            domain: ToolDomain::Shared,
            description: "简化版 OCR：接收文件路径直接返回识别文本".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "language": { "type": "string" }
                }
            }),
        });

        registry.register(ToolDescriptor {
            name: "project_rules_load".into(),
            domain: ToolDomain::Shared,
            description: "加载项目规则".into(),
            parameters: serde_json::json!({ "type": "object" }),
        });

        registry
    }

    /// 注册工具
    pub fn register(&mut self, tool: ToolDescriptor) {
        self.tools.insert(tool.name.clone(), tool);
    }

    /// 获取所有工具
    pub fn all(&self) -> Vec<&ToolDescriptor> {
        self.tools.values().collect()
    }

    /// 根据运行时模式过滤工具
    pub fn filter_by_mode(&self, mode: &RuntimeMode) -> Vec<&ToolDescriptor> {
        self.tools
            .values()
            .filter(|tool| match mode {
                RuntimeMode::Work => {
                    tool.domain == ToolDomain::Work || tool.domain == ToolDomain::Shared
                }
                RuntimeMode::Code => {
                    tool.domain == ToolDomain::Code || tool.domain == ToolDomain::Shared
                }
            })
            .collect()
    }

    /// 根据运行时模式过滤工具（返回名称列表）
    pub fn tool_names_for_mode(&self, mode: &RuntimeMode) -> Vec<String> {
        self.filter_by_mode(mode)
            .iter()
            .map(|t| t.name.clone())
            .collect()
    }

    /// 检查工具是否在当前模式下可用
    pub fn is_available(&self, tool_name: &str, mode: &RuntimeMode) -> bool {
        match self.tools.get(tool_name) {
            Some(tool) => match mode {
                RuntimeMode::Work => {
                    tool.domain == ToolDomain::Work || tool.domain == ToolDomain::Shared
                }
                RuntimeMode::Code => {
                    tool.domain == ToolDomain::Code || tool.domain == ToolDomain::Shared
                }
            },
            None => false,
        }
    }

    /// 获取工具描述
    pub fn get(&self, name: &str) -> Option<&ToolDescriptor> {
        self.tools.get(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_tools_registered() {
        let registry = ToolRegistry::with_builtin_tools();
        assert!(registry.get("search_web").is_some());
        assert!(registry.get("runner_execute").is_some());
        assert!(registry.get("mcp_list_tools").is_some());
    }

    #[test]
    fn test_filter_work_mode() {
        let registry = ToolRegistry::with_builtin_tools();
        let work_tools = registry.filter_by_mode(&RuntimeMode::Work);

        // Work 模式应包含 search_web
        assert!(work_tools.iter().any(|t| t.name == "search_web"));
        // Work 模式应包含 browser_click
        assert!(work_tools.iter().any(|t| t.name == "browser_click"));
        // Work 模式应包含 shared 工具
        assert!(work_tools.iter().any(|t| t.name == "mcp_list_tools"));
        // Work 模式不应包含 runner_execute
        assert!(!work_tools.iter().any(|t| t.name == "runner_execute"));
        // Work 模式不应包含 indexer
        assert!(!work_tools.iter().any(|t| t.name == "indexer_build"));
    }

    #[test]
    fn test_filter_code_mode() {
        let registry = ToolRegistry::with_builtin_tools();
        let code_tools = registry.filter_by_mode(&RuntimeMode::Code);

        // Code 模式应包含 runner_execute
        assert!(code_tools.iter().any(|t| t.name == "runner_execute"));
        // Code 模式应包含 indexer
        assert!(code_tools.iter().any(|t| t.name == "indexer_build"));
        // Code 模式应包含 multi_edit
        assert!(code_tools.iter().any(|t| t.name == "multi_edit_execute"));
        // Code 模式应包含 shared 工具
        assert!(code_tools.iter().any(|t| t.name == "mcp_list_tools"));
        // Code 模式不应包含 search_web
        assert!(!code_tools.iter().any(|t| t.name == "search_web"));
        // Code 模式不应包含 browser_click
        assert!(!code_tools.iter().any(|t| t.name == "browser_click"));
    }

    #[test]
    fn test_is_available() {
        let registry = ToolRegistry::with_builtin_tools();

        // Work 模式
        assert!(registry.is_available("search_web", &RuntimeMode::Work));
        assert!(!registry.is_available("runner_execute", &RuntimeMode::Work));

        // Code 模式
        assert!(registry.is_available("runner_execute", &RuntimeMode::Code));
        assert!(!registry.is_available("search_web", &RuntimeMode::Code));

        // Shared 工具在两种模式下都可用
        assert!(registry.is_available("mcp_list_tools", &RuntimeMode::Work));
        assert!(registry.is_available("mcp_list_tools", &RuntimeMode::Code));

        // 不存在的工具
        assert!(!registry.is_available("nonexistent", &RuntimeMode::Work));
    }

    #[test]
    fn test_tool_names_for_mode() {
        let registry = ToolRegistry::with_builtin_tools();
        let work_names = registry.tool_names_for_mode(&RuntimeMode::Work);
        let code_names = registry.tool_names_for_mode(&RuntimeMode::Code);

        assert!(work_names.contains(&"search_web".to_string()));
        assert!(!work_names.contains(&"runner_execute".to_string()));

        assert!(code_names.contains(&"runner_execute".to_string()));
        assert!(!code_names.contains(&"search_web".to_string()));
    }

    #[test]
    fn test_custom_tool_registration() {
        let mut registry = ToolRegistry::new();
        registry.register(ToolDescriptor {
            name: "custom_tool".into(),
            domain: ToolDomain::Work,
            description: "自定义工具".into(),
            parameters: serde_json::json!({}),
        });

        assert!(registry.get("custom_tool").is_some());
        assert!(registry.is_available("custom_tool", &RuntimeMode::Work));
        assert!(!registry.is_available("custom_tool", &RuntimeMode::Code));
    }
}
