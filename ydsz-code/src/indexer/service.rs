use std::path::Path;
use std::sync::Arc;

use parking_lot::RwLock;
use ydsz_shared::fs::{FsEntryKind, FsProvider, LocalFs, WalkOptions};
use tracing::warn;
// `#[derive(specta::Type)]` 用的 derive 宏路径
#[allow(unused_imports)]
use specta::Type;

use super::ast::AstIndexer;
use super::ast_grep::AstGrepSearcher;
use super::ast_grep::MatchResult;
use super::query::text_search;
use super::{IndexerError, IndexerResult};

/// 符号种类
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum SymbolKind {
    Function,
    Class,
    Interface,
    Type,
    Method,
    Variable,
    Module,
}

/// 索引条目
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SymbolEntry {
    pub name: String,
    pub kind: SymbolKind,
    pub file: std::path::PathBuf,
    pub line: u32,
    pub column: u32,
}

/// 索引策略
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexStrategy {
    /// 默认：AST 优先，正则兜底
    AstWithRegexFallback,
    /// 仅正则（不依赖 tree-sitter，兼容性最好）
    RegexOnly,
}

/// 索引构建统计
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct BuildStats {
    /// AST 提取成功的文件数
    pub ast_files: usize,
    /// 正则兜底的文件数
    pub regex_files: usize,
    /// 跳过/失败的文件数
    pub skipped_files: usize,
    /// 解析失败但仍能处理的文件数（AST 失败 → 正则兜底）
    pub fallback_files: usize,
}

/// 索引服务
pub struct IndexerService {
    symbols: Arc<RwLock<Vec<SymbolEntry>>>,
    root: std::path::PathBuf,
    built: Arc<RwLock<bool>>,
    ast: Arc<AstIndexer>,
    strategy: IndexStrategy,
    /// 文件系统抽象（本地 LocalFs 或远端 RemoteFs）
    ///
    /// 通过 `with_fs_provider` 注入 SSH RemoteFs 后，索引构建可走远端文件系统。
    fs: Arc<dyn FsProvider>,
}

impl IndexerService {
    pub fn new(root: std::path::PathBuf) -> Self {
        Self::with_strategy(root, IndexStrategy::AstWithRegexFallback)
    }

    pub fn with_strategy(root: std::path::PathBuf, strategy: IndexStrategy) -> Self {
        Self::with_strategy_and_fs_provider(root, strategy, Arc::new(LocalFs::new()))
    }

    /// 使用指定 FsProvider 构造（本地或远端）
    ///
    /// - `fs: Arc::new(LocalFs::new())` → 本地文件系统
    /// - `fs: Arc::new(RemoteFs::new(ssh_conn))` → SSH 远端文件系统
    pub fn with_fs_provider(root: std::path::PathBuf, fs: Arc<dyn FsProvider>) -> Self {
        Self::with_strategy_and_fs_provider(root, IndexStrategy::AstWithRegexFallback, fs)
    }

    /// 同时指定策略和 FsProvider 的完整构造函数
    pub fn with_strategy_and_fs_provider(
        root: std::path::PathBuf,
        strategy: IndexStrategy,
        fs: Arc<dyn FsProvider>,
    ) -> Self {
        Self {
            symbols: Arc::new(RwLock::new(Vec::new())),
            root,
            built: Arc::new(RwLock::new(false)),
            ast: Arc::new(AstIndexer::new()),
            strategy,
            fs,
        }
    }

    /// 构建索引：遍历文件，按策略提取符号
    ///
    /// 通过 `FsProvider::walk` + `FsProvider::read_file` 抽象文件访问，
    /// 本地和 SSH 远端走同一套逻辑。
    pub async fn build(&self) -> IndexerResult<BuildStats> {
        let mut symbols = Vec::new();
        let mut stats = BuildStats::default();
        let code_extensions = [
            "ts", "tsx", "js", "jsx", "rs", "py", "pyi", "mts", "cts", "mjs", "cjs",
        ];

        let root_str = self.root.to_string_lossy().to_string();
        // include_hidden=true 保持与原 WalkDir 行为一致（遍历所有文件，下面再过滤 .git 等）
        let entries = self
            .fs
            .walk(&root_str, WalkOptions::new().include_hidden(true))
            .await
            .map_err(|e| IndexerError::BuildFailed(format!("walk 失败: {e}")))?;

        for entry in entries {
            if entry.kind != FsEntryKind::File {
                continue;
            }
            let path = std::path::PathBuf::from(&entry.path);
            let ext = match path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            if !code_extensions.contains(&ext.as_str()) {
                continue;
            }
            // 跳过 node_modules / target / .git
            let path_str = path.to_string_lossy();
            if path_str.contains("node_modules")
                || path_str.contains("target")
                || path_str.contains(".git")
            {
                continue;
            }

            let content = match self.fs.read_file(&entry.path).await {
                Ok(s) => s,
                Err(e) => {
                    warn!(file = %path.display(), error = %e, "读取文件失败，跳过");
                    stats.skipped_files += 1;
                    continue;
                }
            };

            let mut extracted = match self.strategy {
                IndexStrategy::AstWithRegexFallback => {
                    match self.ast.extract_symbols(&path, &content) {
                        Ok(s) => {
                            stats.ast_files += 1;
                            s
                        }
                        Err(_) => {
                            // AST 失败（语法错误或不支持）→ 正则兜底
                            stats.fallback_files += 1;
                            stats.regex_files += 1;
                            Self::extract_symbols_regex(&path, &content)
                        }
                    }
                }
                IndexStrategy::RegexOnly => {
                    stats.regex_files += 1;
                    Self::extract_symbols_regex(&path, &content)
                }
            };

            symbols.append(&mut extracted);
        }

        let _count = symbols.len();
        *self.symbols.write() = symbols;
        *self.built.write() = true;
        Ok(stats)
    }

    /// 正则兜底提取（保留原实现，对外暴露以便 AST 失败时复用）
    pub fn extract_symbols_regex(
        file: &Path,
        content: &str,
    ) -> Vec<SymbolEntry> {
        let patterns: &[(&str, SymbolKind)] = &[
            (r"\bfn\s+(\w+)", SymbolKind::Function),
            (r"\bfunction\s+(\w+)", SymbolKind::Function),
            (r"\bdef\s+(\w+)", SymbolKind::Function),
            (r"\bclass\s+(\w+)", SymbolKind::Class),
            (r"\binterface\s+(\w+)", SymbolKind::Interface),
            (r"\btype\s+(\w+)\s*=", SymbolKind::Type),
            (r"\bstruct\s+(\w+)", SymbolKind::Class),
            (r"\benum\s+(\w+)", SymbolKind::Type),
            (r"\bimpl\s+(\w+)", SymbolKind::Class),
        ];

        let mut symbols = Vec::new();
        for (line_idx, line) in content.lines().enumerate() {
            for (pattern, kind) in patterns {
                if let Some(name) = extract_first_capture(pattern, line) {
                    symbols.push(SymbolEntry {
                        name,
                        kind: kind.clone(),
                        file: file.to_path_buf(),
                        line: (line_idx + 1) as u32,
                        column: 1,
                    });
                }
            }
        }
        symbols
    }

    /// 搜索符号
    pub fn search(&self, query: &str) -> Vec<SymbolEntry> {
        let symbols = self.symbols.read();
        let lower = query.to_lowercase();
        symbols
            .iter()
            .filter(|s| s.name.to_lowercase().contains(&lower))
            .cloned()
            .collect()
    }

    /// 全文本搜索（walkdir 兜底）
    pub fn search_text(&self, query: &str) -> IndexerResult<Vec<super::query::SearchResult>> {
        text_search(&self.root, query)
    }

    pub fn is_built(&self) -> bool {
        *self.built.read()
    }

    pub fn symbol_count(&self) -> usize {
        self.symbols.read().len()
    }

    /// 获取内部 AST 索引器（供外部扩展使用）
    pub fn ast_indexer(&self) -> Arc<AstIndexer> {
        self.ast.clone()
    }

    /// 获取当前策略
    pub fn strategy(&self) -> IndexStrategy {
        self.strategy
    }

    // ---- AST-Grep 结构搜索（基于 tree-sitter，符号搜索的"超集"） ----

    /// 获取 AST-Grep 搜索器
    ///
    /// 返回的搜索器无需预构建索引，每次调用会重新遍历工作区。
    /// 工作区规模 < 1k 文件时性能可接受；大规模项目可后续扩展为"预建索引"模式。
    pub fn ast_grep(&self) -> AstGrepSearcher {
        AstGrepSearcher::new(self.root.clone())
    }

    /// 按节点类型搜索（如 `"try_statement"` / `"call_expression"` / `"await_expression"`）
    pub fn find_by_node_kind(&self, kind: &str) -> IndexerResult<Vec<MatchResult>> {
        self.ast_grep().find_by_node_kind(kind)
    }

    /// 按 tree-sitter S-expression 查询搜索（高级 API）
    pub fn find_by_query(
        &self,
        lang: super::ast::Language,
        query_str: &str,
    ) -> IndexerResult<Vec<MatchResult>> {
        self.ast_grep().find_by_query(lang, query_str)
    }

    /// 找所有对 `name` 的引用（定义、调用、读取等所有出现位置）
    pub fn find_references(&self, name: &str) -> IndexerResult<Vec<MatchResult>> {
        self.ast_grep().find_references(name)
    }

    /// 找所有 `name(...)` 形式的调用
    ///
    /// `name` 支持：
    /// - 单段名 `"foo"`：匹配 `foo()` / `obj.foo()` / `obj.sub.foo()`
    /// - 复合名 `"obj.foo"`：严格匹配 `obj.foo()`
    pub fn find_calls_to(&self, name: &str) -> IndexerResult<Vec<MatchResult>> {
        self.ast_grep().find_calls_to(name)
    }
}

fn extract_first_capture(pattern: &str, text: &str) -> Option<String> {
    let re = regex_lite::Regex::new(pattern).ok()?;
    re.captures(text)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn extract_typescript_functions_via_ast() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("demo.ts");
        let mut f = std::fs::File::create(&file_path).unwrap();
        writeln!(
            f,
            r#"
export function greet(name: string): string {{
    return `hello ${{name}}`;
}}

interface Greeter {{
    greet(name: string): string;
}}

class EnglishGreeter implements Greeter {{
    greet(name: string): string {{
        return `Hello, ${{name}}!`;
    }}
}}

type Greeting = string;

const MAX_LEN = 100;
"#
        )
        .unwrap();

        let indexer = AstIndexer::new();
        let symbols = indexer.extract_symbols(&file_path, &fs::read_to_string(&file_path).unwrap()).unwrap();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();

        assert!(names.contains(&"greet"), "应包含 greet: {:?}", names);
        assert!(names.contains(&"Greeter"), "应包含 Greeter: {:?}", names);
        assert!(
            names.contains(&"EnglishGreeter"),
            "应包含 EnglishGreeter: {:?}",
            names
        );
        assert!(names.contains(&"Greeting"), "应包含 Greeting: {:?}", names);
    }

    #[test]
    fn extract_rust_symbols_via_ast() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("lib.rs");
        let mut f = std::fs::File::create(&file_path).unwrap();
        writeln!(
            f,
            r#"
pub fn hello() -> String {{
    String::from("hi")
}}

pub struct Config {{
    pub name: String,
}}

pub enum Color {{
    Red,
    Blue,
}}

pub trait Greet {{
    fn greet(&self) -> String;
}}

impl Greet for Config {{
    fn greet(&self) -> String {{
        format!("Hello, {{}}", self.name)
    }}
}}
"#
        )
        .unwrap();

        let indexer = AstIndexer::new();
        let symbols = indexer.extract_symbols(&file_path, &fs::read_to_string(&file_path).unwrap()).unwrap();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();

        assert!(names.contains(&"hello"), "fn hello: {:?}", names);
        assert!(names.contains(&"Config"), "struct Config: {:?}", names);
        assert!(names.contains(&"Color"), "enum Color: {:?}", names);
        assert!(names.contains(&"Greet"), "trait Greet: {:?}", names);
        // impl Greet for Config 内 fn greet 应出现为 Greet::greet
        assert!(
            names.contains(&"Greet::greet"),
            "impl method: {:?}",
            names
        );
    }

    #[test]
    fn extract_python_symbols_via_ast() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("app.py");
        let mut f = std::fs::File::create(&file_path).unwrap();
        writeln!(
            f,
            r#"
def hello():
    return "hi"

class Greeter:
    def greet(self, name):
        return f"Hello, {{name}}"

MAX_LEN = 100
"#
        )
        .unwrap();

        let indexer = AstIndexer::new();
        let symbols = indexer.extract_symbols(&file_path, &fs::read_to_string(&file_path).unwrap()).unwrap();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();

        assert!(names.contains(&"hello"), "def hello: {:?}", names);
        assert!(names.contains(&"Greeter"), "class Greeter: {:?}", names);
        assert!(
            names.contains(&"Greeter.greet"),
            "class method: {:?}",
            names
        );
    }

    #[tokio::test]
    async fn indexer_service_uses_ast_with_fallback() {
        let dir = tempdir().unwrap();
        // 一个合法 TS 文件
        std::fs::write(
            dir.path().join("ok.ts"),
            "export function hello() { return 1; }",
        )
        .unwrap();
        // 一个不合法（语法错）的文件 → 应触发正则兜底
        std::fs::write(
            dir.path().join("bad.ts"),
            "function broken() { return // 故意不闭合",
        )
        .unwrap();

        let svc = IndexerService::new(dir.path().to_path_buf());
        let stats = svc.build().await.unwrap();
        assert!(stats.ast_files >= 1, "至少一个 TS 文件走 AST: {:?}", stats);
        // bad.ts 即使 AST 失败也会落回正则 → symbol_count > 0
        assert!(svc.symbol_count() > 0, "兜底后应有符号: {:?}", stats);
    }

    #[tokio::test]
    async fn indexer_service_with_fs_provider_builds_locally() {
        let dir = tempdir().unwrap();
        std::fs::write(
            dir.path().join("ok.ts"),
            "export function hello() { return 1; }",
        )
        .unwrap();

        let fs = Arc::new(LocalFs::new());
        let svc = IndexerService::with_fs_provider(dir.path().to_path_buf(), fs);
        let stats = svc.build().await.unwrap();
        assert!(stats.ast_files >= 1, "通过 FsProvider 构建应成功: {:?}", stats);
        assert!(svc.symbol_count() > 0, "应有符号: {:?}", stats);
    }

    // 简单的 fs 别名，简化测试代码
    use std::fs;
}
