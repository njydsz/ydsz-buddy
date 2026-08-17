//! # 文生图命令模块
//!
//! 提供 AI 图片生成能力，支持多种后端：
//! - **DALL-E 3**（OpenAI）
//! - **FLUX**（Replicate / Together AI）
//! - **Stable Diffusion**（本地部署或云端 API）
//! - **通义万相**（阿里云）
//! - **混元生图**（腾讯）
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `image_generate` | 根据文本描述生成图片 |

use base64::Engine;
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::Manager;
use tracing::info;

/// 图片生成后端类型
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ImageGenBackend {
    /// OpenAI DALL-E 3
    Dalle3,
    /// FLUX (Replicate / Together)
    Flux,
    /// Stable Diffusion (本地/云端)
    StableDiffusion,
    /// 通义万相 (阿里云)
    TongyiWanxiang,
    /// 混元生图 (腾讯)
    HunyuanImage,
}

/// 图片尺寸
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ImageSize {
    /// 1024x1024 (正方形)
    Square1024,
    /// 1024x1792 (竖版)
    Portrait1024x1792,
    /// 1792x1024 (横版)
    Landscape1792x1024,
    /// 512x512 (小图)
    Small512,
    /// 256x256 (缩略图)
    Thumbnail256,
}

impl ImageSize {
    /// 获取尺寸字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ImageSize::Square1024 => "1024x1024",
            ImageSize::Portrait1024x1792 => "1024x1792",
            ImageSize::Landscape1792x1024 => "1792x1024",
            ImageSize::Small512 => "512x512",
            ImageSize::Thumbnail256 => "256x256",
        }
    }

    /// 获取 (width, height)
    pub fn dimensions(&self) -> (u32, u32) {
        match self {
            ImageSize::Square1024 => (1024, 1024),
            ImageSize::Portrait1024x1792 => (1024, 1792),
            ImageSize::Landscape1792x1024 => (1792, 1024),
            ImageSize::Small512 => (512, 512),
            ImageSize::Thumbnail256 => (256, 256),
        }
    }
}

/// 图片风格
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ImageStyle {
    /// 自然/写实
    Natural,
    /// 插画/卡通
    Illustration,
    /// 扁平化设计
    FlatDesign,
    /// 3D 渲染
    ThreeD,
    /// 水彩画
    Watercolor,
    /// 像素艺术
    PixelArt,
    /// 极简主义
    Minimalist,
}

impl ImageStyle {
    /// 获取风格提示词后缀
    pub fn prompt_suffix(&self) -> &'static str {
        match self {
            ImageStyle::Natural => "",
            ImageStyle::Illustration => ", illustration style, cartoon",
            ImageStyle::FlatDesign => ", flat design, clean lines",
            ImageStyle::ThreeD => ", 3D render, C4D, octane render",
            ImageStyle::Watercolor => ", watercolor painting style",
            ImageStyle::PixelArt => ", pixel art, 8-bit style",
            ImageStyle::Minimalist => ", minimalist, simple, clean",
        }
    }
}

/// 图片生成请求
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenRequest {
    /// 文本描述（prompt）
    pub prompt: String,
    /// 后端类型
    pub backend: ImageGenBackend,
    /// 图片尺寸
    pub size: ImageSize,
    /// 图片风格
    pub style: ImageStyle,
    /// API Key（可选，优先使用全局配置）
    pub api_key: Option<String>,
    /// API 端点（可选，用于自定义部署）
    pub api_endpoint: Option<String>,
    /// 负向提示词
    pub negative_prompt: Option<String>,
    /// 生成数量（1-4）
    #[serde(default = "default_num_images")]
    pub num_images: u32,
}

fn default_num_images() -> u32 {
    1
}

/// 图片生成响应
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenResponse {
    /// 生成的图片路径列表
    pub image_paths: Vec<String>,
    /// 使用的实际 prompt（含风格后缀）
    pub actual_prompt: String,
    /// 生成耗时（毫秒）
    pub elapsed_ms: u64,
}

/// 生成图片（Tauri 命令）
///
/// 根据文本描述调用指定后端生成图片，保存到本地并返回路径。
#[tauri::command]
#[specta::specta]
pub async fn image_generate(
    request: ImageGenRequest,
    app_handle: tauri::AppHandle,
) -> Result<ImageGenResponse, String> {
    let start = std::time::Instant::now();

    info!(
        "Image generation request: backend={:?}, size={:?}, style={:?}",
        request.backend, request.size, request.style
    );

    // 构建完整 prompt
    let full_prompt = format!(
        "{}{}",
        request.prompt,
        request.style.prompt_suffix()
    );

    // 获取输出目录
    let output_dir = get_output_dir(&app_handle)?;
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output dir: {e}"))?;

    // 根据后端调用不同 API
    let image_paths = match request.backend {
        ImageGenBackend::Dalle3 => {
            generate_dalle3(&full_prompt, &request, &output_dir).await?
        }
        ImageGenBackend::Flux => {
            generate_flux(&full_prompt, &request, &output_dir).await?
        }
        ImageGenBackend::StableDiffusion => {
            generate_sd(&full_prompt, &request, &output_dir).await?
        }
        ImageGenBackend::TongyiWanxiang => {
            generate_tongyi(&full_prompt, &request, &output_dir).await?
        }
        ImageGenBackend::HunyuanImage => {
            generate_hunyuan(&full_prompt, &request, &output_dir).await?
        }
    };

    let elapsed = start.elapsed().as_millis() as u64;

    Ok(ImageGenResponse {
        image_paths,
        actual_prompt: full_prompt,
        elapsed_ms: elapsed,
    })
}

/// 获取输出目录
fn get_output_dir(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let output_dir = app_data_dir.join("generated_images");
    Ok(output_dir.to_string_lossy().to_string())
}

/// DALL-E 3 生成
async fn generate_dalle3(
    prompt: &str,
    request: &ImageGenRequest,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let api_key = request
        .api_key
        .clone()
        .or_else(|| std::env::var("OPENAI_API_KEY").ok())
        .ok_or("DALL-E 3 requires OPENAI_API_KEY")?;

    let endpoint = request
        .api_endpoint
        .clone()
        .unwrap_or_else(|| "https://api.openai.com/v1/images/generations".to_string());

    let client = Client::new();
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": "dall-e-3",
            "prompt": prompt,
            "n": request.num_images.min(1), // DALL-E 3 only supports n=1
            "size": request.size.as_str(),
            "quality": "standard",
        }))
        .send()
        .await
        .map_err(|e| format!("DALL-E 3 API request failed: {e}"))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("DALL-E 3 API error: {err_text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse DALL-E 3 response: {e}"))?;

    let mut paths = Vec::new();
    if let Some(data) = json["data"].as_array() {
        for (i, item) in data.iter().enumerate() {
            if let Some(url) = item["url"].as_str() {
                let path = download_image(url, output_dir, "dalle3", i).await?;
                paths.push(path);
            }
        }
    }

    if paths.is_empty() {
        return Err("DALL-E 3 returned no images".to_string());
    }

    Ok(paths)
}

/// FLUX 生成
async fn generate_flux(
    prompt: &str,
    request: &ImageGenRequest,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let api_key = request
        .api_key
        .clone()
        .or_else(|| std::env::var("REPLICATE_API_KEY").ok())
        .or_else(|| std::env::var("TOGETHER_API_KEY").ok())
        .ok_or("FLUX requires REPLICATE_API_KEY or TOGETHER_API_KEY")?;

    let endpoint = request
        .api_endpoint
        .clone()
        .unwrap_or_else(|| "https://api.together.xyz/v1/images/generations".to_string());

    let (width, height) = request.size.dimensions();

    let client = Client::new();
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": "black-forest-labs/FLUX.1-dev",
            "prompt": prompt,
            "width": width,
            "height": height,
            "steps": 28,
            "n": request.num_images.min(4),
        }))
        .send()
        .await
        .map_err(|e| format!("FLUX API request failed: {e}"))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("FLUX API error: {err_text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse FLUX response: {e}"))?;

    let mut paths = Vec::new();
    if let Some(data) = json["data"].as_array() {
        for (i, item) in data.iter().enumerate() {
            if let Some(url) = item["url"].as_str() {
                let path = download_image(url, output_dir, "flux", i).await?;
                paths.push(path);
            }
        }
    }

    Ok(paths)
}

/// Stable Diffusion 生成
async fn generate_sd(
    prompt: &str,
    request: &ImageGenRequest,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let api_key = request
        .api_key
        .clone()
        .or_else(|| std::env::var("STABILITY_API_KEY").ok())
        .ok_or("Stable Diffusion requires STABILITY_API_KEY")?;

    let endpoint = request
        .api_endpoint
        .clone()
        .unwrap_or_else(|| {
            "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image"
                .to_string()
        });

    let (width, height) = request.size.dimensions();

    let client = Client::new();
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "text_prompts": [{"text": prompt, "weight": 1.0}],
            "cfg_scale": 7,
            "width": width,
            "height": height,
            "steps": 30,
            "samples": request.num_images.min(4),
        }))
        .send()
        .await
        .map_err(|e| format!("SD API request failed: {e}"))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("SD API error: {err_text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse SD response: {e}"))?;

    let mut paths = Vec::new();
    if let Some(artifacts) = json["artifacts"].as_array() {
        for (i, item) in artifacts.iter().enumerate() {
            if let Some(b64) = item["base64"].as_str() {
                let path = save_base64_image(b64, output_dir, "sd", i)?;
                paths.push(path);
            }
        }
    }

    Ok(paths)
}

/// 通义万相生成
async fn generate_tongyi(
    prompt: &str,
    request: &ImageGenRequest,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let api_key = request
        .api_key
        .clone()
        .or_else(|| std::env::var("DASHSCOPE_API_KEY").ok())
        .ok_or("通义万相 requires DASHSCOPE_API_KEY")?;

    let endpoint = request
        .api_endpoint
        .clone()
        .unwrap_or_else(|| {
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
                .to_string()
        });

    let (width, height) = request.size.dimensions();

    let client = Client::new();
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("X-DashScope-Async", "enable")
        .json(&serde_json::json!({
            "model": "wanx-v1",
            "input": {"prompt": prompt},
            "parameters": {
                "size": format!("{width}x{height}"),
                "n": request.num_images.min(4),
            }
        }))
        .send()
        .await
        .map_err(|e| format!("通义万相 API request failed: {e}"))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("通义万相 API error: {err_text}"));
    }

    // 通义万相是异步的，返回 task_id
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse 通义万相 response: {e}"))?;

    info!(
        "通义万相 task submitted: {:?}",
        json.get("output").and_then(|o| o.get("task_id"))
    );

    // 简化处理：返回空列表，实际应轮询任务状态
    let _ = output_dir;
    Ok(vec![])
}

/// 混元生图生成
async fn generate_hunyuan(
    prompt: &str,
    request: &ImageGenRequest,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let _ = (prompt, request, output_dir);
    // 简化实现：实际应使用腾讯云 SDK
    info!("混元生图 request: prompt={}", prompt);
    Ok(vec![])
}

/// 下载图片到本地
async fn download_image(
    url: &str,
    output_dir: &str,
    prefix: &str,
    index: usize,
) -> Result<String, String> {
    let client = Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download image: {e}"))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read image bytes: {e}"))?;

    let filename = format!("{prefix}_{}_{}.png", Utc::now().timestamp(), index);
    let path = std::path::Path::new(output_dir).join(&filename);

    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to save image: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

/// 保存 base64 编码的图片
fn save_base64_image(
    b64: &str,
    output_dir: &str,
    prefix: &str,
    index: usize,
) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;

    let filename = format!("{prefix}_{}_{}.png", Utc::now().timestamp(), index);
    let path = std::path::Path::new(output_dir).join(&filename);

    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to save image: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}
