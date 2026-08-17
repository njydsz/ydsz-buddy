//! # OCR 图片文字识别扩展（P2-8）
//!
//! 将图片中的文字提取出来并注入对话的 OCR 工具链。
//!
//! ## 设计
//!
//! - `OcrAdapter` trait 抽象不同 OCR 后端（Tesseract / 百度 / 腾讯 / 本地模型）
//! - 支持多种输入路径（文件路径 / Base64 / URL）
//! - 支持多语言文字识别

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// ============================================================================
// 配置
// ============================================================================

/// OCR 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrConfig {
    /// 识别语言（默认 "chi_sim+eng"）
    #[serde(default = "default_language")]
    pub language: String,
    /// 是否自动纠正方向
    #[serde(default = "default_auto_orient")]
    pub auto_orient: bool,
    /// 是否增强对比度
    #[serde(default = "default_enhance")]
    pub enhance_contrast: bool,
}

fn default_language() -> String {
    "chi_sim+eng".to_string()
}

fn default_auto_orient() -> bool {
    true
}

fn default_enhance() -> bool {
    true
}

impl Default for OcrConfig {
    fn default() -> Self {
        Self {
            language: default_language(),
            auto_orient: default_auto_orient(),
            enhance_contrast: default_enhance(),
        }
    }
}

// ============================================================================
// 结果
// ============================================================================

/// 文本区域（带坐标）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrTextRegion {
    /// 文本内容
    pub text: String,
    /// 边界框（左上角 x, y, 宽度, 高度）
    pub bbox: (u32, u32, u32, u32),
    /// 置信度（0.0 - 1.0）
    #[serde(default = "default_confidence")]
    pub confidence: f64,
}

fn default_confidence() -> f64 {
    0.9
}

/// OCR 识别结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    /// 是否成功
    pub success: bool,
    /// 完整识别文本
    pub text: String,
    /// 分段文本区域（可选）
    #[serde(default)]
    pub regions: Vec<OcrTextRegion>,
    /// 识别语言
    #[serde(default)]
    pub language: String,
    /// 耗时（毫秒）
    #[serde(default)]
    pub elapsed_ms: u64,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl OcrResult {
    /// 创建成功结果
    pub fn success(text: impl Into<String>) -> Self {
        let text = text.into();
        Self {
            success: true,
            text: text.clone(),
            regions: Vec::new(),
            language: String::new(),
            elapsed_ms: 0,
            error: None,
        }
    }

    /// 创建失败结果
    pub fn failure(error: impl Into<String>) -> Self {
        Self {
            success: false,
            text: String::new(),
            regions: Vec::new(),
            language: String::new(),
            elapsed_ms: 0,
            error: Some(error.into()),
        }
    }

    /// 创建无效输入结果
    pub fn invalid_input(reason: impl Into<String>) -> Self {
        Self::failure(format!("无效输入: {}", reason.into()))
    }

    /// 按行分割文本
    pub fn lines(&self) -> Vec<&str> {
        self.text.lines().collect()
    }
}

// ============================================================================
// Adapter Trait
// ============================================================================

/// OCR Adapter 抽象接口
#[async_trait]
pub trait OcrAdapter: Send + Sync {
    /// 获取 Adapter 名称
    fn name(&self) -> &str;

    /// 从文件路径识别
    async fn recognize_from_path(
        &self,
        path: &str,
        config: &OcrConfig,
    ) -> anyhow::Result<OcrResult>;

    /// 从 Base64 数据识别
    async fn recognize_from_base64(
        &self,
        base64: &str,
        config: &OcrConfig,
    ) -> anyhow::Result<OcrResult>;

    /// 从 URL 识别（先下载再识别）
    async fn recognize_from_url(
        &self,
        url: &str,
        config: &OcrConfig,
    ) -> anyhow::Result<OcrResult> {
        // 默认实现：先下载到临时文件，再识别
        let _ = (url, config);
        Ok(OcrResult::failure("URL 识别需要实现下载逻辑"))
    }

    /// 检查服务是否可用
    async fn is_available(&self) -> bool {
        true
    }
}

// ============================================================================
// Tesseract OCR Adapter
// ============================================================================

/// Tesseract OCR Adapter
///
/// 基于开源 Tesseract OCR 引擎。
/// 需要系统中安装 tesseract 可执行文件。
#[derive(Debug, Clone)]
pub struct TesseractAdapter {
    /// Tesseract 可执行文件路径
    pub executable_path: Option<String>,
    /// TESSDATA 目录
    pub tessdata_dir: Option<String>,
}

impl TesseractAdapter {
    /// 创建新的 Tesseract Adapter
    pub fn new() -> Self {
        Self {
            executable_path: None,
            tessdata_dir: None,
        }
    }

    /// 设置可执行文件路径
    pub fn with_executable(mut self, path: impl Into<String>) -> Self {
        self.executable_path = Some(path.into());
        self
    }

    /// 设置 TESSDATA 目录
    pub fn with_tessdata_dir(mut self, dir: impl Into<String>) -> Self {
        self.tessdata_dir = Some(dir.into());
        self
    }

    /// 获取常用中文语言配置
    pub fn chinese_configs() -> Vec<(&'static str, &'static str)> {
        vec![
            ("chi_sim", "简体中文"),
            ("chi_tra", "繁体中文"),
            ("chi_sim+eng", "简体+英文"),
            ("chi_tra+eng", "繁体+英文"),
        ]
    }
}

impl Default for TesseractAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl OcrAdapter for TesseractAdapter {
    fn name(&self) -> &str {
        "tesseract"
    }

    async fn recognize_from_path(
        &self,
        _path: &str,
        _config: &OcrConfig,
    ) -> anyhow::Result<OcrResult> {
        // 实际实现需要：
        // 1. 调用 tesseract CLI 或 tess bindings
        // 2. 解析输出结果
        Ok(OcrResult::failure(
            "Tesseract OCR 需要安装 tesseract 并配置路径",
        ))
    }

    async fn recognize_from_base64(
        &self,
        _base64: &str,
        _config: &OcrConfig,
    ) -> anyhow::Result<OcrResult> {
        Ok(OcrResult::failure(
            "Tesseract OCR 需要安装 tesseract 并配置路径",
        ))
    }

    async fn is_available(&self) -> bool {
        // 实际实现应检查 tesseract 是否安装
        false
    }
}

// ============================================================================
// OCR 服务
// ============================================================================

/// OCR 服务
///
/// 封装 OCR Adapter，提供统一的识别 API。
pub struct OcrService {
    adapter: Box<dyn OcrAdapter>,
    config: OcrConfig,
}

impl OcrService {
    /// 创建新的 OCR 服务
    pub fn new(adapter: Box<dyn OcrAdapter>) -> Self {
        Self {
            adapter,
            config: OcrConfig::default(),
        }
    }

    /// 创建带配置的 OCR 服务
    pub fn with_config(adapter: Box<dyn OcrAdapter>, config: OcrConfig) -> Self {
        Self { adapter, config }
    }

    /// 识别图片文件
    pub async fn recognize_file(&self, path: &str) -> anyhow::Result<OcrResult> {
        // 检查文件是否存在
        if !std::path::Path::new(path).exists() {
            return Ok(OcrResult::invalid_input(format!("文件不存在: {}", path)));
        }

        self.adapter.recognize_from_path(path, &self.config).await
    }

    /// 识别 Base64 图片
    pub async fn recognize_base64(&self, base64: &str) -> anyhow::Result<OcrResult> {
        if base64.is_empty() {
            return Ok(OcrResult::invalid_input("Base64 数据为空"));
        }

        self.adapter.recognize_from_base64(base64, &self.config).await
    }

    /// 识别图片 URL
    pub async fn recognize_url(&self, url: &str) -> anyhow::Result<OcrResult> {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Ok(OcrResult::invalid_input("URL 格式不正确"));
        }

        self.adapter.recognize_from_url(url, &self.config).await
    }

    /// 检查服务是否可用
    pub async fn is_available(&self) -> bool {
        self.adapter.is_available().await
    }

    /// 更新配置
    pub fn set_config(&mut self, config: OcrConfig) {
        self.config = config;
    }

    /// 获取当前配置
    pub fn config(&self) -> &OcrConfig {
        &self.config
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ocr_config_default() {
        let config = OcrConfig::default();
        assert_eq!(config.language, "chi_sim+eng");
        assert!(config.auto_orient);
        assert!(config.enhance_contrast);
    }

    #[test]
    fn test_ocr_result_success() {
        let result = OcrResult::success("Hello World\n测试文本");
        assert!(result.success);
        assert_eq!(result.lines().len(), 2);
    }

    #[test]
    fn test_ocr_result_failure() {
        let result = OcrResult::failure("Service unavailable");
        assert!(!result.success);
        assert_eq!(result.error, Some("Service unavailable".to_string()));
    }

    #[test]
    fn test_ocr_result_invalid_input() {
        let result = OcrResult::invalid_input("文件不存在");
        assert!(!result.success);
        assert!(result.error.unwrap().contains("文件不存在"));
    }

    #[test]
    fn test_tesseract_configs() {
        let configs = TesseractAdapter::chinese_configs();
        assert!(configs.len() >= 3);
        assert!(configs.iter().any(|(id, _)| *id == "chi_sim+eng"));
    }

    #[test]
    fn test_ocr_text_region() {
        let region = OcrTextRegion {
            text: "Hello".to_string(),
            bbox: (10, 20, 100, 30),
            confidence: 0.95,
        };
        assert_eq!(region.text, "Hello");
        assert_eq!(region.bbox, (10, 20, 100, 30));
    }
}
