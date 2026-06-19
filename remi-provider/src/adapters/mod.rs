//! Provider 适配器实现

pub mod claude;
pub mod codex;
pub mod cursor;
pub mod gemini;
pub mod grok;
pub mod kilo;
pub mod opencode;
pub mod pi;

pub use claude::ClaudeAdapter;
pub use codex::CodexAdapter;
pub use cursor::CursorAdapter;
pub use gemini::GeminiAdapter;
pub use grok::GrokAdapter;
pub use kilo::KiloAdapter;
pub use opencode::OpenCodeAdapter;
pub use pi::PiAdapter;
