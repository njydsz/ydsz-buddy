//! Wiki 服务
//!
//! 管理项目 Wiki 文档的存储和检索。
//!
//! ## 2.0 新增
//!
//! - **相关性搜索**：按匹配质量评分排序（模块名 > 标题 > 符号 > 内容）
//! - **Wiki 统计**：聚合模块数、符号数、按符号类型分布
//! - **文档大纲**：从 Markdown 内容提取标题层级生成 TOC
//! - **全量导出**：将所有模块合并为单个 Markdown 文档

use std::path::{Path, PathBuf};
use std::sync::Arc;
use parking_lot::RwLock;
use tracing::info;
use chrono::{DateTime, Utc};

/// Wiki 条目
///
/// 存储单个模块的 Wiki 文档信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WikiEntry {
    /// 所属模块名
    pub module: String,
    /// 文档标题
    pub title: String,
    /// 文档内容（Markdown 格式）
    pub content: String,
    /// 文档中包含的符号列表（用于检索）
    pub symbols: Vec<String>,
    /// 最后更新时间
    pub updated_at: DateTime<Utc>,
}

/// 文档大纲条目（TOC 节点）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OutlineNode {
    /// 标题级别（1 = #, 2 = ##, ...）
    pub level: u8,
    /// 标题文本
    pub text: String,
    /// 锚点 ID（GitHub 风格 slug）
    pub anchor: String,
}

/// Wiki 统计信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WikiStats {
    /// 模块总数
    pub module_count: usize,
    /// 符号总数（去重后）
    pub total_symbols: usize,
    /// 每个模块的符号数（module -> count）
    pub symbols_per_module: Vec<(String, usize)>,
    /// 最近更新的 5 个模块
    pub recently_updated: Vec<(String, DateTime<Utc>)>,
}

/// 搜索结果条目（带相关性评分）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    /// Wiki 条目
    pub entry: WikiEntry,
    /// 相关性评分（越高越相关）
    pub score: u32,
    /// 匹配类型描述（如 "module", "title", "symbol", "content"）
    pub match_type: String,
}

/// Wiki 服务
///
/// 管理项目 Wiki 文档的存储和检索，支持从磁盘加载和保存 Wiki 条目
pub struct WikiService {
    /// Wiki 文件存储目录
    wiki_dir: PathBuf,
    /// 内存中缓存的 Wiki 条目列表
    entries: Arc<RwLock<Vec<WikiEntry>>>,
}

impl WikiService {
    /// 创建新的 Wiki 服务
    pub fn new(root: PathBuf) -> Self {
        let wiki_dir = root.join(".ydsz").join("wiki");
        Self {
            wiki_dir,
            entries: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 初始化 Wiki 目录
    pub fn init(&self) -> Result<(), String> {
        if !self.wiki_dir.exists() {
            std::fs::create_dir_all(&self.wiki_dir)
                .map_err(|e| format!("创建 Wiki 目录失败: {}", e))?;
            info!("初始化 Wiki 目录: {:?}", self.wiki_dir);
        }
        Ok(())
    }

    /// 加载所有 Wiki 条目
    pub fn load(&self) -> Result<usize, String> {
        self.init()?;

        let mut entries = Vec::new();

        for entry in std::fs::read_dir(&self.wiki_dir)
            .map_err(|e| format!("读取 Wiki 目录失败: {}", e))?
        {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();

            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Some(wiki_entry) = self.parse_wiki_file(&path, &content) {
                        entries.push(wiki_entry);
                    }
                }
            }
        }

        let count = entries.len();
        *self.entries.write() = entries;

        info!("加载了 {} 个 Wiki 条目", count);
        Ok(count)
    }

    /// 解析 Wiki 文件
    fn parse_wiki_file(&self, path: &Path, content: &str) -> Option<WikiEntry> {
        let module = path.file_stem()?.to_str()?.to_string();

        // 提取标题（第一个 # 开头的行）
        let title = content.lines()
            .find(|line| line.starts_with("# "))
            .map(|line| line.trim_start_matches("# ").trim().to_string())
            .unwrap_or_else(|| module.clone());

        // 提取符号列表（查找 "## 符号" 或 "## Symbols" 部分）
        let symbols = Self::extract_symbols_from_wiki(content);

        Some(WikiEntry {
            module,
            title,
            content: content.to_string(),
            symbols,
            updated_at: Utc::now(),
        })
    }

    /// 从 Wiki 内容中提取符号列表
    fn extract_symbols_from_wiki(content: &str) -> Vec<String> {
        let mut symbols = Vec::new();
        let mut in_symbols_section = false;

        for line in content.lines() {
            let trimmed = line.trim();

            // 检测符号部分开始
            if trimmed.starts_with("## 符号") || trimmed.starts_with("## Symbols") {
                in_symbols_section = true;
                continue;
            }

            // 检测下一个部分开始
            if in_symbols_section && trimmed.starts_with("## ") {
                break;
            }

            // 提取符号（以 - 开头的行）
            if in_symbols_section && trimmed.starts_with("- ") {
                let symbol = trimmed.trim_start_matches("- ").trim();
                if !symbol.is_empty() {
                    symbols.push(symbol.to_string());
                }
            }
        }

        symbols
    }

    /// 保存 Wiki 条目
    pub fn save(&self, entry: &WikiEntry) -> Result<(), String> {
        let file_path = self.wiki_dir.join(format!("{}.md", entry.module));

        std::fs::write(&file_path, &entry.content)
            .map_err(|e| format!("写入 Wiki 文件失败: {}", e))?;

        info!("保存 Wiki 条目: {:?}", file_path);
        Ok(())
    }

    /// 更新或创建 Wiki 条目
    pub fn upsert(&self, entry: WikiEntry) -> Result<(), String> {
        // 更新内存中的条目
        let mut entries = self.entries.write();
        if let Some(existing) = entries.iter_mut().find(|e| e.module == entry.module) {
            *existing = entry.clone();
        } else {
            entries.push(entry.clone());
        }
        drop(entries);

        // 保存到文件
        self.save(&entry)
    }

    /// 获取所有 Wiki 条目
    pub fn get_entries(&self) -> Vec<WikiEntry> {
        self.entries.read().clone()
    }

    /// 按模块名获取 Wiki 条目
    pub fn get_by_module(&self, module: &str) -> Option<WikiEntry> {
        self.entries.read().iter().find(|e| e.module == module).cloned()
    }

    /// 搜索 Wiki 条目（基础版，保持向后兼容）
    pub fn search(&self, query: &str) -> Vec<WikiEntry> {
        let lower = query.to_lowercase();
        self.entries.read().iter()
            .filter(|e| {
                e.module.to_lowercase().contains(&lower)
                    || e.title.to_lowercase().contains(&lower)
                    || e.content.to_lowercase().contains(&lower)
                    || e.symbols.iter().any(|s| s.to_lowercase().contains(&lower))
            })
            .cloned()
            .collect()
    }

    /// 增强搜索：按相关性评分排序
    ///
    /// 评分规则：
    /// - 模块名精确匹配：100 分
    /// - 模块名包含匹配：80 分
    /// - 标题包含匹配：60 分
    /// - 符号名精确匹配：50 分（每个 +10）
    /// - 符号名包含匹配：30 分（每个 +5）
    /// - 内容包含匹配：10 分
    pub fn search_with_score(&self, query: &str) -> Vec<SearchResult> {
        let lower = query.to_lowercase();
        let mut results: Vec<SearchResult> = Vec::new();

        for entry in self.entries.read().iter() {
            let module_lower = entry.module.to_lowercase();
            let title_lower = entry.title.to_lowercase();
            let content_lower = entry.content.to_lowercase();

            let mut score: u32 = 0;
            let mut match_type = String::new();

            // 模块名匹配
            if module_lower == lower {
                score += 100;
                match_type = "module(exact)".to_string();
            } else if module_lower.contains(&lower) {
                score += 80;
                match_type = "module".to_string();
            }

            // 标题匹配
            if title_lower.contains(&lower) {
                score += 60;
                if match_type.is_empty() {
                    match_type = "title".to_string();
                }
            }

            // 符号匹配
            let mut symbol_hits = 0u32;
            for sym in &entry.symbols {
                let sym_lower = sym.to_lowercase();
                if sym_lower == lower {
                    score += 50;
                    symbol_hits += 1;
                } else if sym_lower.contains(&lower) {
                    score += 30;
                    symbol_hits += 1;
                }
            }
            if symbol_hits > 0 && match_type.is_empty() {
                match_type = format!("symbol(×{})", symbol_hits);
            }

            // 内容匹配
            if content_lower.contains(&lower) {
                score += 10;
                if match_type.is_empty() {
                    match_type = "content".to_string();
                }
            }

            if score > 0 {
                results.push(SearchResult {
                    entry: entry.clone(),
                    score,
                    match_type,
                });
            }
        }

        // 按评分降序排序
        results.sort_by(|a, b| b.score.cmp(&a.score));
        results
    }

    /// 获取 Wiki 统计信息
    pub fn get_stats(&self) -> WikiStats {
        let entries = self.entries.read();

        // 去重符号集合
        let mut all_symbols = std::collections::HashSet::new();
        let mut symbols_per_module: Vec<(String, usize)> = entries
            .iter()
            .map(|e| {
                for s in &e.symbols {
                    all_symbols.insert(s.clone());
                }
                (e.module.clone(), e.symbols.len())
            })
            .collect();

        // 按符号数降序排序
        symbols_per_module.sort_by(|a, b| b.1.cmp(&a.1));

        // 最近更新的 5 个模块
        let mut by_time: Vec<(String, DateTime<Utc>)> = entries
            .iter()
            .map(|e| (e.module.clone(), e.updated_at))
            .collect();
        by_time.sort_by(|a, b| b.1.cmp(&a.1));
        by_time.truncate(5);

        WikiStats {
            module_count: entries.len(),
            total_symbols: all_symbols.len(),
            symbols_per_module,
            recently_updated: by_time,
        }
    }

    /// 从 Markdown 内容提取文档大纲（TOC）
    pub fn get_outline(module: &str, content: &str) -> Vec<OutlineNode> {
        let _ = module;
        let mut nodes = Vec::new();
        let mut in_code_block = false;

        for line in content.lines() {
            let trimmed = line.trim();

            // 跳过代码块内的内容
            if trimmed.starts_with("```") {
                in_code_block = !in_code_block;
                continue;
            }
            if in_code_block {
                continue;
            }

            // 检测 Markdown 标题
            if let Some(heading) = Self::parse_heading(trimmed) {
                let (level, text) = heading;
                let anchor = Self::slugify(&text);
                nodes.push(OutlineNode { level, text, anchor });
            }
        }

        nodes
    }

    /// 解析 Markdown 标题行，返回 (级别, 文本)
    fn parse_heading(line: &str) -> Option<(u8, String)> {
        let hashes = line.chars().take_while(|&c| c == '#').count();
        if hashes == 0 || hashes > 6 {
            return None;
        }
        let text = line[hashes..].trim();
        if text.is_empty() {
            return None;
        }
        Some((hashes as u8, text.to_string()))
    }

    /// 生成 GitHub 风格的锚点 slug
    fn slugify(text: &str) -> String {
        text.to_lowercase()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' {
                    c
                } else if c == ' ' {
                    '-'
                } else {
                    '_'
                }
            })
            .collect::<String>()
            .trim_matches('-')
            .to_string()
    }

    /// 将所有 Wiki 条目导出为单个 Markdown 文档
    pub fn export_all(&self) -> String {
        let entries = self.entries.read();
        let mut output = String::new();

        // 文档头部
        output.push_str("# 项目 Wiki 全量导出\n\n");
        output.push_str(&format!(
            "> 导出时间：{}\n> 模块数量：{}\n\n---\n\n",
            Utc::now().to_rfc3339(),
            entries.len()
        ));

        // 按模块名排序
        let mut sorted: Vec<&WikiEntry> = entries.iter().collect();
        sorted.sort_by(|a, b| a.module.cmp(&b.module));

        for entry in sorted {
            output.push_str(&entry.content);
            output.push_str("\n\n---\n\n");
        }

        output
    }

    /// 获取 Wiki 目录路径
    pub fn wiki_dir(&self) -> &Path {
        &self.wiki_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_with_score_module_exact() {
        let service = WikiService::new(PathBuf::from("/tmp/test_wiki"));
        let entry = WikiEntry {
            module: "core::engine".to_string(),
            title: "Engine Module".to_string(),
            content: "Some content here".to_string(),
            symbols: vec!["run".to_string()],
            updated_at: Utc::now(),
        };
        *service.entries.write() = vec![entry];

        let results = service.search_with_score("core::engine");
        assert_eq!(results.len(), 1);
        assert!(results[0].score >= 100);
        assert!(results[0].match_type.contains("module"));
    }

    #[test]
    fn test_search_with_score_symbol_match() {
        let service = WikiService::new(PathBuf::from("/tmp/test_wiki"));
        let entry = WikiEntry {
            module: "utils".to_string(),
            title: "Utils".to_string(),
            content: "helper functions".to_string(),
            symbols: vec!["format_date".to_string(), "parse_json".to_string()],
            updated_at: Utc::now(),
        };
        *service.entries.write() = vec![entry];

        let results = service.search_with_score("format_date");
        assert_eq!(results.len(), 1);
        assert!(results[0].score >= 50);
        assert!(results[0].match_type.contains("symbol"));
    }

    #[test]
    fn test_search_with_score_content_only() {
        let service = WikiService::new(PathBuf::from("/tmp/test_wiki"));
        let entry = WikiEntry {
            module: "misc".to_string(),
            title: "Misc".to_string(),
            content: "this contains the keyword foobar".to_string(),
            symbols: vec![],
            updated_at: Utc::now(),
        };
        *service.entries.write() = vec![entry];

        let results = service.search_with_score("foobar");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].score, 10);
        assert_eq!(results[0].match_type, "content");
    }

    #[test]
    fn test_get_outline_basic() {
        let content = r#"# Module Title

Some intro text.

## Functions

### func_a

Description.

### func_b

Description.

## Classes

### MyClass

Detail.
"#;
        let outline = WikiService::get_outline("test", content);
        assert_eq!(outline.len(), 6);
        assert_eq!(outline[0].level, 1);
        assert_eq!(outline[0].text, "Module Title");
        assert_eq!(outline[1].level, 2);
        assert_eq!(outline[1].text, "Functions");
        assert_eq!(outline[2].level, 3);
        assert_eq!(outline[2].text, "func_a");
        assert_eq!(outline[3].level, 3);
        assert_eq!(outline[3].text, "func_b");
        assert_eq!(outline[4].level, 2);
        assert_eq!(outline[4].text, "Classes");
        assert_eq!(outline[5].level, 3);
        assert_eq!(outline[5].text, "MyClass");
    }

    #[test]
    fn test_get_outline_skips_code_blocks() {
        let content = r#"# Title

## Section

```rust
// ## This should not be a heading
fn foo() {}
```

## After Code
"#;
        let outline = WikiService::get_outline("test", content);
        assert_eq!(outline.len(), 3);
        assert_eq!(outline[2].text, "After Code");
    }

    #[test]
    fn test_slugify() {
        assert_eq!(WikiService::slugify("Hello World"), "hello-world");
        assert_eq!(WikiService::slugify("函数/方法"), "函数_方法");
        assert_eq!(WikiService::slugify("  Trim Me  "), "trim-me");
    }

    #[test]
    fn test_export_all() {
        let service = WikiService::new(PathBuf::from("/tmp/test_wiki"));
        let e1 = WikiEntry {
            module: "alpha".to_string(),
            title: "Alpha".to_string(),
            content: "# Alpha\n\nContent A".to_string(),
            symbols: vec!["a1".to_string()],
            updated_at: Utc::now(),
        };
        let e2 = WikiEntry {
            module: "beta".to_string(),
            title: "Beta".to_string(),
            content: "# Beta\n\nContent B".to_string(),
            symbols: vec!["b1".to_string()],
            updated_at: Utc::now(),
        };
        *service.entries.write() = vec![e1, e2];

        let exported = service.export_all();
        assert!(exported.contains("全量导出"));
        assert!(exported.contains("# Alpha"));
        assert!(exported.contains("# Beta"));
        // Alpha should come before Beta (sorted)
        let alpha_pos = exported.find("# Alpha").unwrap();
        let beta_pos = exported.find("# Beta").unwrap();
        assert!(alpha_pos < beta_pos);
    }

    #[test]
    fn test_get_stats() {
        let service = WikiService::new(PathBuf::from("/tmp/test_wiki"));
        let e1 = WikiEntry {
            module: "mod_a".to_string(),
            title: "A".to_string(),
            content: "content a".to_string(),
            symbols: vec!["foo".to_string(), "bar".to_string()],
            updated_at: Utc::now(),
        };
        let e2 = WikiEntry {
            module: "mod_b".to_string(),
            title: "B".to_string(),
            content: "content b".to_string(),
            symbols: vec!["foo".to_string(), "baz".to_string()],
            updated_at: Utc::now(),
        };
        *service.entries.write() = vec![e1, e2];

        let stats = service.get_stats();
        assert_eq!(stats.module_count, 2);
        assert_eq!(stats.total_symbols, 3); // foo, bar, baz (deduplicated)
        assert_eq!(stats.symbols_per_module.len(), 2);
        assert_eq!(stats.recently_updated.len(), 2);
    }
}
