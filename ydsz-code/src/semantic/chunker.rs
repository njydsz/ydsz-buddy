//! # 代码分块器
//!
//! 将代码文件按行分块，用于 embedding 向量化前的预处理。
//!
//! ## 设计
//!
//! - 按字符数分块（默认最大 1500 字符）
//! - 相邻分块有重叠（默认 200 字符），避免在函数边界截断
//! - 保留行号信息（起始/结束行），便于搜索结果定位

/// 代码分块
#[derive(Debug, Clone)]
pub struct CodeChunk {
    /// 分块文本
    pub text: String,
    /// 起始行号（0-based）
    pub start_line: u32,
    /// 结束行号（0-based, exclusive）
    pub end_line: u32,
}

/// 默认最大分块字符数
const DEFAULT_MAX_CHUNK_SIZE: usize = 1500;

/// 默认分块重叠字符数
const DEFAULT_CHUNK_OVERLAP: usize = 200;

/// 分块配置
#[derive(Debug, Clone)]
pub struct ChunkConfig {
    /// 最大分块字符数
    pub max_chunk_size: usize,
    /// 分块重叠字符数
    pub overlap: usize,
}

impl Default for ChunkConfig {
    fn default() -> Self {
        Self {
            max_chunk_size: DEFAULT_MAX_CHUNK_SIZE,
            overlap: DEFAULT_CHUNK_OVERLAP,
        }
    }
}

/// 将代码文本按行分块
///
/// # 参数
///
/// - `text` - 代码文本
/// - `config` - 分块配置（使用 `ChunkConfig::default()` 获取默认值）
pub fn chunk_code(text: &str, config: &ChunkConfig) -> Vec<CodeChunk> {
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut current_chunk: Vec<&str> = Vec::new();
    let mut current_size = 0usize;
    let mut start_line = 0u32;

    for (i, line) in lines.iter().enumerate() {
        let line_length = line.len() + 1; // +1 for newline

        if current_size + line_length > config.max_chunk_size && !current_chunk.is_empty() {
            // 推入当前分块
            chunks.push(CodeChunk {
                text: current_chunk.join("\n"),
                start_line,
                end_line: i as u32,
            });

            // 保留重叠部分（按行数近似）
            let overlap_lines = (config.overlap / 80).max(1);
            let overlap_start = current_chunk.len().saturating_sub(overlap_lines);
            let overlap_lines_vec: Vec<&str> = current_chunk[overlap_start..].to_vec();
            current_chunk = overlap_lines_vec;
            current_chunk.push(line);
            current_size = current_chunk.iter().map(|l| l.len() + 1).sum();
            start_line = (i - current_chunk.len() + 1) as u32;
        } else {
            current_chunk.push(line);
            current_size += line_length;
        }
    }

    if !current_chunk.is_empty() {
        chunks.push(CodeChunk {
            text: current_chunk.join("\n"),
            start_line,
            end_line: lines.len() as u32,
        });
    }

    chunks
}

/// 生成唯一 ID
pub fn generate_chunk_id(workspace_root: &str, file_path: &str, start_line: u32) -> String {
    format!("{workspace_root}::{file_path}::{start_line}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_empty() {
        let chunks = chunk_code("", &ChunkConfig::default());
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_chunk_small_file() {
        let text = "line 1\nline 2\nline 3";
        let chunks = chunk_code(text, &ChunkConfig::default());
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].start_line, 0);
        assert_eq!(chunks[0].end_line, 3);
        assert!(chunks[0].text.contains("line 1"));
    }

    #[test]
    fn test_chunk_large_file() {
        // 生成一个超过 MAX_CHUNK_SIZE 的文件
        let lines: Vec<String> = (0..200).map(|i| format!("line {i} with some content here")).collect();
        let text = lines.join("\n");

        let config = ChunkConfig {
            max_chunk_size: 200,
            overlap: 40,
        };
        let chunks = chunk_code(&text, &config);

        assert!(chunks.len() > 1);
        // 验证行号连续性
        for i in 1..chunks.len() {
            assert!(chunks[i].start_line <= chunks[i - 1].end_line); // 有重叠
        }
    }

    #[test]
    fn test_generate_chunk_id() {
        let id = generate_chunk_id("/workspace", "src/main.rs", 42);
        assert_eq!(id, "/workspace::src/main.rs::42");
    }
}
