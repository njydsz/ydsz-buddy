//! # Plan Mode 模块
//!
//! 实现'Plan Mode 状态机'——让 AI 在真正动手前先产出一份计划，
//! 用户审阅 / 修改 / 通过后再进入实施。
//!
//! ## 状态机
//!
//! ```text
//!              ┌────────────┐
//!              │  Idle      │ ← 初始
//!              └─────┬──────┘
//!                    │ start_plan()
//!                    ▼
//!              ┌────────────┐
//!              │ Planning   │ ← Provider 正在思考 / 拉取上下文
//!              └─────┬──────┘
//!                    │ provider 返回 plan 草稿
//!                    ▼
//!              ┌────────────┐
//!              │ Awaiting   │ ← 等待用户审阅
//!              │ Review     │
//!              └─────┬──────┘
//!        ┌───────────┼────────────┐
//!        │           │            │
//!        │ approve() │ revise()   │ cancel()
//!        ▼           ▼            ▼
//!   ┌──────────┐ ┌─────────┐ ┌─────────┐
//!   │Approved  │ │Planning │ │Cancelled│
//!   └────┬─────┘ └─────────┘ └─────────┘
//!        │ execute()
//!        ▼
//!   ┌──────────┐
//!   │Executing │
//!   └────┬─────┘
//!        │ finish() / fail()
//!        ▼
//!   ┌────────────┐
//!   │ Completed  │
//!   └────────────┘
//! ```
//!
//! ## 设计
//!
//! - 纯状态机（不持有 Provider 引用）——适配器负责把'事件'翻译成 transition
//! - 每个 plan 有一个稳定 `id`
//! - 修订保留 `revision` 计数
//! - 状态机只保证状态合法，不保证 Provider 真的执行

use serde::{Deserialize, Serialize};

/// Plan 状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlanState {
    /// 空闲
    Idle,
    /// Provider 正在生成计划
    Planning,
    /// 等待用户审阅
    AwaitingReview,
    /// 已通过
    Approved,
    /// 正在执行
    Executing,
    /// 已完成
    Completed,
    /// 已取消
    Cancelled,
    /// 失败
    Failed,
}

impl PlanState {
    /// 是否处于'进行中'（不能直接 start）
    pub fn is_in_progress(&self) -> bool {
        matches!(
            self,
            Self::Planning | Self::AwaitingReview | Self::Approved | Self::Executing
        )
    }

    /// 是否可取消
    pub fn is_cancellable(&self) -> bool {
        matches!(
            self,
            Self::Planning | Self::AwaitingReview | Self::Approved | Self::Executing
        )
    }

    /// 是否已终结
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Cancelled | Self::Failed)
    }
}

/// Plan 步骤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    /// 步骤序号
    pub index: u32,
    /// 步骤标题
    pub title: String,
    /// 详细描述
    pub description: Option<String>,
    /// 受影响的文件 / 路径（如果有）
    pub files: Vec<String>,
}

impl PlanStep {
    pub fn new(index: u32, title: impl Into<String>) -> Self {
        Self {
            index,
            title: title.into(),
            description: None,
            files: Vec::new(),
        }
    }
}

/// 一次计划
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    /// 稳定 id
    pub id: String,
    /// 关联 thread_id
    pub thread_id: String,
    /// 状态
    pub state: PlanState,
    /// 修订次数（每次 revise 增加）
    pub revision: u32,
    /// 步骤列表
    pub steps: Vec<PlanStep>,
    /// 用户原问题 / 任务描述
    pub task: String,
    /// 备注
    pub note: Option<String>,
}

impl Plan {
    pub fn new(id: impl Into<String>, thread_id: impl Into<String>, task: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            thread_id: thread_id.into(),
            state: PlanState::Idle,
            revision: 0,
            steps: Vec::new(),
            task: task.into(),
            note: None,
        }
    }

    /// 步骤数
    pub fn step_count(&self) -> usize {
        self.steps.len()
    }
}

/// 状态机
pub struct PlanMode {
    /// 关联的 plan
    plan: Plan,
}

impl PlanMode {
    pub fn new(plan: Plan) -> Self {
        Self { plan }
    }

    pub fn plan(&self) -> &Plan {
        &self.plan
    }

    pub fn state(&self) -> PlanState {
        self.plan.state
    }

    /// 开始规划
    pub fn start_planning(&mut self) -> Result<(), PlanModeError> {
        self.transition(PlanState::Idle, PlanState::Planning)
    }

    /// Provider 返回 plan 草稿
    pub fn set_awaiting_review(&mut self, steps: Vec<PlanStep>) -> Result<(), PlanModeError> {
        self.transition(PlanState::Planning, PlanState::AwaitingReview)?;
        self.plan.steps = steps;
        Ok(())
    }

    /// 用户通过
    pub fn approve(&mut self) -> Result<(), PlanModeError> {
        self.transition(PlanState::AwaitingReview, PlanState::Approved)
    }

    /// 用户要求修订（回到 Planning 状态，revision +1）
    pub fn revise(&mut self) -> Result<(), PlanModeError> {
        match self.plan.state {
            PlanState::AwaitingReview | PlanState::Approved => {
                self.plan.state = PlanState::Planning;
                self.plan.revision += 1;
                self.plan.steps.clear();
                Ok(())
            }
            other => Err(PlanModeError::InvalidTransition {
                from: other,
                to: PlanState::Planning,
            }),
        }
    }

    /// 开始执行
    pub fn execute(&mut self) -> Result<(), PlanModeError> {
        self.transition(PlanState::Approved, PlanState::Executing)
    }

    /// 完成
    pub fn complete(&mut self) -> Result<(), PlanModeError> {
        self.transition(PlanState::Executing, PlanState::Completed)
    }

    /// 取消（任意 in_progress 状态可取消）
    pub fn cancel(&mut self) -> Result<(), PlanModeError> {
        if !self.plan.state.is_cancellable() {
            return Err(PlanModeError::InvalidTransition {
                from: self.plan.state,
                to: PlanState::Cancelled,
            });
        }
        self.plan.state = PlanState::Cancelled;
        Ok(())
    }

    /// 失败（任意状态可标记失败）
    pub fn fail(&mut self, reason: impl Into<String>) {
        self.plan.state = PlanState::Failed;
        self.plan.note = Some(reason.into());
    }

    fn transition(&mut self, from: PlanState, to: PlanState) -> Result<(), PlanModeError> {
        if self.plan.state != from {
            return Err(PlanModeError::InvalidTransition {
                from: self.plan.state,
                to,
            });
        }
        self.plan.state = to;
        Ok(())
    }
}

/// Plan Mode 错误
#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
pub enum PlanModeError {
    #[error("非法状态跃迁: {from:?} → {to:?}")]
    InvalidTransition { from: PlanState, to: PlanState },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> PlanMode {
        PlanMode::new(Plan::new("p1", "t1", "重构鉴权模块"))
    }

    #[test]
    fn full_happy_path() {
        let mut pm = fresh();
        assert_eq!(pm.state(), PlanState::Idle);
        pm.start_planning().unwrap();
        assert_eq!(pm.state(), PlanState::Planning);
        pm.set_awaiting_review(vec![
            PlanStep::new(0, "step 1"),
            PlanStep::new(1, "step 2"),
        ])
        .unwrap();
        assert_eq!(pm.state(), PlanState::AwaitingReview);
        assert_eq!(pm.plan().step_count(), 2);
        pm.approve().unwrap();
        pm.execute().unwrap();
        pm.complete().unwrap();
        assert_eq!(pm.state(), PlanState::Completed);
        assert!(pm.state().is_terminal());
    }

    #[test]
    fn revise_increments_revision() {
        let mut pm = fresh();
        pm.start_planning().unwrap();
        pm.set_awaiting_review(vec![PlanStep::new(0, "x")]).unwrap();
        pm.revise().unwrap();
        assert_eq!(pm.state(), PlanState::Planning);
        assert_eq!(pm.plan().revision, 1);
        assert_eq!(pm.plan().step_count(), 0);
    }

    #[test]
    fn cannot_approve_before_review() {
        let mut pm = fresh();
        pm.start_planning().unwrap();
        let err = pm.approve().unwrap_err();
        match err {
            PlanModeError::InvalidTransition { from, to } => {
                assert_eq!(from, PlanState::Planning);
                assert_eq!(to, PlanState::Approved);
            }
        }
    }

    #[test]
    fn cancel_in_progress() {
        let mut pm = fresh();
        pm.start_planning().unwrap();
        pm.cancel().unwrap();
        assert_eq!(pm.state(), PlanState::Cancelled);
    }

    #[test]
    fn cancel_after_terminal_is_error() {
        let mut pm = fresh();
        // Idle 状态不可取消
        let err = pm.cancel().unwrap_err();
        assert!(matches!(err, PlanModeError::InvalidTransition { .. }));
    }

    #[test]
    fn fail_records_reason() {
        let mut pm = fresh();
        pm.start_planning().unwrap();
        pm.fail("provider 进程崩溃");
        assert_eq!(pm.state(), PlanState::Failed);
        assert_eq!(pm.plan().note.as_deref(), Some("provider 进程崩溃"));
    }
}

