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

/// 通义万相生成（异步 + 轮询）
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

    let query_endpoint = endpoint.replacen("/services/", "/tasks/", 1);
    let (width, height) = request.size.dimensions();

    let client = Client::new();

    // 1. 提交异步任务
    let submit_response = client
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
        .map_err(|e| format!("通义万相 API 提交失败: {e}"))?;

    if !submit_response.status().is_success() {
        let err_text = submit_response.text().await.unwrap_or_default();
        return Err(format!("通义万相 API 错误: {err_text}"));
    }

    let submit_json: serde_json::Value = submit_response
        .json()
        .await
        .map_err(|e| format!("解析通义万相提交响应失败: {e}"))?;

    let task_id = submit_json
        .get("output")
        .and_then(|o| o.get("task_id"))
        .and_then(|t| t.as_str())
        .ok_or("通义万相 未返回 task_id")?
        .to_string();

    info!(%task_id, "通义万相任务已提交，开始轮询");

    // 2. 轮询任务状态（最多 60 秒，每 3 秒一次）
    let poll_url = format!("{}/{task_id}", query_endpoint);
    let max_polls = 20;
    let mut paths = Vec::new();

    for _ in 0..max_polls {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        let poll_response = client
            .get(&poll_url)
            .header("Authorization", format!("Bearer {api_key}"))
            .send()
            .await
            .map_err(|e| format!("轮询通义万相任务失败: {e}"))?;

        if !poll_response.status().is_success() {
            continue;
        }

        let poll_json: serde_json::Value = match poll_response.json().await {
            Ok(j) => j,
            Err(_) => continue,
        };

        let status = poll_json
            .get("output")
            .and_then(|o| o.get("task_status"))
            .and_then(|s| s.as_str());

        match status {
            Some("SUCCEEDED") => {
                if let Some(results) = poll_json
                    .get("output")
                    .and_then(|o| o.get("results"))
                    .and_then(|r| r.as_array())
                {
                    for (i, result) in results.iter().enumerate() {
                        if let Some(url) = result.get("url").and_then(|u| u.as_str()) {
                            match download_image(url, output_dir, "tongyi", i).await {
                                Ok(path) => paths.push(path),
                                Err(e) => warn!(%e, "下载通义万相图片失败"),
                            }
                        }
                    }
                }
                break;
            }
            Some("FAILED") | Some("CANCELED") => {
                let msg = poll_json
                    .get("output")
                    .and_then(|o| o.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("未知错误");
                return Err(format!("通义万相任务失败: {msg}"));
            }
            _ => continue,
        }
    }

    if paths.is_empty() {
        return Err("通义万相任务超时或未生成图片".to_string());
    }

    Ok(paths)
}

/// 混元生图生成（腾讯混元生图 API）
///
/// 文档: https://cloud.tencent.com/document/product/1759
/// 使用腾讯云混元生图（HY-Image）API，仅需要 Secretariat 鉴权
/// 简化版：使用 SecretId/SecretKey 计算 HMAC-SHA1 签名后调用 API
async fn generate_hunyuan(
    prompt: &str,
    request: &ImageGenRequest,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let secret_id = request
        .api_key
        .clone()
        .or_else(|| std::env::var("TENCENT_SECRET_ID").ok())
        .ok_or("混元生图 requires TENCENT_SECRET_ID (格式: SecretId:SecretKey)")?;

    let secret_key = request
        .api_endpoint
        .clone()
        .or_else(|| std::env::var("TENCENT_SECRET_KEY").ok())
        .or_else(|| {
            // 尝试从 api_key 中解析 SecretId:SecretKey 格式
            if let Some(pos) = secret_id.find(':') {
                Some(secret_id[pos + 1..].to_string())
            } else {
                None
            }
        })
        .ok_or("混元生图 requires TENCENT_SECRET_KEY")?;

    let actual_secret_id = if secret_id.contains(':') {
        secret_id.split(':').next().unwrap().to_string()
    } else {
        secret_id.clone()
    };

    let endpoint = "https://hy-image.tencentcloudapi.com";
    let region = "ap-guangzhou";
    let action = "GenerateImage";
    let version = "2024-11-11";
    let timestamp = Utc::now().timestamp();
    let date = Utc::now().format("%Y-%m-%d").to_string();

    let (width, height) = request.size.dimensions();
    let payload = serde_json::json!({
        "Prompt": prompt,
        "Width": width,
        "Height": height,
        "Seed": request.num_images.min(1)
    });

    let payload_str = payload.to_string();
    // 1. 构造 StringToSign
    let hashed_request_payload = {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(&payload_str);
        format!("{:x}", hasher.finalize())
    };

    let canonical_request = format!(
        "POST\n/\n\ncontent-type:application/json\nhost:hy-image.tencentcloudapi.com\n\ncontent-type;host\n{hashed_request_payload}"
    );

    let string_to_sign = {
        use sha2::{Sha256, Digest};
        let hashed_canonical = {
            let mut hasher = Sha256::new();
            hasher.update(&canonical_request);
            format!("{:x}", hasher.finalize())
        };
        format!("TC3-HMAC-SHA256\n{timestamp}\n{date}/hy_image/tc3_request\n{hashed_canonical}")
    };

    // 2. 计算签名
    let signature = tc3_hmac_sign(&secret_key, &date, &region, &string_to_sign);

    let authorization = format!(
        "TC3-HMAC-SHA256 Credential={actual_secret_id}/{date}/hy_image/tc3_request, SignedHeaders=content-type;host, Signature={signature}"
    );

    let client = Client::new();
    let response = client
        .post(endpoint)
        .header("Authorization", authorization)
        .header("Content-Type", "application/json")
        .header("Host", "hy-image.tencentcloudapi.com")
        .header("X-TC-Action", action)
        .header("X-TC-Timestamp", timestamp.to_string())
        .header("X-TC-Version", version)
        .header("X-TC-Region", region)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("混元生图 API 请求失败: {e}"))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("混元生图 API 错误: {err_text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析混元生图响应失败: {e}"))?;

    let mut paths = Vec::new();
    // 混元生图响应结构: { Result: { ImageUrl: "..." } }
    if let Some(image_url) = json
        .get("Response")
        .and_then(|r| r.get("ImageUrl"))
        .and_then(|u| u.as_str())
    {
        match download_image(image_url, output_dir, "hunyuan", 0).await {
            Ok(path) => paths.push(path),
            Err(e) => warn!(%e, "下载混元生图图片失败"),
        }
    }

    if paths.is_empty() {
        return Err("混元生图未返回有效图片 URL".to_string());
    }

    Ok(paths)
}

/// TC3-HMAC-SHA256 签名计算
fn tc3_hmac_sign(secret_key: &str, date: &str, region: &str, string_to_sign: &str) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    // SecretDate
    let mut mac = HmacSha256::new_from_slice(b"TC3")
        .expect("HMAC can take key of any size");
    mac.update(secret_key.as_bytes());
    let secret_date = mac.finalize().into_bytes();

    // SecretService
    let mut mac = HmacSha256::new_from_slice(&secret_date)
        .expect("HMAC can take key of any size");
    mac.update(date.as_bytes());
    let secret_service = mac.finalize().into_bytes();

    // SecretRegion
    let mut mac = HmacSha256::new_from_slice(&secret_service)
        .expect("HMAC can take key of any size");
    mac.update(region.as_bytes());
    let secret_region = mac.finalize().into_bytes();

    // SecretSigning
    let mut mac = HmacSha256::new_from_slice(&secret_region)
        .expect("HMAC can take key of any size");
    mac.update(b"tc3_request");
    let secret_signing = mac.finalize().into_bytes();

    // Sign
    let mut mac = HmacSha256::new_from_slice(&secret_signing)
        .expect("HMAC can take key of any size");
    mac.update(string_to_sign.as_bytes());
    let signature = mac.finalize().into_bytes();

    format!("{:x}", signature)
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
