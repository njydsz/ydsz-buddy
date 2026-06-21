import fs from 'fs';
import path from 'path';

const ROOT = 'd:/Code/remi/org/modules/remi-code';

function fixFile(filePath, from, to) {
  const file = path.join(ROOT, filePath);
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(from)) {
    content = content.replace(from, to);
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
  } else {
    console.log(`Pattern not found in ${filePath}`);
  }
}

// 1. remi-terminal/src/manager.rs
fixFile('remi-terminal/src/manager.rs',
  `/// tokio::spawn(async move {
///
while let Ok(event) = rx.recv().await {
///         // 处理终端事件...
///
}
/// });`,
  `/// tokio::spawn(async move {
///     while let Ok(event) = rx.recv().await {
///         // 处理终端事件...
///     }
/// });`
);

// 2. remi-provider/src/service.rs
fixFile('remi-provider/src/service.rs',
  `    /// tokio::spawn(async move {
    ///
while let Ok(event) = rx.recv().await {
    ///         println!('收到事件: {:?}', event);
    ///
    }
    /// });`,
  `    /// tokio::spawn(async move {
    ///     while let Ok(event) = rx.recv().await {
    ///         println!("收到事件: {:?}", event);
    ///     }
    /// });`
);

// 3. remi-git/src/broadcaster.rs
fixFile('remi-git/src/broadcaster.rs',
  `    /// tokio::spawn(async move {
    ///
while let Ok(event) = receiver.recv().await {
    ///         println!('状态更新: {:?}', event.status.current_branch);
    ///
}
    /// });`,
  `    /// tokio::spawn(async move {
    ///     while let Ok(event) = receiver.recv().await {
    ///         println!("状态更新: {:?}", event.status.current_branch);
    ///     }
    /// });`
);

// 4. remi-auth/src/session_credential.rs
fixFile('remi-auth/src/session_credential.rs',
  `    /// tokio::spawn(async move {
    ///
while let Ok(event) = rx.recv().await {
    ///
match event {
    ///             SessionCredentialChange::ClientUpserted(session) => {
    ///                 println!('会话创建/更新: {}', session.session_id);
    ///
}
    ///             SessionCredentialChange::ClientRemoved(session_id) => {
    ///                 println!('会话移除: {}', session_id);
    ///
}
    ///
}
    ///
}
    /// });`,
  `    /// tokio::spawn(async move {
    ///     while let Ok(event) = rx.recv().await {
    ///         match event {
    ///             SessionCredentialChange::ClientUpserted(session) => {
    ///                 println!("会话创建/更新: {}", session.session_id);
    ///             }
    ///             SessionCredentialChange::ClientRemoved(session_id) => {
    ///                 println!("会话移除: {}", session_id);
    ///             }
    ///         }
    ///     }
    /// });`
);

console.log('\nDone!');
