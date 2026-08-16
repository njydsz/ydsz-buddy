use std::path::Path;

/// 预置语言服务器配置
#[derive(Debug, Clone)]
pub struct LanguagePreset {
    /// 语言名称
    pub language: String,
    /// 服务器可执行文件名
    pub server_command: String,
    /// 服务器启动参数
    pub server_args: Vec<String>,
    /// 文件扩展名列表
    pub file_extensions: Vec<String>,
}

impl LanguagePreset {
    /// TypeScript / JavaScript
    pub fn typescript() -> Self {
        Self {
            language: "typescript".into(),
            server_command: "typescript-language-server".into(),
            server_args: vec!["--stdio".into()],
            file_extensions: vec!["ts".into(), "tsx".into(), "js".into(), "jsx".into()],
        }
    }

    /// Python
    pub fn python() -> Self {
        Self {
            language: "python".into(),
            server_command: "pyright-langserver".into(),
            server_args: vec!["--stdio".into()],
            file_extensions: vec!["py".into()],
        }
    }

    /// Rust
    pub fn rust() -> Self {
        Self {
            language: "rust".into(),
            server_command: "rust-analyzer".into(),
            server_args: vec![],
            file_extensions: vec!["rs".into()],
        }
    }

    /// Go
    pub fn go() -> Self {
        Self {
            language: "go".into(),
            server_command: "gopls".into(),
            server_args: vec!["serve".into()],
            file_extensions: vec!["go".into()],
        }
    }

    /// Java (Eclipse JDT Language Server)
    pub fn java() -> Self {
        Self {
            language: "java".into(),
            server_command: "jdtls".into(),
            server_args: vec!["--stdio".into()],
            file_extensions: vec!["java".into()],
        }
    }

    /// C# (OmniSharp)
    pub fn csharp() -> Self {
        Self {
            language: "csharp".into(),
            server_command: "OmniSharp".into(),
            server_args: vec!["--stdio".into(),"-lsp".into()],
            file_extensions: vec!["cs".into(),"csx".into()],
        }
    }

    /// C/C++ (clangd)
    pub fn cpp() -> Self {
        Self {
            language: "cpp".into(),
            server_command: "clangd".into(),
            server_args: vec!["--background-index".into()],
            file_extensions: vec!["c".into(),"cpp".into(),"cc".into(),"cxx".into(),"h".into(),"hpp".into(),"hh".into(),"hxx".into()],
        }
    }

    /// 根据文件路径推断语言
    pub fn detect_language(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_string_lossy().to_lowercase();
        let presets = [
            Self::typescript(),
            Self::python(),
            Self::rust(),
            Self::go(),
            Self::java(),
            Self::csharp(),
            Self::cpp(),
        ];
        presets
            .into_iter()
            .find(|p| p.file_extensions.iter().any(|e| e == &ext))
    }

    /// 列出所有预置
    pub fn all() -> Vec<Self> {
        vec![
            Self::typescript(),
            Self::python(),
            Self::rust(),
            Self::go(),
            Self::java(),
            Self::csharp(),
            Self::cpp(),
        ]
    }
}
