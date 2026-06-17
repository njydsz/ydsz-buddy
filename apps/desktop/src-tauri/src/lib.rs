// Tauri 2 desktop application library
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub mod state;
pub mod server;
pub mod commands;
pub mod browser;
pub mod updater;

use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tracing::{info, error};

use crate::state::AppState;
use crate::server::BackendProcess;
use crate::browser::BrowserManager;
use crate::updater::UpdaterManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting Remi Code desktop application (Tauri 2)");

    let app_state = Arc::new(AppState::new());
    let backend_process = Arc::new(BackendProcess::new());
    let browser_manager = Arc::new(BrowserManager::new());
    let updater_manager = Arc::new(UpdaterManager::new());

    let app_state_clone = app_state.clone();
    let backend_process_clone = backend_process.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            info!("Single instance: focusing existing window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        })?)
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .manage(app_state.clone())
        .manage(browser_manager.clone())
        .manage(updater_manager.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_ws_url,
            commands::pick_folder,
            commands::save_file,
            commands::confirm,
            commands::set_theme,
            commands::show_context_menu,
            commands::open_external,
            commands::show_in_folder,
            commands::get_update_state,
            commands::check_for_updates,
            commands::download_update,
            commands::install_update,
            commands::browser_open,
            commands::browser_close,
            commands::browser_get_state,
            commands::browser_navigate,
            commands::browser_new_tab,
            commands::browser_close_tab,
            commands::browser_select_tab,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            
            tauri::async_runtime::spawn(async move {
                // Reserve a random port for the backend
                let port = reserve_loopback_port().await;
                let auth_token = generate_auth_token();

                info!("Reserved backend port: {}, starting backend...", port);

                // Start the backend process
                if let Err(e) = backend_process_clone
                    .start(app_state_clone.clone(), port, auth_token)
                    .await
                {
                    error!("Failed to start backend: {}", e);
                    return;
                }

                // Wait for backend to be ready
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

                // Show the main window
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { api, .. } => {
                info!("Exit requested");
                let backend = backend_process.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = backend.stop().await {
                        error!("Error stopping backend: {}", e);
                    }
                });
            }
            RunEvent::WindowEvent { label, event, .. } => {
                if label == "main" {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        info!("Main window closed");
                    }
                }
            }
            _ => {}
        });
}

async fn reserve_loopback_port() -> u16 {
    // Try to bind to a random available port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to bind to random port");
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    port
}

fn generate_auth_token() -> String {
    use rand::Rng;
    use rand::distributions::Alphanumeric;
    let mut rng = rand::thread_rng();
    let token: String = rng
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();
    token
}
