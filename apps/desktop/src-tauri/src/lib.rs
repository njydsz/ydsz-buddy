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
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::state::AppState;
use crate::server::BackendServer;
use crate::browser::BrowserManager;
use crate::updater::UpdaterManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    init_logging();

    info!("Starting Remi Code desktop application (Tauri 2)");

    let app_state = Arc::new(AppState::new());
    let backend_server = Arc::new(BackendServer::new());
    let browser_manager = Arc::new(BrowserManager::new());
    let updater_manager = Arc::new(UpdaterManager::new());

    let app_state_setup = app_state.clone();
    let backend_server_setup = backend_server.clone();
    let backend_server_events = backend_server.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            info!("Single instance: focusing existing window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .manage(app_state.clone())
        .manage(backend_server.clone())
        .manage(browser_manager.clone())
        .manage(updater_manager.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_ws_url,
            commands::pick_folder,
            commands::save_file,
            commands::confirm,
            commands::set_theme,
            commands::show_context_menu,
            commands::emit_menu_action,
            commands::open_external,
            commands::show_in_folder,
            commands::get_update_state,
            commands::check_for_updates,
            commands::download_update,
            commands::install_update,
            commands::notifications_is_supported,
            commands::notifications_show,
            commands::server_transcribe_voice,
            commands::browser_attach_webview,
            commands::browser_open,
            commands::browser_close,
            commands::browser_hide,
            commands::browser_get_state,
            commands::browser_set_panel_bounds,
            commands::browser_navigate,
            commands::browser_reload,
            commands::browser_go_back,
            commands::browser_go_forward,
            commands::browser_new_tab,
            commands::browser_close_tab,
            commands::browser_select_tab,
            commands::browser_open_dev_tools,
            commands::browser_capture_screenshot,
            commands::browser_copy_screenshot_to_clipboard,
            commands::browser_execute_cdp,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state = app_state_setup.clone();
            let backend = backend_server_setup.clone();

            // Set app handle for browser manager to emit events
            browser_manager.set_app_handle(app_handle.clone());

            tauri::async_runtime::spawn(async move {
                // Reserve a random port for the backend
                match BackendServer::reserve_port().await {
                    Ok(port) => {
                        let auth_token = BackendServer::generate_auth_token();

                        info!("Reserved backend port: {}, starting backend...", port);

                        // Update state
                        {
                            let mut p = state.backend_port.write();
                            *p = port;
                        }
                        {
                            let mut t = state.backend_auth_token.write();
                            *t = auth_token.clone();
                        }
                        {
                            let mut url = state.backend_http_url.write();
                            *url = format!("http://127.0.0.1:{}", port);
                        }
                        {
                            let mut url = state.backend_ws_url.write();
                            *url = format!("ws://127.0.0.1:{}/?token={}", port, auth_token);
                        }

                        // Start the backend process
                        if let Err(e) = backend.start(state.clone(), port, auth_token).await {
                            error!("Failed to start backend: {}", e);
                        }

                        // Wait briefly for backend to initialize
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    }
                    Err(e) => {
                        error!("Failed to reserve backend port: {}", e);
                    }
                }

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
        .run(move |_app_handle, event| match event {
            RunEvent::ExitRequested { api: _, .. } => {
                info!("Exit requested, cleaning up...");
                let backend = backend_server_events.clone();
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

fn init_logging() {
    let log_dir = dirs::home_dir()
        .map(|h| h.join(".remi-code").join("logs"))
        .unwrap_or_else(|| std::path::PathBuf::from(".remi-code/logs"));

    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "desktop-main.log");
    let (non_blocking, guard) = tracing_appender::nonblocking(file_appender);

    // Initialize Sentry if DSN is configured
    let _sentry_guard = if let Ok(dsn) = std::env::var("SENTRY_DSN") {
        if !dsn.is_empty() {
            let sentry_guard = sentry::init((
                dsn,
                sentry::ClientOptions {
                    release: sentry::release_name!(),
                    traces_sample_rate: 0.1,
                    ..Default::default()
                },
            ));
            Some(sentry_guard)
        } else {
            None
        }
    } else {
        None
    };

    tracing_subscriber::registry()
        .with(EnvFilter::new("info"))
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
        .with(tracing_subscriber::fmt::layer().with_writer(non_blocking).json())
        .init();

    // Leak the guard so it lives for the entire application lifetime
    std::mem::forget(guard);
}
