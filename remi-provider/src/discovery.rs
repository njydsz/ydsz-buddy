//! Provider 发现服务模块
//!
//! 本模块提供 Provider 能力发现功能，允许动态查询 Provider 支持的功能特性。
//!
//! # 核心功能
//!
//! - **能力查询**：查询 Provider 支持的功能（如技能、命令、插件等）
//! - **动态发现**：运行时发现 Provider 的可用功能
//! - **降级处理**：不支持的功能返回空结果而非错误
//!
//! # 使用场景
//!
//! - 前端动态渲染 Provider 支持的功能菜单
//! - 根据 Provider 能力调整 UI 展示
//! - 功能可用性检查

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::debug;

use crate::adapter::ProviderAdapter;
use crate::error::{ProviderError, ProviderResult};
use remi_core::provider::ProviderKind;

/// Provider 能力信息（发现服务视图）
///
/// 这是从适配器层 `ProviderCapabilities` 转换而来的高层视图，
/// 用于向前端或其他模块暴露 Provider 的能力信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilitiesInfo {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 是否支持技能提及
    pub supports_skill_mentions: bool,
    /// 是否支持技能发现
    pub supports_skill_discovery: bool,
    /// 是否支持原生命令发现
    pub supports_native_slash_command_discovery: bool,
    /// 是否支持运行时模型列表
    pub supports_runtime_model_list: bool,
    /// 是否支持 Turn 转向
    pub supports_turn_steering: bool,
}

impl ProviderCapabilitiesInfo {
    /// 创建禁用的能力（所有功能关闭）
    pub fn disabled(provider: ProviderKind) -> Self {
        Self {
            provider,
            supports_skill_mentions: false,
            supports_skill_discovery: false,
            supports_native_slash_command_discovery: false,
            supports_runtime_model_list: false,
            supports_turn_steering: false,
        }
    }
}

/// 技能信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    /// 技能 ID
    pub id: String,
    /// 技能名称
    pub name: String,
    /// 技能描述
    pub description: Option<String>,
    /// 来源（如 'adapter', 'cache'）
    pub source: String,
}

/// 命令信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandInfo {
    /// 命令 ID
    pub id: String,
    /// 命令名称
    pub name: String,
    /// 命令描述
    pub description: Option<String>,
    /// 来源
    pub source: String,
}

/// 插件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    /// 插件 ID
    pub id: String,
    /// 插件名称
    pub name: String,
    /// 插件描述
    pub description: Option<String>,
    /// 来源
    pub source: String,
}

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    /// 模型 ID
    pub id: String,
    /// 模型名称
    pub name: String,
    /// 上下文窗口大小
    pub context_window: u32,
    /// 模型描述
    pub description: Option<String>,
}

/// Agent 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    /// Agent ID
    pub id: String,
    /// Agent 名称
    pub name: String,
    /// Agent 描述
    pub description: Option<String>,
}

/// Provider 发现服务
///
/// 负责查询 Provider 的各种能力和可用资源。
pub struct ProviderDiscoveryService {
    /// 适配器注册表
    adapters: Arc<RwLock<HashMap<ProviderKind, Arc<dyn ProviderAdapter>>>>,
    /// 能力缓存
    capabilities_cache: Arc<RwLock<HashMap<ProviderKind, ProviderCapabilitiesInfo>>>,
}

impl ProviderDiscoveryService {
    /// 创建新的发现服务
    pub fn new() -> Self {
        Self {
            adapters: Arc::new(RwLock::new(HashMap::new())),
            capabilities_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 注册适配器
    pub async fn register_adapter(&self, adapter: Arc<dyn ProviderAdapter>) {
        let kind = adapter.provider_kind();
        debug!("注册发现服务适配器: {:?}", kind);
        let mut adapters = self.adapters.write().await;
        adapters.insert(kind, adapter);
    }

    /// 获取 Provider 能力
    pub async fn get_composer_capabilities(
        &self,
        provider: ProviderKind,
    ) -> ProviderResult<ProviderCapabilitiesInfo> {
        // 先查缓存
        {
            let cache = self.capabilities_cache.read().await;
            if let Some(caps) = cache.get(&provider) {
                return Ok(caps.clone());
            }
        }

        // 获取适配器
        let adapters = self.adapters.read().await;
        let adapter = adapters
            .get(&provider)
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))?;

        // 从适配器获取能力
        let caps = adapter.capabilities();
        let capabilities = ProviderCapabilitiesInfo {
            provider,
            supports_skill_mentions: caps.supports_skill_mentions,
            supports_skill_discovery: caps.supports_skill_discovery,
            supports_native_slash_command_discovery: caps.supports_native_slash_command_discovery,
            supports_runtime_model_list: caps.supports_runtime_model_list,
            supports_turn_steering: caps.supports_turn_steering,
        };

        // 缓存结果
        let mut cache = self.capabilities_cache.write().await;
        cache.insert(provider, capabilities.clone());

        Ok(capabilities)
    }

    /// 列出技能
    pub async fn list_skills(&self, provider: ProviderKind) -> ProviderResult<Vec<SkillInfo>> {
        let adapters = self.adapters.read().await;
        let adapter = adapters
            .get(&provider)
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))?;

        // 检查是否支持技能发现
        let caps = adapter.capabilities();
        if !caps.supports_skill_discovery {
            debug!("Provider {:?} 不支持技能发现", provider);
            return Ok(vec![]);
        }

        // 从适配器获取技能列表
        let input = remi_core::provider::ProviderListSkillsInput {
            provider,
            cwd: String::new(),
            thread_id: None,
            agent_dir: None,
            force_reload: None,
        };
        match adapter.list_skills(input).await {
            Ok(result) => {
                let source = result.source.unwrap_or_else(|| "adapter".to_string());
                let skills = result
                    .skills
                    .into_iter()
                    .map(|s| SkillInfo {
                        id: s.path.clone(),
                        name: s.name,
                        description: s.description,
                        source: source.clone(),
                    })
                    .collect();
                Ok(skills)
            }
            Err(e) => {
                debug!("从适配器获取技能列表失败: {:?}", e);
                Ok(vec![])
            }
        }
    }

    /// 列出命令
    pub async fn list_commands(&self, provider: ProviderKind) -> ProviderResult<Vec<CommandInfo>> {
        let adapters = self.adapters.read().await;
        let adapter = adapters
            .get(&provider)
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))?;

        let caps = adapter.capabilities();
        if !caps.supports_native_slash_command_discovery {
            debug!("Provider {:?} 不支持命令发现", provider);
            return Ok(vec![]);
        }

        // 从适配器获取命令列表
        let input = remi_core::provider::ProviderListCommandsInput {
            provider,
            cwd: String::new(),
            thread_id: None,
            agent_dir: None,
            force_reload: None,
        };
        match adapter.list_commands(input).await {
            Ok(result) => {
                let source = result.source.unwrap_or_else(|| "adapter".to_string());
                let commands = result
                    .commands
                    .into_iter()
                    .map(|c| CommandInfo {
                        id: c.name.clone(),
                        name: c.name,
                        description: c.description,
                        source: source.clone(),
                    })
                    .collect();
                Ok(commands)
            }
            Err(e) => {
                debug!("从适配器获取命令列表失败: {:?}", e);
                Ok(vec![])
            }
        }
    }

    /// 列出插件
    pub async fn list_plugins(&self, provider: ProviderKind) -> ProviderResult<Vec<PluginInfo>> {
        let adapters = self.adapters.read().await;
        let adapter = adapters
            .get(&provider)
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))?;

        let _caps = adapter.capabilities();
        // 插件发现功能暂不支持，返回空列表
        debug!("Provider {:?} 的插件发现功能暂未实现", provider);
        Ok(vec![])
    }

    /// 列出模型
    pub async fn list_models(&self, provider: ProviderKind) -> ProviderResult<Vec<ModelInfo>> {
        let adapters = self.adapters.read().await;
        let adapter = adapters
            .get(&provider)
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))?;

        let caps = adapter.capabilities();
        if !caps.supports_runtime_model_list {
            debug!("Provider {:?} 不支持运行时模型列表", provider);
            return Ok(vec![]);
        }

        // 从适配器获取模型列表
        let input = remi_core::provider::ProviderListModelsInput {
            provider,
            binary_path: None,
            api_endpoint: None,
        };
        match adapter.list_models(input).await {
            Ok(result) => {
                let models = result
                    .models
                    .into_iter()
                    .map(|m| ModelInfo {
                        id: m.slug.clone(),
                        name: m.name,
                        context_window: m
                            .default_context_window
                            .and_then(|w: String| w.parse::<u32>().ok())
                            .unwrap_or(0),
                        description: m.upstream_provider_name,
                    })
                    .collect();
                Ok(models)
            }
            Err(e) => {
                debug!("从适配器获取模型列表失败: {:?}", e);
                Ok(vec![])
            }
        }
    }

    /// 列出 Agent
    pub async fn list_agents(&self, provider: ProviderKind) -> ProviderResult<Vec<AgentInfo>> {
        let adapters = self.adapters.read().await;
        let adapter = adapters
            .get(&provider)
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))?;

        // 从适配器获取 Agent 列表
        match adapter.list_agents().await {
            Ok(result) => {
                let agents = result
                    .agents
                    .into_iter()
                    .map(|a| AgentInfo {
                        id: a.name.clone(),
                        name: a.display_name,
                        description: a.description,
                    })
                    .collect();
                Ok(agents)
            }
            Err(e) => {
                debug!("从适配器获取 Agent 列表失败: {:?}", e);
                Ok(vec![])
            }
        }
    }

    /// 清除能力缓存
    pub async fn clear_cache(&self) {
        let mut cache = self.capabilities_cache.write().await;
        cache.clear();
        debug!("Provider 能力缓存已清除");
    }
}

impl Default for ProviderDiscoveryService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::{ProviderAdapter, ProviderCapabilities, SessionModelSwitchMode};
    use async_trait::async_trait;
    use remi_core::provider::{
        ProviderKind, ProviderListAgentsResult, ProviderListCommandsInput,
        ProviderListCommandsResult, ProviderListModelsInput, ProviderListModelsResult,
        ProviderListPluginsInput, ProviderListPluginsResult, ProviderListSkillsInput,
        ProviderListSkillsResult, ProviderReadPluginInput, ProviderReadPluginResult,
        ProviderSession, ProviderSessionStartInput, ProviderTurnStartResult, TurnInput,
    };
    use tokio::sync::broadcast;

    /// 简单 mock 适配器，仅用于测试 discovery service 的 E2E 形状
    struct MockAdapter {
        kind: ProviderKind,
        caps: ProviderCapabilities,
    }

    impl MockAdapter {
        fn new(kind: ProviderKind, caps: ProviderCapabilities) -> Self {
            Self { kind, caps }
        }
    }

    #[async_trait]
    impl ProviderAdapter for MockAdapter {
        fn provider_kind(&self) -> ProviderKind {
            self.kind
        }
        fn capabilities(&self) -> ProviderCapabilities {
            self.caps.clone()
        }
        async fn start_session(
            &self,
            _input: ProviderSessionStartInput,
        ) -> ProviderResult<ProviderSession> {
            unimplemented!()
        }
        async fn send_turn(&self, _input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
            unimplemented!()
        }
        async fn interrupt_turn(&self, _id: &str, _t: Option<&str>) -> ProviderResult<()> {
            unimplemented!()
        }
        async fn stop_session(&self, _id: &str) -> ProviderResult<()> {
            unimplemented!()
        }
        async fn stop_all(&self) -> ProviderResult<()> {
            unimplemented!()
        }
        async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>> {
            Ok(vec![])
        }
        async fn has_session(&self, _id: &str) -> ProviderResult<bool> {
            Ok(false)
        }
        async fn compact_thread(&self, _id: &str) -> ProviderResult<()> {
            unimplemented!()
        }
        async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<remi_core::provider::ProviderRuntimeEvent>> {
            let (tx, rx) = broadcast::channel(1);
            drop(tx);
            Ok(rx)
        }
        async fn list_skills(
            &self,
            _input: ProviderListSkillsInput,
        ) -> ProviderResult<ProviderListSkillsResult> {
            Ok(ProviderListSkillsResult {
                skills: vec![],
                source: Some("mock".to_string()),
                cached: Some(false),
            })
        }
        async fn list_commands(
            &self,
            _input: ProviderListCommandsInput,
        ) -> ProviderResult<ProviderListCommandsResult> {
            Ok(ProviderListCommandsResult {
                commands: vec![],
                source: Some("mock".to_string()),
                cached: Some(false),
            })
        }
        async fn list_models(
            &self,
            _input: ProviderListModelsInput,
        ) -> ProviderResult<ProviderListModelsResult> {
            Ok(ProviderListModelsResult {
                models: vec![],
                source: Some("mock".to_string()),
                cached: Some(false),
            })
        }
        async fn list_agents(&self) -> ProviderResult<ProviderListAgentsResult> {
            Ok(ProviderListAgentsResult {
                agents: vec![],
                source: Some("mock".to_string()),
                cached: Some(false),
            })
        }
        async fn list_plugins(
            &self,
            _input: ProviderListPluginsInput,
        ) -> ProviderResult<ProviderListPluginsResult> {
            unimplemented!()
        }
        async fn read_plugin(
            &self,
            _input: ProviderReadPluginInput,
        ) -> ProviderResult<ProviderReadPluginResult> {
            unimplemented!()
        }
    }

    /// marker trait to avoid bringing the real event type into the test
    fn _adapter_runtime_event_marker() -> remi_core::provider::ProviderRuntimeEvent {
        remi_core::provider::ProviderRuntimeEvent::TurnDelta {
            session_id: String::new(),
            turn_id: String::new(),
            delta: String::new(),
        }
    }

    #[tokio::test]
    async fn test_unregistered_provider() {
        let service = ProviderDiscoveryService::new();

        // 测试未注册的 Provider
        let result = service.get_composer_capabilities(ProviderKind::ClaudeAgent).await;
        assert!(result.is_err());

        // 测试列出技能（应该返回错误，因为 Provider 未注册）
        let skills = service.list_skills(ProviderKind::ClaudeAgent).await;
        assert!(skills.is_err());
    }

    fn full_caps() -> ProviderCapabilities {
        ProviderCapabilities {
            session_model_switch: SessionModelSwitchMode::InSession,
            supports_skill_mentions: true,
            supports_skill_discovery: true,
            supports_native_slash_command_discovery: true,
            supports_plugin_mentions: true,
            supports_plugin_discovery: true,
            supports_runtime_model_list: true,
            supports_turn_steering: true,
            supports_thread_compaction: true,
            supports_thread_import: true,
        }
    }

    #[tokio::test]
    async fn test_composer_capabilities_e2e_shape() {
        // 模拟一次完整的 E2E：注册 Adapter -> 获取能力 -> 序列化为前端契约 JSON
        let service = ProviderDiscoveryService::new();
        let caps = full_caps();
        service
            .register_adapter(std::sync::Arc::new(MockAdapter::new(
                ProviderKind::Codex,
                caps,
            )))
            .await;

        let info = service
            .get_composer_capabilities(ProviderKind::Codex)
            .await
            .expect("获取 Codex 能力应成功");

        // 验证：每个前端契约字段都存在且被正确序列化
        let json = serde_json::to_value(&info).expect("序列化应成功");
        assert_eq!(json["provider"], "codex");
        assert_eq!(json["supportsSkillMentions"], true);
        assert_eq!(json["supportsSkillDiscovery"], true);
        assert_eq!(json["supportsNativeSlashCommandDiscovery"], true);
        assert_eq!(json["supportsPluginMentions"], true);
        assert_eq!(json["supportsPluginDiscovery"], true);
        assert_eq!(json["supportsRuntimeModelList"], true);
        assert_eq!(json["supportsTurnSteering"], true);
        assert_eq!(json["supportsThreadCompaction"], true);
        assert_eq!(json["supportsThreadImport"], true);
    }

    #[tokio::test]
    async fn test_composer_capabilities_cache_hit() {
        let service = ProviderDiscoveryService::new();
        let caps = full_caps();
        service
            .register_adapter(std::sync::Arc::new(MockAdapter::new(
                ProviderKind::ClaudeAgent,
                caps,
            )))
            .await;

        // 第一次获取
        let first = service
            .get_composer_capabilities(ProviderKind::ClaudeAgent)
            .await
            .expect("第一次获取应成功");
        // 第二次获取应命中缓存（应与第一次返回内容一致）
        let second = service
            .get_composer_capabilities(ProviderKind::ClaudeAgent)
            .await
            .expect("第二次获取应成功");
        assert_eq!(first.provider, second.provider);
        assert_eq!(first.supports_skill_mentions, second.supports_skill_mentions);
        assert_eq!(
            first.supports_plugin_discovery,
            second.supports_plugin_discovery
        );
        // 缓存被清除后应能重新获取
        service.clear_cache().await;
        let third = service
            .get_composer_capabilities(ProviderKind::ClaudeAgent)
            .await
            .expect("清缓存后获取应成功");
        assert_eq!(first.provider, third.provider);
    }

    #[test]
    fn test_capabilities_info_alignment() {
        // 静态校验：disabled 必须与前端契约字段一一对应
        let info = ProviderCapabilitiesInfo::disabled(ProviderKind::Gemini);
        let json = serde_json::to_value(&info).expect("序列化应成功");
        let required = [
            "provider",
            "supportsSkillMentions",
            "supportsSkillDiscovery",
            "supportsNativeSlashCommandDiscovery",
            "supportsPluginMentions",
            "supportsPluginDiscovery",
            "supportsRuntimeModelList",
            "supportsTurnSteering",
            "supportsThreadCompaction",
            "supportsThreadImport",
        ];
        for field in required {
            assert!(
                json.get(field).is_some(),
                "ProviderCapabilitiesInfo 缺少前端契约字段: {}",
                field
            );
        }
    }
}

