//! # Remi Claw 桌面应用入口文件
//!
//! 本文件是 Remi Claw 桌面应用程序的主入口点（entry point）。
//!
//! ## 模块职责
//!
//! - 配置 Windows 平台子系统属性，避免在 Release 模式下弹出额外的控制台窗口
//! - 调用库 crate（`remi_claw_lib`）中的 `run()` 函数启动 Tauri 应用
//!
//! ## 设计说明
//!
//! - Tauri 框架要求应用入口尽可能简洁，所有业务逻辑均放在库 crate 中
//! - `windows_subsystem = "windows"` 属性仅在非调试模式下生效，开发时仍保留控制台以便调试
//! - 本文件不可删除，否则 Windows Release 构建时会弹出控制台窗口
//!
//! ## 使用场景
//!
//! 通过 `cargo tauri dev` 或 `cargo tauri build` 启动/打包应用时，
//! 编译器会自动以本文件作为二进制入口开始执行。

// 在 Release 模式下隐藏 Windows 控制台窗口，DO NOT REMOVE!!
// 该属性确保最终用户运行应用时不会出现黑框（cmd 窗口）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// 应用程序主入口函数
///
/// 直接委托给库 crate 的 `run()` 函数完成 Tauri 应用的初始化与启动。
/// 所有插件注册、状态管理、命令绑定等逻辑均在 `remi_claw_lib::run()` 中完成。
fn main() {
    remi_claw_lib::run()
}
