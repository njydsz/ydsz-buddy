//! # Remi Core 单元测试
//!
//! 本模块为 remi-core 提供跨子模块的集成测试。
//!
//! ## 测试范围
//!
//! - 模型序列化与反序列化
//! - 事件序列化
//! - 命令序列化
//! - ID 类型（UUID）生成与一致性
//! - 关键枚举值

#[cfg(test)]
mod test {
    use crate::events::{
        OrchestrationEvent, ProjectCreatedEvent, ProjectMetaUpdatedEvent, ProjectDeletedEvent,
        ThreadCreatedEvent, ThreadMessageSentEvent,
    };
    use crate::commands::{
        OrchestrationCommand, ProjectCreateCommand, ThreadCreateCommand,
        ThreadTurnStartCommand,
    };
    use crate::models::{
        DispatchMode, EnvMode, InteractionMode, Message, MessageRole, MessageId, Project,
        ProjectId, ProjectKind, RuntimeMode, Thread, ThreadId,
    };
    use crate::provider::{ModelSelection, ProviderKind};

    use chrono::Utc;
    use serde_json::{json, Value};
    use uuid::Uuid;

    #[test]
    fn project_id_is_uuid() {
        let id: ProjectId = Uuid::new_v4();
        assert_ne!(id, Uuid::nil());
    }

    #[test]
    fn thread_id_is_uuid() {
        let id: ThreadId = Uuid::new_v4();
        assert_ne!(id, Uuid::nil());
    }

    #[test]
    fn message_id_is_uuid() {
        let id: MessageId = Uuid::new_v4();
        assert_ne!(id, Uuid::nil());
    }

    #[test]
    fn dispatch_mode_serialization_uses_lowercase() {
        for (mode, expected) in [
            (DispatchMode::Normal, "\"normal\""),
            (DispatchMode::Review, "\"review\""),
            (DispatchMode::Plan, "\"plan\""),
            (DispatchMode::Steer, "\"steer\""),
        ] {
            let s = serde_json::to_string(&mode).unwrap();
            assert_eq!(s, expected, "dispatch mode {mode:?} serialized to {s}");
        }
    }

    #[test]
    fn runtime_mode_serialization_uses_lowercase() {
        let m = RuntimeMode::Agent;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"agent\"");

        let m = RuntimeMode::Plan;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"plan\"");
    }

    #[test]
    fn env_mode_serialization_uses_lowercase() {
        let m = EnvMode::Local;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"local\"");

        let m = EnvMode::Worktree;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"worktree\"");
    }

    #[test]
    fn project_serialization_roundtrip() {
        let p = Project {
            id: Uuid::new_v4(),
            kind: ProjectKind::Local,
            title: "Demo".to_string(),
            workspace_root: "/tmp/demo".to_string(),
            default_model_selection: Some(ModelSelection {
                provider: ProviderKind::Codex,
                model: "gpt-5".to_string(),
                options: None,
            }),
            scripts: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        };
        let json = serde_json::to_string(&p).unwrap();
        let back: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, p.id);
        assert_eq!(back.title, p.title);
        assert_eq!(back.workspace_root, p.workspace_root);
        assert_eq!(back.kind, p.kind);
    }

    #[test]
    fn thread_serialization_uses_camel_case() {
        let t = Thread {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            title: "T".to_string(),
            model_selection: ModelSelection {
                provider: ProviderKind::Codex,
                model: "gpt-5".to_string(),
                options: None,
            },
            runtime_mode: RuntimeMode::Agent,
            interaction_mode: InteractionMode::Chat,
            env_mode: EnvMode::Local,
            branch: None,
            worktree_path: None,
            associated_worktree: None,
            associated_worktree_branch: None,
            associated_worktree_ref: None,
            shell_summary: None,
            create_branch_flow_completed: false,
            is_pinned: false,
            parent_thread_id: None,
            subagent: None,
            fork_source_thread_id: None,
            sidechat_source_thread_id: None,
            last_known_pr: None,
            latest_turn: None,
            latest_user_message_at: None,
            has_pending_approvals: false,
            has_pending_user_input: false,
            has_actionable_proposed_plan: false,
            messages: vec![],
            proposed_plans: vec![],
            activities: vec![],
            checkpoints: vec![],
            session: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            archived_at: None,
            deleted_at: None,
            handoff: None,
        };
        let v: Value = serde_json::to_value(&t).unwrap();
        // 验证 camelCase 字段
        assert!(v.get("projectId").is_some());
        assert!(v.get("modelSelection").is_some());
        assert!(v.get("runtimeMode").is_some());
        assert!(v.get("interactionMode").is_some());
        assert!(v.get("envMode").is_some());
        assert!(v.get("createdAt").is_some());
    }

    #[test]
    fn message_serialization_roundtrip() {
        let m = Message {
            id: Uuid::new_v4(),
            role: MessageRole::User,
            text: "hi".to_string(),
            attachments: vec![],
            skills: vec![],
            mentions: vec![],
            dispatch_mode: Some(DispatchMode::Normal),
            turn_id: None,
            streaming: false,
            source: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let s = serde_json::to_string(&m).unwrap();
        let back: Message = serde_json::from_str(&s).unwrap();
        assert_eq!(back.text, "hi");
        assert_eq!(back.role, MessageRole::User);
    }

    #[test]
    fn project_create_event_serialization() {
        let e = ProjectCreatedEvent {
            sequence: 1,
            occurred_at: Utc::now(),
            command_id: Some("cmd-1".to_string()),
            project_id: Uuid::new_v4(),
            title: "Hello".to_string(),
            workspace_root: "/tmp".to_string(),
        };
        let v: Value = serde_json::to_value(OrchestrationEvent::ProjectCreated(e)).unwrap();
        // 事件 tag 形如 "project.created"
        assert_eq!(v["_tag"], "project.created");
        // payload 字段为 camelCase
        assert!(v.get("projectId").is_some());
        assert!(v.get("workspaceRoot").is_some());
    }

    #[test]
    fn project_meta_updated_event_serialization() {
        let e = ProjectMetaUpdatedEvent {
            sequence: 2,
            occurred_at: Utc::now(),
            command_id: None,
            project_id: Uuid::new_v4(),
            title: Some("New title".to_string()),
        };
        let v: Value = serde_json::to_value(OrchestrationEvent::ProjectMetaUpdated(e)).unwrap();
        assert_eq!(v["_tag"], "project.meta-updated");
    }

    #[test]
    fn project_deleted_event_serialization() {
        let e = ProjectDeletedEvent {
            sequence: 3,
            occurred_at: Utc::now(),
            command_id: None,
            project_id: Uuid::new_v4(),
        };
        let v: Value = serde_json::to_value(OrchestrationEvent::ProjectDeleted(e)).unwrap();
        assert_eq!(v["_tag"], "project.deleted");
    }

    #[test]
    fn thread_created_event_serialization() {
        let e = ThreadCreatedEvent {
            sequence: 4,
            occurred_at: Utc::now(),
            command_id: None,
            thread_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            title: "Thread".to_string(),
            model_selection: ModelSelection {
                provider: ProviderKind::Codex,
                model: "gpt-5".to_string(),
                options: None,
            },
            runtime_mode: RuntimeMode::Agent,
            interaction_mode: InteractionMode::Chat,
            env_mode: EnvMode::Local,
            branch: None,
            worktree_path: None,
            associated_worktree: None,
            is_pinned: false,
            parent_thread_id: None,
            subagent: None,
            fork_source_thread_id: None,
            sidechat_source_thread_id: None,
            last_known_pr: None,
            handoff: None,
        };
        let v: Value = serde_json::to_value(OrchestrationEvent::ThreadCreated(Box::new(e))).unwrap();
        assert_eq!(v["_tag"], "thread.created");
    }

    #[test]
    fn thread_message_sent_event_serialization() {
        let e = ThreadMessageSentEvent {
            sequence: 5,
            occurred_at: Utc::now(),
            command_id: None,
            thread_id: Uuid::new_v4(),
            message: Message {
                id: Uuid::new_v4(),
                role: MessageRole::User,
                text: "hi".to_string(),
                attachments: vec![],
                skills: vec![],
                mentions: vec![],
                dispatch_mode: Some(DispatchMode::Normal),
                turn_id: None,
                streaming: false,
                source: None,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            },
        };
        let v: Value = serde_json::to_value(OrchestrationEvent::ThreadMessageSent(e)).unwrap();
        assert_eq!(v["_tag"], "thread.message-sent");
    }

    #[test]
    fn project_create_command_serialization() {
        let cmd = ProjectCreateCommand {
            command_id: Some("c-1".to_string()),
            project_id: Uuid::new_v4(),
            title: "X".to_string(),
            workspace_root: "/".to_string(),
        };
        let v: Value = serde_json::to_value(OrchestrationCommand::ProjectCreate(cmd)).unwrap();
        assert_eq!(v["_tag"], "project.create");
    }

    #[test]
    fn thread_create_command_serialization() {
        let cmd = ThreadCreateCommand {
            command_id: Some("c-1".to_string()),
            thread_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            title: "T".to_string(),
            model_selection: ModelSelection {
                provider: ProviderKind::Codex,
                model: "gpt-5".to_string(),
                options: None,
            },
            runtime_mode: RuntimeMode::Agent,
            interaction_mode: InteractionMode::Chat,
            env_mode: EnvMode::Local,
            branch: None,
            worktree_path: None,
            associated_worktree_path: None,
            associated_worktree_branch: None,
            associated_worktree_ref: None,
            create_branch_flow_completed: None,
            is_pinned: None,
            parent_thread_id: None,
            subagent_agent_id: None,
            subagent_nickname: None,
            subagent_role: None,
            fork_source_thread_id: None,
            sidechat_source_thread_id: None,
            last_known_pr: None,
            handoff: None,
        };
        let v: Value = serde_json::to_value(OrchestrationCommand::ThreadCreate(cmd)).unwrap();
        assert_eq!(v["_tag"], "thread.create");
    }

    #[test]
    fn thread_turn_start_command_serialization() {
        let cmd = ThreadTurnStartCommand {
            command_id: Some("c-1".to_string()),
            thread_id: Uuid::new_v4(),
            turn_id: Uuid::new_v4().to_string(),
            message_id: Uuid::new_v4(),
            dispatch_mode: DispatchMode::Normal,
            message_text: "hello".to_string(),
            attachments: None,
            model_selection: None,
            provider_options: None,
            review_target: None,
            assistant_delivery_mode: None,
            runtime_mode: None,
            interaction_mode: None,
            source_proposed_plan: None,
        };
        let v: Value = serde_json::to_value(OrchestrationCommand::ThreadTurnStart(cmd)).unwrap();
        assert_eq!(v["_tag"], "thread.turn.start");
    }

    #[test]
    fn provider_kind_display() {
        assert_eq!(ProviderKind::Codex.to_string(), "codex");
        assert_eq!(ProviderKind::ClaudeAgent.to_string(), "claudeAgent");
        assert_eq!(ProviderKind::Cursor.to_string(), "cursor");
    }

    #[test]
    fn model_selection_serialization() {
        let m = ModelSelection {
            provider: ProviderKind::ClaudeAgent,
            model: "claude-3-opus".to_string(),
            options: None,
        };
        let s = serde_json::to_string(&m).unwrap();
        let v: Value = serde_json::from_str(&s).unwrap();
        assert_eq!(v["provider"], "claudeagent");
        assert_eq!(v["model"], "claude-3-opus");
    }

    #[test]
    fn json_helper_in_message() {
        // 简单确认 json! 宏工作
        let v = json!({
            "user": "alice",
            "age": 30
        });
        assert_eq!(v["user"], "alice");
        assert_eq!(v["age"], 30);
    }
}
