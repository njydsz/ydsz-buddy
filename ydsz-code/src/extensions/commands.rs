//! # Extension 命令注册表

use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;

pub type CommandId = String;
pub type CommandHandler = Arc<dyn Fn() -> anyhow::Result<()> + Send + Sync>;

pub struct CommandRegistry {
    handlers: RwLock<HashMap<CommandId, CommandHandler>>,
}

impl CommandRegistry {
    pub fn new() -> Self { Self { handlers: RwLock::new(HashMap::new()) } }
    pub fn register(&self, id: CommandId, handler: CommandHandler) { self.handlers.write().insert(id, handler); }
    pub fn unregister(&self, id: &str) { self.handlers.write().remove(id); }
    pub fn execute(&self, id: &str) -> anyhow::Result<()> {
        match self.handlers.read().get(id) { Some(h) => h(), None => anyhow::bail!("命令未注册: {}", id) }
    }
    pub fn list(&self) -> Vec<CommandId> { self.handlers.read().keys().cloned().collect() }
    pub fn contains(&self, id: &str) -> bool { self.handlers.read().contains_key(id) }
}
impl Default for CommandRegistry { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn register_and_execute() { let r = CommandRegistry::new(); r.register("test.hello".into(), Arc::new(|| Ok(()))); assert!(r.execute("test.hello").is_ok()); }
    #[test] fn execute_unregistered() { let r = CommandRegistry::new(); assert!(r.execute("missing").is_err()); }
}
