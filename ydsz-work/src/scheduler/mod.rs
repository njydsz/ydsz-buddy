//! Scheduler module — CRON-based task scheduling.
//!
//! This module is now a placeholder; the actual implementation lives in
//! `ydsz-server::OrchestrationEngine` which deserializes `OrchestrationCommand`
//! variants and dispatches them to `SchedulerJobsState`.

// Re-export marker so existing `use crate::scheduler::*;` imports still compile.
#[derive(Debug, Clone)]
pub struct Scheduler;

impl Scheduler {
    pub fn new() -> Self { Self }
}

impl Default for Scheduler {
    fn default() -> Self { Self::new() }
}
