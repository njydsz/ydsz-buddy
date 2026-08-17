#[derive(Debug, Clone)]
pub struct Scheduler;

impl Scheduler {
    pub fn new() -> Self { Self }
    pub fn dispatch(&self, _command: &str) -> anyhow::Result<String> {
        Ok("stub".to_string())
    }
}

impl Default for Scheduler {
    fn default() -> Self { Self::new() }
}
