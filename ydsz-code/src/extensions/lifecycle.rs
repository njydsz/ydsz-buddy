//! # Extension 生命周期管理

use std::sync::Arc;
use tracing::{debug, info};
use super::manifest::ActivationEvent;
use super::registry::{ExtensionRegistry, ExtensionState};

pub struct ExtensionLifecycle {
    pub registry: Arc<ExtensionRegistry>,
}
pub struct ExtensionActivator {
    pub registry: Arc<ExtensionRegistry>,
}

impl ExtensionLifecycle {
    pub fn new(registry: Arc<ExtensionRegistry>) -> Self { Self { registry } }
    pub fn activate(&self, name: &str) -> anyhow::Result<()> {
        let entry = self.registry.get(name).ok_or_else(|| anyhow::anyhow!("扩展未安装: {}", name))?;
        if entry.state == ExtensionState::Activated { return Ok(()); }
        info!("激活扩展: {}", name);
        self.registry.update_state(name, ExtensionState::Activated);
        Ok(())
    }
    pub fn deactivate(&self, name: &str) -> anyhow::Result<()> {
        self.registry.update_state(name, ExtensionState::Deactivated);
        Ok(())
    }
    pub fn trigger_activation(&self, event: &ActivationEvent) -> Vec<String> {
        let mut activated = Vec::new();
        for ext in self.registry.list() {
            if ext.state == ExtensionState::Activated { continue; }
            for ae in &ext.manifest.activation_events {
                if Self::events_match(ae, event) { if self.activate(&ext.manifest.name).is_ok() { activated.push(ext.manifest.name); } break; }
            }
        }
        activated
    }
    fn events_match(a: &ActivationEvent, b: &ActivationEvent) -> bool {
        match (a, b) {
            (ActivationEvent::OnStartup, ActivationEvent::OnStartup) => true,
            (ActivationEvent::OnCommand { command_id: a }, ActivationEvent::OnCommand { command_id: b }) => a == b,
            (ActivationEvent::OnLanguage { language: a }, ActivationEvent::OnLanguage { language: b }) => a == b,
            _ => false,
        }
    }
}

impl ExtensionActivator {
    pub fn new(registry: Arc<ExtensionRegistry>) -> Self { Self { registry } }
    pub fn on_startup(&self) -> Vec<String> { ExtensionLifecycle::new(self.registry.clone()).trigger_activation(&ActivationEvent::OnStartup) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::manifest::ExtensionManifest;
    use super::super::registry::ExtensionEntry;

    fn make_ext(name: &str, events: Vec<ActivationEvent>) -> ExtensionEntry {
        ExtensionEntry {
            manifest: ExtensionManifest { name: name.to_string(), version: "1.0.0".to_string(), display_name: name.to_string(), description: String::new(), author: String::new(), categories: vec![], main: None, contributes: Default::default(), extension_dependencies: vec![], activation_events: events },
            install_path: "/test".to_string(), state: ExtensionState::Installed, error: None,
        }
    }
    #[test] fn activate_extension() { let r = Arc::new(ExtensionRegistry::new()); r.register(make_ext("ext1", vec![])); ExtensionLifecycle::new(r.clone()).activate("ext1").unwrap(); assert_eq!(r.get("ext1").unwrap().state, ExtensionState::Activated); }
    #[test] fn trigger_on_startup() { let r = Arc::new(ExtensionRegistry::new()); r.register(make_ext("ext1", vec![ActivationEvent::OnStartup])); r.register(make_ext("ext2", vec![])); let activated = ExtensionLifecycle::new(r.clone()).trigger_activation(&ActivationEvent::OnStartup); assert_eq!(activated, vec!["ext1"]); }
}
