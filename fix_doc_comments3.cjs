const fs = require('fs');

function fixFile(path, oldStr, newStr) {
  let content = fs.readFileSync(path, 'utf8');
  if (!content.includes(oldStr)) {
    console.log(`[SKIP] Pattern not found in ${path}`);
    return false;
  }
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log(`[OK] Fixed ${path}`);
  return true;
}

// 1. Fix remi-provider/src/adapter.rs - module-level //! doc comment
const adapterPath = 'd:\\Code\\remi\\org\\modules\\remi-code\\remi-provider\\src\\adapter.rs';
const adapterOld = `//! #[async_trait]
//! impl ProviderAdapter for MyAdapter {
//!
fn provider_kind(&self) -> ProviderKind {
//!         ProviderKind::Custom
//!
}
//!
//!
fn capabilities(&self) -> ProviderCapabilities {
//!         ProviderCapabilities {
//!             session_model_switch: SessionModelSwitchMode::InSession,
//!             supports_skill_mentions: true,
//!             // ... 其他能力配置
//!
}
//!
}
//!
//!
async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
//!         // 实现会话启动逻辑
//!
}`;
const adapterNew = `//! #[async_trait]
//! impl ProviderAdapter for MyAdapter {
//!
//!     fn provider_kind(&self) -> ProviderKind {
//!         ProviderKind::Custom
//!     }
//!
//!     fn capabilities(&self) -> ProviderCapabilities {
//!         ProviderCapabilities {
//!             session_model_switch: SessionModelSwitchMode::InSession,
//!             supports_skill_mentions: true,
//!             // ... 其他能力配置
//!         }
//!     }
//!
//!     async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
//!         // 实现会话启动逻辑
//!     }`;
fixFile(adapterPath, adapterOld, adapterNew);

// 2. Fix remi-terminal/src/pty.rs - line 79 missing ///
const ptyPath = 'd:\\Code\\remi\\org\\modules\\remi-code\\remi-terminal\\src\\pty.rs';
const ptyOld = `/// if let Some(n) = pty.read(&mut buf) {
///
let output = String::from_utf8_lossy(&buf[..n]);
///     println!('Output: {}', output);
/// }`;
const ptyNew = `/// if let Some(n) = pty.read(&mut buf) {
///     let output = String::from_utf8_lossy(&buf[..n]);
///     println!('Output: {}', output);
/// }`;
fixFile(ptyPath, ptyOld, ptyNew);

// 3. Fix remi-auth/src/session_credential.rs - lines 384, 386, 388, 390, 392 missing ///
const authPath = 'd:\\Code\\remi\\org\\modules\\remi-code\\remi-auth\\src\\session_credential.rs';
const authOld = `    /// let issued = service.issue(

Some(24),                                    // 24 小时有效期
    ///
Some('user_123'.to_string()),                // 用户 ID
    ///
Some(SessionMethod::Bearer),                 // Bearer 认证
    ///
Some(SessionRole::Client),                   // 客户端角色
    ///
Some(ClientMetadata {                        // 客户端信息`;
const authNew = `    /// let issued = service.issue(
    ///     Some(24),                                    // 24 小时有效期
    ///
    ///     Some('user_123'.to_string()),                // 用户 ID
    ///
    ///     Some(SessionMethod::Bearer),                 // Bearer 认证
    ///
    ///     Some(SessionRole::Client),                   // 客户端角色
    ///
    ///     Some(ClientMetadata {                        // 客户端信息`;
fixFile(authPath, authOld, authNew);

console.log('Done.');
