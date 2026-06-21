import fs from 'fs';
import path from 'path';

const ROOT = 'd:/Code/remi/org/modules/remi-code';

// Fix 1: Lifetime parameter corruption in remi-core/src/models.rs
function fixModelsLifetimes() {
  const file = path.join(ROOT, 'remi-core/src/models.rs');
  let content = fs.readFileSync(file, 'utf8');
  // Fix: impl<"de> -> impl<'de> and Deserialize<"de> -> Deserialize<'de>
  content = content.replace(/impl<"de>\s+Deserialize<"de>/g, "impl<'de> Deserialize<'de>");
  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed lifetime parameters in remi-core/src/models.rs');
}

// Fix 2: Doc comment corruption - lines inside /// doc comments missing /// prefix
// Pattern: lines that should have /// prefix but don't, inside code examples
function fixDocCommentFile(filePath, fixes) {
  const file = path.join(ROOT, filePath);
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const { from, to } of fixes) {
    if (content.includes(from)) {
      content = content.replace(from, to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Fixed doc comments in ${filePath}`);
  } else {
    console.log(`No changes needed in ${filePath} (patterns not found)`);
  }
}

// Fix all known doc comment corruptions
function fixAllDocComments() {
  // remi-workspace/src/error.rs - first code block
  fixDocCommentFile('remi-workspace/src/error.rs', [
    {
      from: "/// fn check_path(path: &str) -> Result<(), WorkspaceError> {\n///\nif path.contains('..') {\n///\nreturn Err(WorkspaceError::PathOutsideRoot(path.to_string()));\n///\n}\n///\nOk(())\n/// }",
      to: '/// fn check_path(path: &str) -> Result<(), WorkspaceError> {\n///     if path.contains("..") {\n///         return Err(WorkspaceError::PathOutsideRoot(path.to_string()));\n///     }\n///     Ok(())\n/// }'
    },
    // remi-workspace/src/error.rs - second code block
    {
      from: "/// fn do_something() -> WorkspaceResult<String> {\n///\nOk('success'.to_string())\n/// }",
      to: '/// fn do_something() -> WorkspaceResult<String> {\n///     Ok("success".to_string())\n/// }'
    }
  ]);

  // remi-provider/src/error.rs
  fixDocCommentFile('remi-provider/src/error.rs', [
    {
      from: "/// fn my_function() -> ProviderResult<String> {\n///\nOk('success'.to_string())\n/// }",
      to: '/// fn my_function() -> ProviderResult<String> {\n///     Ok("success".to_string())\n/// }'
    }
  ]);

  // remi-git/src/error.rs
  fixDocCommentFile('remi-git/src/error.rs', [
    {
      from: "/// fn get_status() -> GitResult<String> {\n///\nOk('on branch main'.to_string())\n/// }",
      to: '/// fn get_status() -> GitResult<String> {\n///     Ok("on branch main".to_string())\n/// }'
    }
  ]);

  // remi-auth/src/error.rs
  fixDocCommentFile('remi-auth/src/error.rs', [
    {
      from: "/// fn authenticate_user() -> AuthResult<String> {\n///\nOk('session_token'.to_string())\n/// }",
      to: '/// fn authenticate_user() -> AuthResult<String> {\n///     Ok("session_token".to_string())\n/// }'
    }
  ]);

  // remi-orchestration/src/error.rs
  fixDocCommentFile('remi-orchestration/src/error.rs', [
    {
      from: "/// fn do_something() -> OrchestrationResult<String> {\n///\nOk('success'.to_string())\n/// }",
      to: '/// fn do_something() -> OrchestrationResult<String> {\n///     Ok("success".to_string())\n/// }'
    }
  ]);

  // remi-checkpoint/src/error.rs
  fixDocCommentFile('remi-checkpoint/src/error.rs', [
    {
      from: "//! fn do_something() -> CheckpointResult<()> {\n//!     // 当检查点不存在时\n//!\nErr(CheckpointError::NotFound('checkpoint-123'.to_string()))\n//! }",
      to: '//! fn do_something() -> CheckpointResult<()> {\n//!     // 当检查点不存在时\n//!     Err(CheckpointError::NotFound("checkpoint-123".to_string()))\n//! }'
    },
    {
      from: "/// fn example() -> CheckpointResult<String> {\n///\nOk('success'.to_string())\n/// }",
      to: '/// fn example() -> CheckpointResult<String> {\n///     Ok("success".to_string())\n/// }'
    }
  ]);

  // remi-telemetry/src/error.rs
  fixDocCommentFile('remi-telemetry/src/error.rs', [
    {
      from: "/// fn do_work() -> TelemetryResult<()> {\n///     // 若底层 IO 失败，会自动转换为 TelemetryError::IoError\n///     std::fs::File::open('metrics.json')?;\n///\nOk(())\n/// }",
      to: '/// fn do_work() -> TelemetryResult<()> {\n///     // 若底层 IO 失败，会自动转换为 TelemetryError::IoError\n///     std::fs::File::open("metrics.json")?;\n///     Ok(())\n/// }'
    }
  ]);

  // remi-terminal/src/error.rs
  fixDocCommentFile('remi-terminal/src/error.rs', [
    {
      from: "/// match terminal_manager.open(input).await {\n///\nOk(snapshot) => { /* 处理成功 */ },\n///\nErr(TerminalError::TerminalNotFound(id)) => { /* 会话不存在 */ },\n///\nErr(TerminalError::TerminalAlreadyExists(id)) => { /* 会话已存在 */ },\n///\nErr(e) => { /* 其他错误 */ },\n/// }",
      to: '/// match terminal_manager.open(input).await {\n///     Ok(snapshot) => { /* 处理成功 */ },\n///     Err(TerminalError::TerminalNotFound(id)) => { /* 会话不存在 */ },\n///     Err(TerminalError::TerminalAlreadyExists(id)) => { /* 会话已存在 */ },\n///     Err(e) => { /* 其他错误 */ },\n/// }'
    }
  ]);

  // remi-provider/src/adapter.rs - stream_events doc comment
  fixDocCommentFile('remi-provider/src/adapter.rs', [
    {
      from: "    /// tokio::spawn(async move {\n    ///\nwhile let Ok(event) = rx.recv().await {\n    ///         // 处理事件\n    ///         println!('收到事件: {:?}', event);\n    ///\n    }\n    /// });",
      to: '    /// tokio::spawn(async move {\n    ///     while let Ok(event) = rx.recv().await {\n    ///         // 处理事件\n    ///         println!("收到事件: {:?}", event);\n    ///     }\n    /// });'
    }
  ]);
}

// Fix 3: Check for while let Ok patterns in other files that might be doc comment corruption
function checkWhileLetPatterns() {
  const files = [
    'remi-terminal/src/manager.rs',
    'remi-provider/src/service.rs',
    'remi-git/src/broadcaster.rs',
    'remi-auth/src/session_credential.rs',
    'remi-orchestration/src/lib.rs',
    'remi-orchestration/src/engine.rs',
  ];

  for (const f of files) {
    const file = path.join(ROOT, f);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if this line starts with "while let Ok" without /// prefix
      if (/^\s*while let Ok/.test(line) && !line.includes('///')) {
        // Check if the previous line is a doc comment
        if (i > 0 && lines[i - 1].trim().startsWith('///')) {
          console.log(`POTENTIAL CORRUPTION in ${f}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }
}

// Run all fixes
console.log('=== Fixing lifetime parameters ===');
fixModelsLifetimes();

console.log('\n=== Fixing doc comment corruptions ===');
fixAllDocComments();

console.log('\n=== Checking for while let Ok patterns ===');
checkWhileLetPatterns();

console.log('\n=== Done ===');
