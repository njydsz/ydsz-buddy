const fs = require('fs');

function fix(path, old, neu) {
  let c = fs.readFileSync(path, 'utf8');
  if (!c.includes(old)) { console.log('[SKIP]', path); return false; }
  c = c.replace(old, neu);
  fs.writeFileSync(path, c, 'utf8');
  console.log('[OK]', path);
  return true;
}

// 1. Fix remi-git/src/broadcaster.rs
fix(
  'd:\\Code\\remi\\org\\modules\\remi-code\\remi-git\\src\\broadcaster.rs',
  `//!
while let Ok(event) = receiver.recv().await {
//!         println!('仓库 {} 状态更新: {:?}', event.cwd, event.status.current_branch);
//!
}`,
  `//!     while let Ok(event) = receiver.recv().await {
//!         println!("仓库 {} 状态更新: {:?}", event.cwd, event.status.current_branch);
//!     }`
);

// 2. Fix remi-git/src/error.rs
fix(
  'd:\\Code\\remi\\org\\modules\\remi-code\\remi-git\\src\\error.rs',
  `//!
Err(GitError::BranchNotFound('main'.to_string()))`,
  `//!     Err(GitError::BranchNotFound("main".to_string()))`
);

// 3. Fix remi-git/src/manager.rs
fix(
  'd:\\Code\\remi\\org\\modules\\remi-code\\remi-git\\src\\manager.rs',
  `///     println!('操作成功: {}', result.message);
///
if let Some(sha) = result.commit_sha {
///         println!('提交 SHA: {}', sha);
///
}`,
  `///     println!("操作成功: {}", result.message);
///     if let Some(sha) = result.commit_sha {
///         println!("提交 SHA: {}", sha);
///     }`
);

console.log('Done.');
