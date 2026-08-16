//! # DAP (Debug Adapter Protocol) 调试器集成
//!
//! 借鉴 Zed 的 `debugger` crate 和 VS Code 的 Debug Adapter 协议，
//! 在 ydsz 中实现与语言无关的调试器集成。
//!
//! ## 架构
//!
//! ```text
//! ┌──────────────────────────────┐
//! │     DebuggerService          │
//! ├──────────────────────────────┤
//! │  - sessions: HashMap<Id>     │
//! │  - adapters: DebugAdapter    │
//! │  - event_tx: broadcast       │
//! └──────────────────────────────┘
//!          ↓            ↓
//!   ┌──────────┐  ┌──────────┐
//!   │ DAP Client│  │ DAP Server│
//!   │ (our side)│  │ (per-lang)│
//!   └──────────┘  └──────────┘
//! ```
//!
//! ## 支持的调试器
//!
//! | 语言 | 调试器 | 包名 |
//! |------|--------|------|
//! | Node.js | node --inspect | 内置 |
//! | Python | debugpy | debugpy |
//! | Rust | lldb-dap | lldb |
//! | Go | dlv dap | delve |
//!
//! ## 协议
//!
//! 使用 DAP 1.65+ 协议，通过 stdio 与调试适配器进程通信。

pub mod adapter;
pub mod session;
pub mod types;

pub use adapter::{DebugAdapterConfig, DebugAdapterRegistry};
pub use session::{DebugSession, DebugSessionManager, DebugSessionState};
pub use types::{
    DebugBreakpoint, DebugEvent, DebugRequest, DebugResponse,
    DebugStackFrame, DebugThread, DebugVariable, StartDebuggingParams,
};
