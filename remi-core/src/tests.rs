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
//! - 关键枚举的序列化格式
#[cfg(test)]
mod test {
    use crate::events::{
        EventMetadata, OrchestrationEvent, ProjectCreatedEvent, ProjectMetaUpdatedEvent,
        ProjectDeletedEvent, ThreadCreatedEvent, ThreadMessageSentEvent,
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
        // 验证 ProjectId 是有效的 UUID
        let id: ProjectId = Uuid::new_v4();
        assert_ne!(id, Uuid::nil());
    }

    #[test]
    fn thread_id_is_uuid() {
        // 验证 ThreadId 是有效的 UUID
        let id: ThreadId = Uuid::new_v4();
        assert_ne!(id, Uuid::nil());
    }

    #[test]
    fn message_id_is_uuid() {
        // 验证 MessageId 是有效的 UUID
        let id: MessageId = Uuid::new_v4();
        assert_ne!(id, Uuid::nil());
    }

    #[test]
    fn dispatch_mode_serialization_uses_lowercase() {
        // 验证 DispatchMode 枚举序列化为小写字符串
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
        // 验证 RuntimeMode 枚举序列化为小写字符串
        let m = RuntimeMode::Work;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"work\"");

        let m = RuntimeMode::Code;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"code\"");
    }

    #[test]
    fn env_mode_serialization_uses_lowercase() {
        // 验证 EnvMode 枚举序列化为小写字符串
        let m = EnvMode::Local;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"local\"");

        let m = EnvMode::Worktree;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"worktree\"");
    }

    #[test]
    fn project_serialization_roundtrip() {
        // 验证 Project 实体的序列化/反序列化往返一致性
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
        // 验证 Thread 实体序列化为 camelCase 字段名
        let t = Thread {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            title: "T".to_string(),
            model_selection: ModelSelection {
                provider: ProviderKind::Codex,
                model: "gpt-5".to_string(),
                options: None,
            },
            runtime_mode: RuntimeMode::Code,
            interaction_mode: InteractionMode::Agent,
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
        // 验证 Message 实体的序列化/反序列化往返一致性
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
        // 验证 ProjectCreatedEvent 序列化为正确的事件标签和字段格式
        let e = ProjectCreatedEvent {
            sequence: 1,
            occurred_at: Utc::now(),
            command_id: Some("cmd-1".to_string()),
            event_metadata: EventMetadata::new(),
            project_id: Uuid::new_v4(),
            title: "Hello".to_string(),
            workspace_root: "/tmp".to_string(),
        };
        let v: Value = serde_json::to_value(OrchestrationEvent::ProjectCreated(e)).unwrap();
        // 事件 tag 形如 'project.created'
        assert_eq!(v["_tag"], "project.created");
        // payload 字段为 camelCase
        assert!(v.get("projectId").is_some());
        assert!(v.get("workspaceRoot").is_some());
    }

    #[test]
    fn project_meta_updated_event_serialization() {
        // 验证 ProjectMetaUpdatedEvent 序列化为正确的事件标签 'project.meta-updated'
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
            runtime_mode: RuntimeMode::Code,
            interaction_mode: InteractionMode::Agent,
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
        // 验证 ProjectCreateCommand 序列化为正确的命令标签
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
        // 验证 ThreadCreateCommand 序列化为正确的命令标签
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
            runtime_mode: RuntimeMode::Code,
            interaction_mode: InteractionMode::Agent,
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
        // 验证 ThreadTurnStartCommand 序列化为正确的命令标签
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
        // 验证 ProviderKind 的 Display 实现输出正确的字符串
        assert_eq!(ProviderKind::Codex.to_string(), "codex");
        assert_eq!(ProviderKind::ClaudeAgent.to_string(), "claudeAgent");
        assert_eq!(ProviderKind::Cursor.to_string(), "cursor");
    }

    #[test]
    fn model_selection_serialization() {
        // 验证 ModelSelection 的序列化字段名和值
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
        // 验证 serde_json 的 json! 宏工具正常工作
        let v = json!({
            "user": "alice",
            "age": 30
        });
        assert_eq!(v["user"], "alice");
        assert_eq!(v["age"], 30);
    }


    #[test]
    fn event_metadata_serialization() {
        // 验证 EventMetadata 序列化为 camelCase
        let metadata = EventMetadata::new();
        let v: Value = serde_json::to_value(&metadata).unwrap();
        assert!(v.get("eventId").is_some());
        assert!(v.get("causationEventId").is_some());
        assert!(v.get("correlationId").is_some());
        assert!(v.get("metadata").is_some());
    }

    #[test]
    fn event_metadata_with_causation() {
        // 验证 EventMetadata::with_causation 正确设置因果事件 ID
        let metadata = EventMetadata::with_causation("cause-123".to_string());
        assert_eq!(metadata.causation_event_id, Some("cause-123".to_string()));
        assert!(metadata.event_id.len() > 0);
    }

    #[test]
    fn checkpoint_status_serialization() {
        // 验证 CheckpointStatus 枚举序列化为小写
        use crate::models::CheckpointStatus;
        
        let s = serde_json::to_string(&CheckpointStatus::Ready).unwrap();
        assert_eq!(s, "\"ready\"");
        
        let s = serde_json::to_string(&CheckpointStatus::Missing).unwrap();
        assert_eq!(s, "\"missing\"");
        
        let s = serde_json::to_string(&CheckpointStatus::Error).unwrap();
        assert_eq!(s, "\"error\"");
    }

    #[test]
    fn activity_payload_serialization() {
        // 验证 ActivityPayload 判别联合序列化
        use crate::models::{ActivityPayload, FileChangeEntry};
        
        let payload = ActivityPayload::ToolCall {
            tool_name: "read_file".to_string(),
            input: Some(json!({"path": "/tmp/test.txt"})),
            output: Some(json!({"content": "hello"})),
            success: true,
        };
        let v: Value = serde_json::to_value(&payload).unwrap();
        assert_eq!(v["type"], "toolCall");
        // serde renames tool_name to tool_name (snake_case for enum variants)
        assert!(v.get("tool_name").is_some() || v.get("toolName").is_some());
        assert_eq!(v["success"], true);
    }

    #[test]
    fn activity_payload_file_change_serialization() {
        // 验证 ActivityPayload::FileChange 序列化
        use crate::models::{ActivityPayload, FileChangeEntry};
        
        let payload = ActivityPayload::FileChange {
            files: vec![
                FileChangeEntry {
                    path: "src/main.rs".to_string(),
                    change_type: "modified".to_string(),
                    additions: Some(10),
                    deletions: Some(5),
                },
            ],
        };
        let v: Value = serde_json::to_value(&payload).unwrap();
        assert_eq!(v["type"], "fileChange");
        assert_eq!(v["files"][0]["path"], "src/main.rs");
    }

    #[test]
    fn latest_turn_serialization() {
        // 验证 LatestTurn 序列化为 camelCase
        use crate::models::{LatestTurn, TurnStatus};
        
        let turn = LatestTurn {
            id: "turn-1".to_string(),
            status: TurnStatus::Running,
            requested_at: Some(Utc::now()),
            started_at: Some(Utc::now()),
            completed_at: None,
            assistant_message_id: None,
        };
        let v: Value = serde_json::to_value(&turn).unwrap();
        assert!(v.get("requestedAt").is_some());
        assert!(v.get("startedAt").is_some());
        assert!(v.get("completedAt").is_none()); // None fields should be skipped
    }

    #[test]
    fn checkpoint_serialization_with_new_fields() {
        // 验证 Checkpoint 序列化包含新字段
        use crate::models::{Checkpoint, CheckpointStatus, CheckpointFile};
        
        let checkpoint = Checkpoint {
            id: "cp-1".to_string(),
            thread_id: Uuid::new_v4(),
            turn_id: "turn-1".to_string(),
            git_ref: "abc123".to_string(),
            description: "Test checkpoint".to_string(),
            status: CheckpointStatus::Ready,
            checkpoint_turn_count: 5,
            files: vec![
                CheckpointFile {
                    path: "src/main.rs".to_string(),
                    status: "modified".to_string(),
                    additions: 10,
                    deletions: 5,
                },
            ],
            assistant_message_id: Some("msg-1".to_string()),
            created_at: Utc::now(),
            completed_at: Some(Utc::now()),
        };
        let v: Value = serde_json::to_value(&checkpoint).unwrap();
        assert_eq!(v["status"], "ready");
        assert_eq!(v["checkpointTurnCount"], 5);
        assert_eq!(v["files"][0]["path"], "src/main.rs");
        assert_eq!(v["assistantMessageId"], "msg-1");
    }
}
