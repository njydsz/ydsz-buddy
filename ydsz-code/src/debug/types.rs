//! # DAP 类型定义
//!
//! 与 DAP (Debug Adapter Protocol) 规范对齐的核心类型。
//! 参考: https://microsoft.github.io/debug-adapter-protocol/

use serde::{Deserialize, Serialize};

/// 启动调试参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDebuggingParams {
    /// 语言标识（node / python / rust / go）
    pub language: String,
    /// 工作区根目录
    pub workspace_root: String,
    /// 程序入口文件路径
    pub program: String,
    /// 命令行参数
    #[serde(default)]
    pub args: Vec<String>,
    /// 环境变量
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    /// 是否以调试模式启动（而非 attach）
    pub launch: bool,
    /// 断点列表
    #[serde(default)]
    pub breakpoints: Vec<DebugBreakpoint>,
}

/// 断点
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugBreakpoint {
    /// 文件路径
    pub file_path: String,
    /// 行号（1-based）
    pub line: u32,
    /// 条件表达式（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition: Option<String>,
    /// 日志消息（logpoint，可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_message: Option<String>,
    /// 是否启用
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// 调试线程
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugThread {
    /// 线程 ID
    pub id: i64,
    /// 线程名称
    pub name: String,
}

/// 调用栈帧
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugStackFrame {
    /// 栈帧 ID
    pub id: i64,
    /// 函数/方法名
    pub name: String,
    /// 源文件路径
    pub source: Option<String>,
    /// 行号（1-based）
    pub line: u32,
    /// 列号（1-based）
    pub column: u32,
    /// 模块名（如有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub module: Option<String>,
}

/// 变量
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugVariable {
    /// 变量名
    pub name: String,
    /// 变量值（字符串表示）
    pub value: String,
    /// 变量类型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub type_name: Option<String>,
    /// 变量引用（用于展开子属性）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables_reference: Option<i64>,
}

/// DAP 请求（前端 → 后端 → DAP Server）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugRequest {
    /// 请求方法名
    pub command: String,
    /// 请求参数
    #[serde(default)]
    pub args: serde_json::Value,
}

/// DAP 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugResponse {
    /// 请求方法名
    pub command: String,
    /// 是否成功
    pub success: bool,
    /// 错误消息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 响应体
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
}

/// 调试事件（DAP Server → 后端 → 前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DebugEvent {
    /// 输出事件（stdout/stderr/console）
    Output {
        category: String,
        output: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        source: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        line: Option<u32>,
    },
    /// 断点命中
    Stopped {
        reason: String,
        thread_id: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        description: Option<String>,
        all_threads_stopped: bool,
    },
    /// 线程开始/结束
    Thread {
        reason: String,
        thread_id: i64,
    },
    /// 调试器终止
    Terminated {
        #[serde(skip_serializing_if = "Option::is_none")]
        restart: Option<bool>,
    },
    /// 调试器退出
    Exited {
        exit_code: i32,
    },
}
