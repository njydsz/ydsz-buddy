//! Remi App — Tauri shell for the Remi Code desktop client.
//!
//! This binary is the single-process host that:
//!
//! 1. Boots a Tauri webview pointing at the React UI (dev: Vite, prod: dist).
//! 2. Starts the embedded `remi-server` HTTP/WebSocket backend on a
//!    loopback port and exposes its port to the renderer via
//!    [`emit_server_port`] so the React client can connect through
//!    `ws://127.0.0.1:<port>/ws`.
//! 3. Bridges native desktop capabilities (dialogs, filesystem, shell,
//!    notifications, updater) through the [`commands`] module, replacing
//!    Peak Code's Electron `contextBridge` surface.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod server;

use commands::{AppPaths, ServerStateInfo};
use server::EmbeddedServerHandle;
use tauri::{Emitter, Manager, RunEvent};
use tracing::{error, info};

const SERVER_PORT_EVENT: &str = "remi://server/port";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_paths,
            commands::get_server_info,
            commands::open_in_editor,
            commands::show_in_folder,
            commands::open_external_url,
            commands::show_confirm_dialog,
            commands::show_context_menu,
            commands::set_window_theme,
            commands::restart_server,
            commands::quit_app,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Resolve the app's data dir and forward it to the embedded server.
            let data_dir = handle
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("remi-code"));
            std::fs::create_dir_all(&data_dir).ok();

            // Boot the embedded HTTP + WebSocket server. The port is
            // chosen automatically (127.0.0.1:0) and reported back to
            // the renderer through the `remi://server/port` event.
            let server = tauri::async_runtime::block_on(async move {
                server::spawn_embedded_server(data_dir).await
            });

            match server {
                Ok(server) => {
                    let info = ServerStateInfo {
                        port: server.port(),
                        host: server.host().to_string(),
                    };
                    info!(
                        "Embedded remi-server listening on ws://{}:{}",
                        info.host, info.port
                    );
                    handle.manage(server);
                    if let Err(e) = handle.emit(SERVER_PORT_EVENT, &info) {
                        error!("Failed to broadcast server port event: {e}");
                    }
                    let _ = handle.emit("remi://server/ready", &info);
                }
                Err(e) => {
                    error!("Failed to start embedded remi-server: {e:?}");
                    return Err(Box::new(e) as Box<dyn std::error::Error>);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // On desktop we hide-to-tray by default. The actual
                // quit path runs through the `quit_app` IPC command.
                if window.app_handle().tray_by_id("main").is_some() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Failed to build Remi Code Tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(server) = app.try_state::<EmbeddedServerHandle>() {
                    server.shutdown();
                }
            }
        });
}

fn main() {
    run();
}
