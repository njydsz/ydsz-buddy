use std::path::Path;

use serde::Serialize;
// `#[derive(specta::Type)]` 用的 derive 宏路径
#[allow(unused_imports)]
use specta::Type;

use super::IndexerResult;

/// 文本搜索结果
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub text: String,
    pub context: String,
}

/// 全文本搜索（基于 walkdir + 字符串匹配，生产环境可换 ripgrep）
pub fn text_search(root: &Path, query: &str) -> IndexerResult<Vec<SearchResult>> {
    let mut results = Vec::new();
    let lower_query = query.to_lowercase();
    let code_extensions = [
        "ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "c", "cpp", "h", "hpp", "md",
    ];

    for entry in walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let path_str = path.to_string_lossy();
        if path_str.contains("node_modules")
            || path_str.contains("target")
            || path_str.contains(".git")
        {
            continue;
        }
        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_lowercase(),
            None => continue,
        };
        if !code_extensions.contains(&ext.as_str()) {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(path) {
            for (line_idx, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&lower_query) {
                    let col = line.to_lowercase().find(&lower_query).unwrap_or(0);
                    results.push(SearchResult {
                        file: path.to_string_lossy().to_string(),
                        line: (line_idx + 1) as u32,
                        column: (col + 1) as u32,
                        text: line.trim().to_string(),
                        context: line.to_string(),
                    });
                }
            }
        }
    }

    Ok(results)
}
