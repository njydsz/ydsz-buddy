// ydsz-shared: 文件系统工具

use serde::{Deserialize, Serialize};

/// 文件系统 Provider trait（抽象接口）
#[async_trait::async_trait]
pub trait FsProvider: Send + Sync {
    async fn read_dir(&self, path: &str) -> anyhow::Result<Vec<FsEntry>>;
    async fn read_file(&self, path: &str) -> anyhow::Result<Vec<u8>>;
    async fn exists(&self, path: &str) -> bool;
    async fn walk(&self, path: &str, opts: WalkOptions) -> anyhow::Result<Vec<FsEntry>>;
}

#[async_trait::async_trait]
impl FsProvider for crate::fs::LocalFs {
    async fn read_dir(&self, path: &str) -> anyhow::Result<Vec<FsEntry>> {
        LocalFs::read_dir(self, path).await
    }

    async fn read_file(&self, path: &str) -> anyhow::Result<Vec<u8>> {
        LocalFs::read_file(self, path).await
    }

    async fn exists(&self, path: &str) -> bool {
        LocalFs::exists(self, path).await
    }

    async fn walk(&self, path: &str, opts: WalkOptions) -> anyhow::Result<Vec<FsEntry>> {
        LocalFs::walk(self, path, opts).await
    }
}

/// 文件系统入口类型
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FsEntryKind {
    File,
    Directory,
    Symlink,
}

/// 文件系统入口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub path: String,
    pub name: String,
    pub kind: FsEntryKind,
    pub size: Option<u64>,
}

/// 遍历选项
#[derive(Debug, Clone)]
pub struct WalkOptions {
    pub max_depth: Option<usize>,
    pub follow_symlinks: bool,
    pub include_hidden: bool,
}

impl WalkOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn max_depth(mut self, depth: usize) -> Self {
        self.max_depth = Some(depth);
        self
    }

    pub fn follow_symlinks(mut self, yes: bool) -> Self {
        self.follow_symlinks = yes;
        self
    }

    pub fn include_hidden(mut self, yes: bool) -> Self {
        self.include_hidden = yes;
        self
    }
}

impl Default for WalkOptions {
    fn default() -> Self {
        Self {
            max_depth: None,
            follow_symlinks: false,
            include_hidden: false,
        }
    }
}

/// 文件系统 Provider 具体实现（本地 FS）
pub struct LocalFs;

impl LocalFs {
    pub fn new() -> Self {
        Self
    }

    pub async fn read_dir(&self, _path: &str) -> anyhow::Result<Vec<FsEntry>> {
        Ok(Vec::new())
    }

    pub async fn read_file(&self, _path: &str) -> anyhow::Result<Vec<u8>> {
        Ok(Vec::new())
    }

    pub async fn exists(&self, _path: &str) -> bool {
        false
    }

    pub async fn walk(&self, _path: &str, _opts: WalkOptions) -> anyhow::Result<Vec<FsEntry>> {
        Ok(Vec::new())
    }
}

impl Default for LocalFs {
    fn default() -> Self {
        Self::new()
    }
}
