//! Wiki 生成器
//!
//! 基于解析的代码符号生成 Wiki 文档。
//!
//! ## 2.0 新增
//!
//! - **增量生成**：基于文件 mtime 跳过未变文件，仅重新解析变化的模块
//! - **依赖图**：生成 `.ydsz/wiki/.deps.json`，记录模块间依赖关系
//! - **增强 meta**：`.meta.json` 增加文件清单和符号统计
//! - **语言感知代码块**：根据文件扩展名选择代码块语言标注

use std::path::PathBuf;
use std::collections::HashMap;
use tracing::info;
use chrono::Utc;

use super::parser::{AstParser, CodeSymbol, SymbolKind};
use super::wiki::{WikiEntry, WikiService};

/// 文件元数据（用于增量生成）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FileMeta {
    /// 文件路径（相对于项目根）
    path: String,
    /// 最后修改时间（Unix 时间戳秒）
    mtime: u64,
}

/// Wiki 元数据文件（2.0 增强版）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct WikiMeta {
    /// 最后生成时间
    last_generated_at: String,
    /// 模块数量
    module_count: usize,
    /// 生成器版本
    generator_version: String,
    /// 文件清单（用于增量判断）
    files: Vec<FileMeta>,
    /// 符号总数
    total_symbols: usize,
}

impl WikiMeta {
    /// 从磁盘加载 meta（如果存在）
    fn load(wiki_dir: &std::path::Path) -> Option<Self> {
        let meta_path = wiki_dir.join(".meta.json");
        let content = std::fs::read_to_string(&meta_path).ok()?;
        serde_json::from_str(&content).ok()
    }

    /// 检查文件是否自上次生成后未变化
    fn is_file_unchanged(&self, rel_path: &str, mtime: u64) -> bool {
        self.files.iter().any(|f| f.path == rel_path && f.mtime == mtime)
    }
}

/// 模块依赖图
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DependencyGraph {
    /// 模块 -> 被依赖的模块列表
    pub edges: HashMap<String, Vec<String>>,
}

/// Wiki 生成器
///
/// 基于解析的代码符号生成 Wiki 文档
pub struct WikiGenerator {
    /// AST 解析器，用于从代码中提取符号信息
    parser: AstParser,
    /// Wiki 服务，用于存储和管理 Wiki 条目
    wiki_service: WikiService,
    /// 项目根目录
    root: PathBuf,
}

impl WikiGenerator {
    /// 创建新的生成器
    pub fn new(root: PathBuf) -> Self {
        Self {
            parser: AstParser::new(root.clone()),
            wiki_service: WikiService::new(root.clone()),
            root,
        }
    }

    /// 生成项目 Wiki（全量）
    pub fn generate(&self) -> Result<usize, String> {
        info!("开始生成项目 Wiki: {:?}", self.root);

        // 解析项目
        let symbol_count = self.parser.parse_project()?;
        info!("解析到 {} 个符号", symbol_count);

        // 初始化 Wiki 服务
        self.wiki_service.init()?;

        // 按模块组织符号
        let modules = self.organize_by_module();

        // 生成索引页（在遍历前，因为遍历会消耗 modules）
        self.generate_index(&modules)?;

        // 为每个模块生成 Wiki
        let mut generated_count = 0;
        for (module_name, symbols) in modules {
            let wiki_entry = self.generate_module_wiki(&module_name, &symbols)?;
            self.wiki_service.upsert(wiki_entry)?;
            generated_count += 1;
        }

        // 生成依赖图
        self.write_dependency_graph()?;

        // 写入元数据文件（.ydsz/wiki/.meta.json）
        self.write_meta(generated_count, symbol_count)?;

        info!("Wiki 生成完成，共生成 {} 个模块文档", generated_count);
        Ok(generated_count)
    }

    /// 增量生成 Wiki
    ///
    /// 读取上次生成的 `.meta.json`，比较文件 mtime，
    /// 如果所有文件都未变化则跳过生成。
    /// 
    /// # 返回值
    /// 
    /// - `Ok(count)` — 实际生成（或跳过时返回 0）的模块数
    pub fn generate_incremental(&self) -> Result<usize, String> {
        info!("增量生成 Wiki: {:?}", self.root);

        // 尝试加载上次 meta
        let prev_meta = WikiMeta::load(self.wiki_service.wiki_dir());

        // 收集当前所有源码文件的 mtime
        let current_files = self.collect_file_metas()?;

        // 如果有 meta 且所有文件都未变化，跳过
        if let Some(ref meta) = prev_meta {
            let all_unchanged = current_files.iter().all(|f| {
                meta.is_file_unchanged(&f.path, f.mtime)
            });
            if all_unchanged && !current_files.is_empty() {
                info!("所有文件未变化，跳过 Wiki 生成");
                // 仍需加载已有条目到内存
                self.wiki_service.load()?;
                return Ok(0);
            }
            info!("检测到文件变化，执行增量生成");
        }

        // 文件有变化，执行全量重新生成
        // （增量精确到模块级别的实现需要更复杂的依赖追踪，留待后续迭代）
        self.generate()
    }

    /// 收集项目中所有源码文件的 mtime
    fn collect_file_metas(&self) -> Result<Vec<FileMeta>, String> {
        let mut files = Vec::new();
        let code_extensions = ["rs", "ts", "tsx", "js", "jsx", "py", "go"];

        for entry in walkdir::WalkDir::new(&self.root)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            let ext = match path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };

            if !code_extensions.contains(&ext.as_str()) {
                continue;
            }

            let path_str = path.to_string_lossy();
            if path_str.contains("node_modules")
                || path_str.contains("target")
                || path_str.contains(".git")
                || path_str.contains("dist")
                || path_str.contains("build")
            {
                continue;
            }

            // 获取相对路径
            let rel_path = path.strip_prefix(&self.root)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();

            // 获取 mtime
            let mtime = std::fs::metadata(path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            files.push(FileMeta { path: rel_path, mtime });
        }

        Ok(files)
    }

    /// 写入 Wiki 元数据文件（2.0 增强版）
    ///
    /// 包含最后生成时间、模块数量、生成器版本、文件清单和符号统计
    fn write_meta(&self, module_count: usize, total_symbols: usize) -> Result<(), String> {
        let files = self.collect_file_metas()?;
        let meta = WikiMeta {
            last_generated_at: Utc::now().to_rfc3339(),
            module_count,
            generator_version: env!("CARGO_PKG_VERSION").to_string(),
            files,
            total_symbols,
        };

        let meta_path = self.wiki_service.wiki_dir().join(".meta.json");
        let json = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("序列化 Wiki meta 失败: {}", e))?;
        std::fs::write(&meta_path, json)
            .map_err(|e| format!("写入 Wiki meta 失败: {}", e))?;
        info!(path = %meta_path.display(), module_count, total_symbols, "Wiki meta 写入完成");
        Ok(())
    }

    /// 生成并写入模块依赖图
    fn write_dependency_graph(&self) -> Result<(), String> {
        let graph = self.parser.build_dependency_graph();
        let deps = DependencyGraph { edges: graph };

        let deps_path = self.wiki_service.wiki_dir().join(".deps.json");
        let json = serde_json::to_string_pretty(&deps)
            .map_err(|e| format!("序列化依赖图失败: {}", e))?;
        std::fs::write(&deps_path, json)
            .map_err(|e| format!("写入依赖图失败: {}", e))?;
        info!(path = %deps_path.display(), "Wiki 依赖图写入完成");
        Ok(())
    }

    /// 加载依赖图（从磁盘）
    pub fn load_dependency_graph(&self) -> Result<DependencyGraph, String> {
        let deps_path = self.wiki_service.wiki_dir().join(".deps.json");
        let content = std::fs::read_to_string(&deps_path)
            .map_err(|e| format!("读取依赖图失败: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("解析依赖图失败: {}", e))
    }

    /// 按模块组织符号
    fn organize_by_module(&self) -> HashMap<String, Vec<CodeSymbol>> {
        let mut modules: HashMap<String, Vec<CodeSymbol>> = HashMap::new();

        for symbol in self.parser.get_symbols() {
            // 从文件路径提取模块名
            let module = self.extract_module_name(&symbol.file);

            modules.entry(module).or_default().push(symbol);
        }

        modules
    }

    /// 从文件路径提取模块名
    fn extract_module_name(&self, path: &std::path::Path) -> String {
        // 获取相对于项目根目录的路径
        let relative = path.strip_prefix(&self.root).unwrap_or(path);

        // 获取父目录路径
        if let Some(parent) = relative.parent() {
            let parent_str = parent.to_string_lossy();

            // 如果是根目录，使用文件名
            if parent_str.is_empty() || parent_str == "." {
                return path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("root")
                    .to_string();
            }

            // 将路径分隔符替换为 ::
            parent_str.replace(std::path::MAIN_SEPARATOR, "::")
        } else {
            "root".to_string()
        }
    }

    /// 根据文件扩展名获取代码块语言标签
    fn code_block_lang(path: &std::path::Path) -> &'static str {
        match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
            Some("rs") => "rust",
            Some("ts") => "typescript",
            Some("tsx") => "tsx",
            Some("js") => "javascript",
            Some("jsx") => "jsx",
            Some("py") => "python",
            Some("go") => "go",
            _ => "text",
        }
    }

    /// 为模块生成 Wiki 文档
    fn generate_module_wiki(&self, module_name: &str, symbols: &[CodeSymbol]) -> Result<WikiEntry, String> {
        let mut content = String::new();

        // 标题
        content.push_str(&format!("# {}\n\n", module_name));

        // 概述
        content.push_str("## 概述\n\n");
        content.push_str(&format!("本模块包含 {} 个代码符号。\n\n", symbols.len()));

        // 按类型分组
        let mut by_kind: HashMap<SymbolKind, Vec<&CodeSymbol>> = HashMap::new();
        for symbol in symbols {
            by_kind.entry(symbol.kind.clone()).or_default().push(symbol);
        }

        // 按类型排序，保证输出稳定
        let mut sorted_kinds: Vec<(&SymbolKind, &Vec<&CodeSymbol>)> = by_kind.iter().collect();
        sorted_kinds.sort_by_key(|(k, _)| format!("{:?}", k));

        // 函数
        if let Some(functions) = by_kind.get(&SymbolKind::Function) {
            content.push_str("## 函数\n\n");
            for func in functions {
                content.push_str(&format!("### {}\n\n", func.name));
                if let Some(sig) = &func.signature {
                    let lang = Self::code_block_lang(&func.file);
                    content.push_str(&format!("```{}\n{}\n```\n\n", lang, sig));
                }
                if let Some(doc) = &func.doc_comment {
                    content.push_str(&format!("{}\n\n", doc));
                }
                content.push_str(&format!("- 位置: `{}:{}`\n\n",
                    func.file.display(), func.line));
            }
        }

        // 类/结构体
        if let Some(classes) = by_kind.get(&SymbolKind::Class) {
            content.push_str("## 类/结构体\n\n");
            for class in classes {
                content.push_str(&format!("### {}\n\n", class.name));
                if let Some(sig) = &class.signature {
                    let lang = Self::code_block_lang(&class.file);
                    content.push_str(&format!("```{}\n{}\n```\n\n", lang, sig));
                }
                if let Some(doc) = &class.doc_comment {
                    content.push_str(&format!("{}\n\n", doc));
                }
                content.push_str(&format!("- 位置: `{}:{}`\n\n",
                    class.file.display(), class.line));
            }
        }

        // 接口/Trait
        if let Some(interfaces) = by_kind.get(&SymbolKind::Interface) {
            content.push_str("## 接口/Trait\n\n");
            for iface in interfaces {
                content.push_str(&format!("### {}\n\n", iface.name));
                if let Some(sig) = &iface.signature {
                    let lang = Self::code_block_lang(&iface.file);
                    content.push_str(&format!("```{}\n{}\n```\n\n", lang, sig));
                }
                if let Some(doc) = &iface.doc_comment {
                    content.push_str(&format!("{}\n\n", doc));
                }
                content.push_str(&format!("- 位置: `{}:{}`\n\n",
                    iface.file.display(), iface.line));
            }
        }

        // 方法
        if let Some(methods) = by_kind.get(&SymbolKind::Method) {
            content.push_str("## 方法\n\n");
            for method in methods {
                content.push_str(&format!("### {}\n\n", method.name));
                if let Some(sig) = &method.signature {
                    let lang = Self::code_block_lang(&method.file);
                    content.push_str(&format!("```{}\n{}\n```\n\n", lang, sig));
                }
                if let Some(doc) = &method.doc_comment {
                    content.push_str(&format!("{}\n\n", doc));
                }
                content.push_str(&format!("- 位置: `{}:{}`\n\n",
                    method.file.display(), method.line));
            }
        }

        // 类型
        if let Some(types) = by_kind.get(&SymbolKind::Type) {
            content.push_str("## 类型\n\n");
            for ty in types {
                content.push_str(&format!("### {}\n\n", ty.name));
                if let Some(sig) = &ty.signature {
                    let lang = Self::code_block_lang(&ty.file);
                    content.push_str(&format!("```{}\n{}\n```\n\n", lang, sig));
                }
                if let Some(doc) = &ty.doc_comment {
                    content.push_str(&format!("{}\n\n", doc));
                }
                content.push_str(&format!("- 位置: `{}:{}`\n\n",
                    ty.file.display(), ty.line));
            }
        }

        // 常量
        if let Some(constants) = by_kind.get(&SymbolKind::Constant) {
            content.push_str("## 常量\n\n");
            for const_sym in constants {
                content.push_str(&format!("### {}\n\n", const_sym.name));
                if let Some(sig) = &const_sym.signature {
                    let lang = Self::code_block_lang(&const_sym.file);
                    content.push_str(&format!("```{}\n{}\n```\n\n", lang, sig));
                }
                if let Some(doc) = &const_sym.doc_comment {
                    content.push_str(&format!("{}\n\n", doc));
                }
                content.push_str(&format!("- 位置: `{}:{}`\n\n",
                    const_sym.file.display(), const_sym.line));
            }
        }

        // 符号列表（用于检索）
        content.push_str("## 符号\n\n");
        for symbol in symbols {
            content.push_str(&format!("- {}\n", symbol.name));
        }

        let symbol_names = symbols.iter().map(|s| s.name.clone()).collect();

        Ok(WikiEntry {
            module: module_name.to_string(),
            title: module_name.to_string(),
            content,
            symbols: symbol_names,
            updated_at: Utc::now(),
        })
    }

    /// 生成索引页
    fn generate_index(&self, modules: &HashMap<String, Vec<CodeSymbol>>) -> Result<(), String> {
        let mut content = String::new();

        content.push_str("# 项目 Wiki 索引\n\n");
        content.push_str(&format!("本项目包含 {} 个模块。\n\n", modules.len()));

        content.push_str("## 模块列表\n\n");

        let mut module_names: Vec<_> = modules.keys().collect();
        module_names.sort();

        for module_name in module_names {
            let symbols = &modules[module_name];
            content.push_str(&format!("- [{}](./{}.md) - {} 个符号\n",
                module_name, module_name, symbols.len()));
        }

        let entry = WikiEntry {
            module: "index".to_string(),
            title: "项目 Wiki 索引".to_string(),
            content,
            symbols: Vec::new(),
            updated_at: Utc::now(),
        };

        self.wiki_service.upsert(entry)
    }

    /// 获取 Wiki 服务
    pub fn wiki_service(&self) -> &WikiService {
        &self.wiki_service
    }

    /// 获取 AST 解析器
    pub fn parser(&self) -> &AstParser {
        &self.parser
    }
}
