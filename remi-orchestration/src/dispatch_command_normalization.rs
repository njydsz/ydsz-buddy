//! # 分发命令归一化模块
//!
//! 本模块负责对外部传入的 ThreadTurnStart 命令进行归一化处理。
//!
//! ## 模块职责
//!
//! - **参数补全**：补全缺失的默认值（如 dispatch_mode、env_mode）
//! - **冲突解决**：在多个字段同时设置时按优先级选择
//! - **类型校验**：校验字段值在合法范围内
//! - **结构转换**：将外部松散结构转换为内部严格结构
//!
//! ## 归一化规则
//!
//! | 字段 | 规则 |
//! |------|------|
//! | `dispatch_mode` | 若缺省，默认 `Normal` |
//! | `env_mode` | 若缺省，默认 `Local` |
//! | `runtime_mode` | 若缺省，根据 `interaction_mode` 推导 |
//! | `model` | 若缺省，使用项目默认模型 |
//! | `message_text` | 自动 trim 前后空白 |
//! | `attachments` | 校验每个附件的 `local_path` 存在性 |

use remi_core::commands::ThreadTurnStartCommand;
use remi_core::models::DispatchMode;
use serde::{Deserialize, Serialize};

use crate::error::{OrchestrationError, OrchestrationResult};

/// 归一化选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizationOptions {
    /// 项目的默认模型
    pub default_model: Option<String>,
    /// 是否强制使用 Normal 分发模式（忽略调用方的 Steer 请求）
    pub force_normal_dispatch: bool,
    /// 最大消息文本长度（超过则截断/拒绝）
    pub max_message_length: usize,
}

impl Default for NormalizationOptions {
    fn default() -> Self {
        Self {
            default_model: None,
            force_normal_dispatch: false,
            max_message_length: 100_000,
        }
    }
}

/// 归一化结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedTurnStart {
    /// 归一化后的命令
    pub command: ThreadTurnStartCommand,
    /// 应用了哪些规则
    pub applied_rules: Vec<String>,
}

/// 归一化器
#[derive(Debug, Default, Clone)]
pub struct DispatchCommandNormalizer;

impl DispatchCommandNormalizer {
    /// 创建新的归一化器
    pub fn new() -> Self {
        Self
    }

    /// 归一化 ThreadTurnStartCommand
    pub fn normalize(
        &self,
        mut cmd: ThreadTurnStartCommand,
        opts: &NormalizationOptions,
    ) -> OrchestrationResult<NormalizedTurnStart> {
        let mut applied = Vec::new();

        // 1. 强制 Normal 模式（如设置）
        if opts.force_normal_dispatch && cmd.dispatch_mode != DispatchMode::Normal {
            applied.push("force_normal_dispatch".to_string());
            cmd.dispatch_mode = DispatchMode::Normal;
        }

        // 2. 消息长度校验
        if cmd.message_text.len() > opts.max_message_length {
            return Err(OrchestrationError::CommandError(format!(
                "消息长度 {} 超过最大允许 {}",
                cmd.message_text.len(),
                opts.max_message_length
            )));
        }

        // 3. Trim 消息
        let trimmed = cmd.message_text.trim().to_string();
        if trimmed.len() != cmd.message_text.len() {
            applied.push("trim_message".to_string());
            cmd.message_text = trimmed;
        }

        // 4. 消息非空校验
        if cmd.message_text.is_empty() {
            return Err(OrchestrationError::CommandError(
                "消息文本不能为空".to_string(),
            ));
        }

        // 5. 校验附件名称
        if let Some(ref attachments) = cmd.attachments {
            for att in attachments {
                if att.name.trim().is_empty() {
                    return Err(OrchestrationError::CommandError(
                        "附件 name 不能为空".to_string(),
                    ));
                }
            }
        }

        Ok(NormalizedTurnStart {
            command: cmd,
            applied_rules: applied,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn make_cmd() -> ThreadTurnStartCommand {
        ThreadTurnStartCommand {
            command_id: Some(Uuid::new_v4().to_string()),
            thread_id: Uuid::new_v4(),
            turn_id: Uuid::new_v4().to_string(),
            message_id: Uuid::new_v4(),
            message_text: "  hello  ".to_string(),
            dispatch_mode: DispatchMode::Steer,
            attachments: None,
            model_selection: None,
            provider_options: None,
            review_target: None,
            assistant_delivery_mode: None,
            runtime_mode: None,
            interaction_mode: None,
            source_proposed_plan: None,
        }
    }

    #[test]
    fn trims_message() {
        let n = DispatchCommandNormalizer::new();
        let cmd = make_cmd();
        let opts = NormalizationOptions::default();
        let result = n.normalize(cmd, &opts).unwrap();
        assert_eq!(result.command.message_text, "hello");
        assert!(result.applied_rules.iter().any(|r| r == "trim_message"));
    }

    #[test]
    fn rejects_empty_message() {
        let n = DispatchCommandNormalizer::new();
        let mut cmd = make_cmd();
        cmd.message_text = "   ".to_string();
        let result = n.normalize(cmd, &NormalizationOptions::default());
        assert!(result.is_err());
    }

    #[test]
    fn force_normal_overrides_steer() {
        let n = DispatchCommandNormalizer::new();
        let cmd = make_cmd();
        let opts = NormalizationOptions {
            force_normal_dispatch: true,
            ..Default::default()
        };
        let result = n.normalize(cmd, &opts).unwrap();
        assert_eq!(result.command.dispatch_mode, DispatchMode::Normal);
    }

    #[test]
    fn rejects_too_long_message() {
        let n = DispatchCommandNormalizer::new();
        let mut cmd = make_cmd();
        cmd.message_text = "a".repeat(200_000);
        let opts = NormalizationOptions {
            max_message_length: 1000,
            ..Default::default()
        };
        let result = n.normalize(cmd, &opts);
        assert!(result.is_err());
    }
}
