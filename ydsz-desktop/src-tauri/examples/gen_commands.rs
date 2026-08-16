//! Tauri command 绑定 TS 生成（用 cargo run --example 跑）
//!
//! 见 `tests/commands_gen.rs` 的同样说明 —— 用 example 入口避免 tauri-specta
//! 2.0.0-rc.25 在 test 二进制上 `STATUS_ENTRYPOINT_NOT_FOUND` 的链接问题。
//!
//! ```bash
//! cd ydsz-desktop/src-tauri
//! cargo run --example gen_commands
//! ```
#![allow(dead_code)]
#![allow(unused_imports)]

use ydsz_buddy_lib::commands_gen as reg;

fn main() {
    // tauri::test::mock_context 启动 MockRuntime，避开 webview2 / wry native dll 链接
    // （裸 binary 启动会 STATUS_ENTRYPOINT_NOT_FOUND）
    let _app = tauri::test::mock_app();

    // 生成目标：ydsz-desktop/src/contracts/_generated/commands.ts
    //
    // CARGO_MANIFEST_DIR = ydsz-desktop/src-tauri/
    // 路径 = ../src/contracts/_generated/commands.ts
    let out = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("ydsz-desktop")
        .join("src/contracts/_generated/commands.ts");

    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).expect("create _generated dir");
    }

    reg::build_specta()
        .export(
            specta_typescript::Typescript::default(),
            out.to_string_lossy().as_ref(),
        )
        .expect("tauri-specta export commands.ts");

    eprintln!("[gen_commands] wrote {}", out.display());
}
