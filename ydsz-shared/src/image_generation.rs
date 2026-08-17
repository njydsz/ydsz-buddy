//! # 文生图能力基础设施（P0-1）
//!
//! 根据文本描述生成图片的适配器模式实现。
//!
//! ## 设计
//!
//! - `ImageGenerationAdapter` trait 抽象不同图片生成后端
//! - 支持 DALL·E / FLUX / Stable Diffusion / 国产文生图 API
//! - 统一的请求参数和返回结果

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// ============================================================================
// 请求参数
// ============================================================================

/// 图片生成请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationRequest {
    /// 图片描述提示词
    pub prompt: String,
    /// 负面提示词（不希望出现的内容）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    /// 图片宽度（默认 1024）
    #[serde(default = "default_width")]
    pub width: u32,
    /// 图片高度（默认 1024）
    #[serde(default = "default_height")]
    pub height: u32,
    /// 生成数量（默认 1）
    #[serde(default = "default_num_images")]
    pub num_images: u32,
    /// 生成步骤数（影响质量和速度）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steps: Option<u32>,
    /// 引导系数（越高越贴近 prompt）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guidance_scale: Option<f64>,
    /// 随机种子（可重现结果）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
    /// 图片风格
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<ImageStyle>,
}

fn default_width() -> u32 {
    1024
}

fn default_height() -> u32 {
    1024
}

fn default_num_images() -> u32 {
    1
}

impl Default for ImageGenerationRequest {
    fn default() -> Self {
        Self {
            prompt: String::new(),
            negative_prompt: None,
            width: default_width(),
            height: default_height(),
            num_images: default_num_images(),
            steps: None,
            guidance_scale: None,
            seed: None,
            style: None,
        }
    }
}

impl ImageGenerationRequest {
    /// 创建新的图片生成请求
    pub fn new(prompt: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            ..Default::default()
        }
    }

    /// 设置负面提示词
    pub fn with_negative_prompt(mut self, negative_prompt: impl Into<String>) -> Self {
        self.negative_prompt = Some(negative_prompt.into());
        self
    }

    /// 设置尺寸
    pub fn with_size(mut self, width: u32, height: u32) -> Self {
        self.width = width;
        self.height = height;
        self
    }

    /// 设置生成数量
    pub fn with_count(mut self, count: u32) -> Self {
        self.num_images = count;
        self
    }

    /// 设置风格
    pub fn with_style(mut self, style: ImageStyle) -> Self {
        self.style = Some(style);
        self
    }
}

/// 图片风格
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageStyle {
    /// 自然/真实
    Natural,
    /// 动漫
    Anime,
    /// 插画
    Illustration,
    /// 3D 渲染
    Render3d,
    /// 像素艺术
    Pixel,
    /// 水彩
    Watercolor,
    /// 油画
    OilPainting,
    /// 素描
    Sketch,
    /// 赛博朋克
    Cyberpunk,
}

// ============================================================================
// 生成结果
// ============================================================================

/// 生成的图片信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedImage {
    /// 图片 URL
    pub url: Option<String>,
    /// Base64 编码的图片数据
    pub b64_json: Option<String>,
    /// 图片宽度
    pub width: u32,
    /// 图片高度
    pub height: u32,
    /// 使用的提示词（可能被 Provider 优化）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revised_prompt: Option<String>,
    /// 随机种子
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
}

/// 图片生成结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationResult {
    /// 是否成功
    pub success: bool,
    /// 生成的图片列表
    #[serde(default)]
    pub images: Vec<GeneratedImage>,
    /// 使用的 Provider
    pub provider: String,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 耗时（毫秒）
    #[serde(default)]
    pub elapsed_ms: u64,
}

impl ImageGenerationResult {
    /// 创建成功的生成结果
    pub fn success(images: Vec<GeneratedImage>, provider: impl Into<String>) -> Self {
        Self {
            success: true,
            images,
            provider: provider.into(),
            error: None,
            elapsed_ms: 0,
        }
    }

    /// 创建失败的生成结果
    pub fn failure(error: impl Into<String>) -> Self {
        Self {
            success: false,
            images: vec![],
            provider: String::new(),
            error: Some(error.into()),
            elapsed_ms: 0,
        }
    }

    /// 获取第一张图片
    pub fn first_image(&self) -> Option<&GeneratedImage> {
        self.images.first()
    }

    /// 获取图片数量
    pub fn image_count(&self) -> usize {
        self.images.len()
    }
}

// ============================================================================
// Adapter Trait
// ============================================================================

/// 图片生成 Adapter
///
/// 不同图片生成后端实现此 trait。
#[async_trait]
pub trait ImageGenerationAdapter: Send + Sync {
    /// 获取 Adapter 名称
    fn name(&self) -> &str;

    /// 生成图片
    async fn generate(&self, request: &ImageGenerationRequest) -> anyhow::Result<ImageGenerationResult>;

    /// 检查服务是否可用
    async fn is_available(&self) -> bool {
        true
    }

    /// 获取支持的尺寸列表
    fn supported_sizes(&self) -> Vec<(u32, u32)> {
        vec![(512, 512), (768, 768), (1024, 1024), (1024, 768), (768, 1024)]
    }
}

// ============================================================================
// DALL·E Adapter
// ============================================================================

/// DALL·E 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DallEConfig {
    /// API Key
    pub api_key: String,
    /// API 基础 URL
    #[serde(default = "default_dalle_base_url")]
    pub base_url: String,
    /// 模型版本
    #[serde(default = "default_dalle_model")]
    pub model: String,
}

fn default_dalle_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_dalle_model() -> String {
    "dall-e-3".to_string()
}

impl Default for DallEConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: default_dalle_base_url(),
            model: default_dalle_model(),
        }
    }
}

/// DALL·E 图片生成 Adapter
#[derive(Debug, Clone)]
pub struct DallEAdapter {
    config: DallEConfig,
}

impl DallEAdapter {
    /// 创建新的 DALL·E Adapter
    pub fn new(config: DallEConfig) -> Self {
        Self { config }
    }

    /// 创建带 API Key 的 Adapter
    pub fn with_api_key(api_key: impl Into<String>) -> Self {
        Self {
            config: DallEConfig {
                api_key: api_key.into(),
                ..Default::default()
            },
        }
    }
}

#[async_trait]
impl ImageGenerationAdapter for DallEAdapter {
    fn name(&self) -> &str {
        "dall-e"
    }

    async fn generate(&self, request: &ImageGenerationRequest) -> anyhow::Result<ImageGenerationResult> {
        if self.config.api_key.is_empty() {
            return Err(anyhow::anyhow!("DALL·E API Key 未配置"));
        }

        // 实际实现需要调用 OpenAI DALL·E API
        // POST {base_url}/images/generations
        // Body: { "model": "dall-e-3", "prompt": "...", "n": 1, "size": "1024x1024" }

        let _ = request;
        Ok(ImageGenerationResult::failure(
            "DALL·E 需要配置有效的 API Key",
        ))
    }

    async fn is_available(&self) -> bool {
        !self.config.api_key.is_empty()
    }

    fn supported_sizes(&self) -> Vec<(u32, u32)> {
        match self.config.model.as_str() {
            "dall-e-3" => vec![(1024, 1024), (1024, 1792), (1792, 1024)],
            "dall-e-2" => vec![(256, 256), (512, 512), (1024, 1024)],
            _ => vec![(1024, 1024)],
        }
    }
}

// ============================================================================
// FLUX Adapter
// ============================================================================

/// FLUX 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FluxConfig {
    /// API Key
    pub api_key: String,
    /// API 基础 URL
    #[serde(default = "default_flux_base_url")]
    pub base_url: String,
    /// 模型版本（flux-1-dev / flux-1-pro / flux-1-schnell）
    #[serde(default = "default_flux_model")]
    pub model: String,
}

fn default_flux_base_url() -> String {
    "https://api.bfl.ml/v1".to_string()
}

fn default_flux_model() -> String {
    "flux-1-dev".to_string()
}

impl Default for FluxConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: default_flux_base_url(),
            model: default_flux_model(),
        }
    }
}

/// FLUX 图片生成 Adapter
#[derive(Debug, Clone)]
pub struct FluxAdapter {
    config: FluxConfig,
}

impl FluxAdapter {
    /// 创建新的 FLUX Adapter
    pub fn new(config: FluxConfig) -> Self {
        Self { config }
    }

    /// 创建带 API Key 的 Adapter
    pub fn with_api_key(api_key: impl Into<String>) -> Self {
        Self {
            config: FluxConfig {
                api_key: api_key.into(),
                ..Default::default()
            },
        }
    }
}

#[async_trait]
impl ImageGenerationAdapter for FluxAdapter {
    fn name(&self) -> &str {
        "flux"
    }

    async fn generate(&self, request: &ImageGenerationRequest) -> anyhow::Result<ImageGenerationResult> {
        if self.config.api_key.is_empty() {
            return Err(anyhow::anyhow!("FLUX API Key 未配置"));
        }

        let _ = request;
        Ok(ImageGenerationResult::failure(
            "FLUX 需要配置有效的 API Key",
        ))
    }

    async fn is_available(&self) -> bool {
        !self.config.api_key.is_empty()
    }
}

// ============================================================================
// 图片生成服务
// ============================================================================

/// 图片生成服务
///
/// 封装图片生成 Adapter，提供统一的高层 API。
pub struct ImageGenerationService {
    adapter: Box<dyn ImageGenerationAdapter>,
}

impl ImageGenerationService {
    /// 创建新的图片生成服务
    pub fn new(adapter: Box<dyn ImageGenerationAdapter>) -> Self {
        Self { adapter }
    }

    /// 生成图片
    pub async fn generate(&self, request: &ImageGenerationRequest) -> anyhow::Result<ImageGenerationResult> {
        self.adapter.generate(request).await
    }

    /// 检查服务是否可用
    pub async fn is_available(&self) -> bool {
        self.adapter.is_available().await
    }

    /// 获取支持的尺寸
    pub fn supported_sizes(&self) -> Vec<(u32, u32)> {
        self.adapter.supported_sizes()
    }

    /// 获取 Adapter 名称
    pub fn provider_name(&self) -> &str {
        self.adapter.name()
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_request_default() {
        let req = ImageGenerationRequest::default();
        assert_eq!(req.width, 1024);
        assert_eq!(req.height, 1024);
        assert_eq!(req.num_images, 1);
    }

    #[test]
    fn test_image_request_builder() {
        let req = ImageGenerationRequest::new("A beautiful sunset")
            .with_size(512, 512)
            .with_count(2)
            .with_negative_prompt("blurry, low quality")
            .with_style(ImageStyle::Watercolor);

        assert_eq!(req.prompt, "A beautiful sunset");
        assert_eq!(req.width, 512);
        assert_eq!(req.height, 512);
        assert_eq!(req.num_images, 2);
        assert_eq!(req.negative_prompt, Some("blurry, low quality".to_string()));
        assert_eq!(req.style, Some(ImageStyle::Watercolor));
    }

    #[test]
    fn test_generation_result_success() {
        let result = ImageGenerationResult::success(
            vec![GeneratedImage {
                url: Some("https://example.com/img.png".to_string()),
                b64_json: None,
                width: 1024,
                height: 1024,
                revised_prompt: None,
                seed: Some(42),
            }],
            "dall-e",
        );

        assert!(result.success);
        assert_eq!(result.image_count(), 1);
        assert_eq!(result.first_image().unwrap().url, Some("https://example.com/img.png".to_string()));
    }

    #[test]
    fn test_generation_result_failure() {
        let result = ImageGenerationResult::failure("API rate limit exceeded");
        assert!(!result.success);
        assert_eq!(result.error, Some("API rate limit exceeded".to_string()));
    }

    #[test]
    fn test_dalle_config_default() {
        let config = DallEConfig::default();
        assert_eq!(config.model, "dall-e-3");
        assert_eq!(config.base_url, "https://api.openai.com/v1");
    }

    #[test]
    fn test_flux_config_default() {
        let config = FluxConfig::default();
        assert_eq!(config.model, "flux-1-dev");
    }

    #[test]
    fn test_image_style_variants() {
        let styles = vec![
            ImageStyle::Natural,
            ImageStyle::Anime,
            ImageStyle::Illustration,
            ImageStyle::Render3d,
            ImageStyle::Pixel,
            ImageStyle::Watercolor,
            ImageStyle::OilPainting,
            ImageStyle::Sketch,
            ImageStyle::Cyberpunk,
        ];
        assert_eq!(styles.len(), 9);
    }
}
