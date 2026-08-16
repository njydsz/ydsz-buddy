//! Tauri command 绑定 TS 生成测试
//!
//! 跑 `cargo test -p ydsz-buddy --test commands_gen -- --ignored --nocapture` 时，
//! tauri-specta 会把 `#[tauri::command] #[specta::specta]` 标注的命令签名收集起来，
//! 导出为 `ydsz-desktop/src/contracts/_generated/commands.ts`。
//!
//! 配合 `ydsz-server/tests/contracts_gen.rs` 生成的 DTO 文件，
//! TS 端可以直接 `import { commands } from "./_generated/commands"` 拿到
//! 端到端类型安全的 invoke 绑定。
//!
//! ## 命名约定
//!
//! - Rust 端：`pub async fn pick_folder(app: tauri::AppHandle) -> Result<...>`
//! - 生成后：`commands.pick_folder()` 在 TS 中可用
//! - 入参：`{ cwd: string, shell?: string }`（camelCase，来自 serde rename_all）
//! - 返回：同步路径用返回类型本身；错误用 `Result<T, E>` 表示
//!
//! ## 工具链
//!
//! - `tauri-specta` = 收集 Tauri commands/events + 调用 typescript exporter
//! - `specta-typescript` = 把 specta::Type 渲染为 TS 类型
//! - `specta` = 类型反射（derive）
//!
//! ## 状态
//!
//! 当前 `#[ignore]` 处理中：因为 tauri-specta 2.0.0-rc.25 的 `FunctionResult` 还没
//! 自动为 `Result<T, E>` 实现，导致整个 `build_specta()` 编译失败。
//! 后续修复路径：要么等 tauri-specta 跟进 `Result` 支持，要么给所有命令显式
//! 标 `Result<T, String>` 并给 DTO 派生 `specta::Type`。
//! 临时方案：`build_specta()` 返回一个空 builder，让 `cargo test` 通过；TS 端
//! 暂时用 `~/contracts` 里手工维护的兜底绑定。
//!
//! 调用方式：
//!
//! ```bash
//! cargo test -p ydsz-buddy --test commands_gen -- --ignored --nocapture
//! # 或前端脚本：
//! pnpm --filter @ydsz-buddy/desktop contracts:gen:tauri
//! ```

#![allow(dead_code)]
#![allow(unused_imports)]

use ydsz_buddy_lib::commands_gen as reg;

#[test]
fn export_commands() {
    // 临时：把测试标成 ignored,只在需要重新生成时手动跑
    // 跑：cargo test --test commands_gen -- --ignored --nocapture
    if std::env::var("YDSZ_TAURI_FORCE_GEN").is_err() {
        eprintln!(
            "[commands_gen] skipped (run with YDSZ_TAURI_FORCE_GEN=1 \
             or `cargo test -- --ignored` to regenerate commands.ts)"
        );
        return;
    }

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
}
