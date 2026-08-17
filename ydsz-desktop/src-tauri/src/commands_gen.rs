//! Tauri commands 的 TypeScript 绑定生成器（基于 tauri-specta）
//!
//! 用 [`tauri_specta::Builder`] + [`tauri_specta::collect_commands`] 收集所有
//! `#[tauri::command] #[specta::specta]` 标注的命令签名，再交给
//! `specta_typescript::Typescript` 渲染成 TypeScript 代码（含
//! `commands` / `events` / 类型 alias）。
//!
//! ## 与手写 `commands_gen` 的差异
//!
//! 早期版本我们手写了 `specta::function::info` 收集 + 手写 TS 渲染的轻量流程，
//! 绕开 tauri-specta。理由是 tauri-specta 2.0.0-rc.x 与 tauri 2.11.x 在
//! `tauri::Channel` 上有运行时硬不兼容；现在 tauri-specta 2.0.0-rc.25
//! （2026-05-08 发布）已经把 runtime API 跟进到 tauri 2.11.x，不再有
//! `STATUS_ENTRYPOINT_NOT_FOUND` 问题。
//!
//! 因此本模块切回 **tauri-specta 标准用法**：
//!
//! 1. 命令由 `tauri-specta` 的 [`Builder`] 收集；
//! 2. 命令运行时注册继续走 [`tauri::generate_handler!`]（保持零行为变更）；
//! 3. 导出 TS 用 `builder.export(specta_typescript::Typescript::default(), path)`。
//!
//! ## 迁移原则
//!
//! 1. 新增 Tauri command 时，必须同时加 `#[tauri::command] #[specta::specta]` 标注，
//!    并把命令名加入下方 [`build_specta`] 内部的 `collect_commands!` 列表。
//! 2. 命令参数 / 返回类型如果是自定义 DTO，必须实现 `Serialize + Deserialize + specta::Type`，
//!    字段命名靠 `#[serde(rename_all = "camelCase")]` 对齐 TS。
//! 3. 运行时注册继续走 `lib.rs::run()` 中的 `tauri::generate_handler!` ——
//!    保证 `tauri-specta` 编译期宏不会污染生产二进制。

use tauri_specta::{collect_commands, Builder};

/// 构造一个收集了所有 `#[tauri::command] #[specta::specta]` 命令的 [`Builder`]。
///
/// 返回的 Builder 在 debug / test 构建里可调用
/// `.export(specta_typescript::Typescript::default(), "<...>/commands.ts")`
/// 把命令签名渲染为 `commands.ts` 绑定。
///
/// 运行时 IPC 仍走 `tauri::generate_handler!`，Builder 仅用于类型生成。
#[allow(dead_code)]
pub fn build_specta() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
            crate::audit_export,
            crate::browser_attach_webview,
            crate::browser_capture_screenshot,
            crate::browser_click,
            crate::browser_close,
            crate::browser_close_tab,
            crate::browser_copy_screenshot_to_clipboard,
            crate::browser_execute_cdp,
            crate::browser_extract,
            crate::browser_fill,
            crate::browser_get_state,
            crate::browser_go_back,
            crate::browser_go_forward,
            crate::browser_hide,
            crate::browser_navigate,
            crate::browser_new_tab,
            crate::browser_open,
            crate::browser_open_dev_tools,
            crate::browser_reload,
            crate::browser_select_tab,
            crate::browser_set_panel_bounds,
            crate::browser_wait,
            crate::check_for_updates,
            crate::checkpoint_cancel,
            crate::checkpoint_cleanup_old,
            crate::checkpoint_complete,
            crate::checkpoint_inspect,
            crate::checkpoint_list_pending,
            crate::checkpoint_resume,
            crate::checkpoint_save,
            crate::checkpoint_update,
            crate::clear_terminal,
            crate::close_terminal,
            crate::coding_plan_cancel_grant,
            crate::coding_plan_current_grant,
            crate::coding_plan_poll_device_token,
            crate::coding_plan_request_device_code,
            crate::create_terminal,
            crate::diagnostics_clear_logs,
            crate::diagnostics_export_zip,
            crate::diagnostics_get_logs,
            crate::diagnostics_report_issue,
            crate::diagnostics_reveal_in_folder,
            crate::download_update,
            crate::failover_get_state,
            crate::failover_pick_fallback,
            crate::failover_record_failure,
            crate::failover_record_success,
            crate::failover_reset,
            crate::failover_set_config,
            crate::failover_switch_to,
            crate::get_browser_use_pipe_addr,
            crate::get_default_menu,
            crate::get_media_permission,
            crate::get_media_permissions,
            crate::get_runtime_arch,
            crate::get_server_ws_url,
            crate::get_update_state,
            crate::get_window_open_strategy,
            crate::goal_abort,
            crate::goal_cleanup,
            crate::goal_get,
            crate::goal_list_active,
            crate::goal_start,
            crate::greet,
            crate::idle_lock_arm,
            crate::idle_lock_disarm,
            crate::idle_lock_get_state,
            crate::idle_lock_now,
            crate::idle_lock_record_activity,
            crate::idle_lock_set_config,
            crate::idle_lock_set_pin,
            crate::idle_lock_tick,
            crate::idle_lock_unlock,
            crate::indexer_build,
            crate::indexer_ollama_discover,
            crate::indexer_search_symbols,
            crate::indexer_search_text,
            crate::install_update,
            crate::load_user_profile,
            crate::lsp_goto_definition,
            crate::lsp_start_server,
            crate::mcp_add_server,
            crate::mcp_list_presets,
            crate::mcp_list_servers,
            crate::mcp_list_tools,
            crate::mcp_remove_server,
            crate::mcp_test_connection,
            crate::mcp_update_server,
            crate::ocr_list_providers,
            crate::ocr_recognize_text,
            crate::image_generate,
            crate::office_docx_read,
            crate::office_docx_write,
            crate::office_docx_write_rich,
            crate::office_pdf_extract,
            crate::office_xlsx_read,
            crate::office_xlsx_write,
            crate::office_xlsx_write_typed,
            crate::open_external,
            crate::pick_folder,
            crate::plan_export_to_disk,
            crate::plan_list_exported,
            crate::probe_backend_port,
            crate::project_rules_load,
            crate::push_cleanup_expired_devices,
            crate::push_get_dry_run_status,
            crate::push_test_jpush_connection,
            crate::push_test_umeng_connection,
            crate::push_unregister_mobile_device,
            crate::repo_wiki_generate,
            crate::repo_wiki_generate_incremental,
            crate::repo_wiki_get,
            crate::repo_wiki_list,
            crate::repo_wiki_search,
            crate::repo_wiki_status,
            crate::repo_wiki_stats,
            crate::repo_wiki_export,
            crate::repo_wiki_outline,
            crate::repo_wiki_dependencies,
            crate::request_media_permission,
            crate::resize_terminal,
            crate::restart_terminal,
            crate::save_file,
            crate::save_user_profile,
            crate::scheduler_task_create,
            crate::scheduler_task_delete,
            crate::scheduler_task_list,
            crate::scheduler_task_set_enabled,
            crate::scheduler_task_trigger,
            crate::scheduler_task_update,
            crate::semantic_add_file_embedding,
            crate::semantic_build_embedding_index,
            crate::semantic_build_index,
            crate::semantic_get_indexed_files,
            crate::semantic_search,
            crate::semantic_search_embedding,
            crate::set_theme,
            crate::should_check_for_updates_on_foreground,
            crate::show_confirm,
            crate::show_context_menu,
            crate::show_in_folder,
            crate::show_message,
            crate::skill_get,
            crate::skill_init,
            crate::skill_install,
            crate::skill_list,
            crate::skill_load_body,
            crate::skill_marketplace_lookup,
            crate::skill_marketplace_refresh,
            crate::skill_search_marketplace,
            crate::skill_uninstall,
            crate::skill_validate_deps,
            crate::sync_shell_env,
            crate::team_rules_delete,
            crate::team_rules_list,
            crate::team_rules_read,
            crate::team_rules_resolve_base_dir,
            crate::team_rules_save,
            crate::team_rules_save_manifest,
            crate::transcribe_voice,
            crate::wait_backend_ready,
            crate::write_terminal,
    ])
}
