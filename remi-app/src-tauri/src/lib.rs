mod commands;

use commands::{
    dialog::*,
    terminal::*,
    git::*,
    workspace::*,
    settings::*,
    orchestration::*,
    provider::*,
    browser::*,
    update::*,
    window::*,
    context_menu::*,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::init())
        .plugin(tauri_plugin_process::init())
        .manage(TerminalState::new())
        .manage(WorkspaceState::new())
        .manage(SettingsState::new())
        .manage(OrchestrationState::new())
        .manage(ProviderState::new())
        .manage(BrowserState::new())
        .manage(UpdateState::new())
        .manage(GitState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            pick_folder,
            save_file,
            show_confirm,
            show_message,
            create_terminal,
            write_terminal,
            resize_terminal,
            close_terminal,
            git_status,
            git_list_branches,
            git_checkout,
            git_commit,
            list_projects,
            add_project,
            remove_project,
            read_file,
            write_file,
            get_settings,
            save_settings,
            create_thread,
            send_message,
            list_threads,
            delete_thread,
            rename_thread,
            list_models,
            set_api_key,
            get_provider_status,
            browser_open,
            browser_close,
            browser_hide,
            browser_get_state,
            browser_set_panel_bounds,
            browser_attach_webview,
            browser_copy_screenshot_to_clipboard,
            browser_capture_screenshot,
            browser_execute_cdp,
            browser_navigate,
            browser_reload,
            browser_go_back,
            browser_go_forward,
            browser_new_tab,
            browser_close_tab,
            browser_select_tab,
            browser_open_dev_tools,
            get_update_state,
            check_for_updates,
            download_update,
            install_update,
            set_theme,
            show_in_folder,
            open_external,
            show_context_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
