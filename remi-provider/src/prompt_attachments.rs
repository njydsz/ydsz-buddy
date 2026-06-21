//! # Prompt Attachments 模块
//!
//! 在构造 Provider turn 时附带的'上下文附件'——文件、目录、图片、URL、AGENTS.md 等。
//!
//! ## 附件类型
//!
//! - `File`：单个文件（含内容或路径，让 Provider 读）
//! - `Directory`：目录（递归包含文件树信息，不直接读内容）
//! - `Image`：图片（base64 inline）
//! - `Url`：外部 URL（让 Provider 抓取）
//! - `AgentsMd`：AGENTS.md 全文注入
//!
//! ## 设计
//!
//! - 一个 `PromptAttachments` 是一个有序集合
//! - 序列化为 turn input 时统一走 `to_provider_payload()`
//! - 客户端可以动态增删附件
//! - 上限 64 个附件（防止 turn 过大）
//!
//! ## 用法
//!
//! ```rust,ignore
//! let mut att = PromptAttachments::new();
//! att.add_file('src/main.rs', file_content);
//! att.add_agents_md(agents_md_content);
//! let payload = att.to_provider_payload();
//! ```

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// 附件类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AttachmentKind {
    File,
    Directory,
    Image,
    Url,
    AgentsMd,
}

/// 附件条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    /// 唯一 id（自动生成）
    pub id: String,
    /// 类型
    pub kind: AttachmentKind,
    /// 路径 / URL / 标识
    pub reference: String,
    /// MIME（可推断）
    pub mime_type: Option<String>,
    /// 内联内容（文件文本 / 图片 base64）
    pub content: Option<String>,
    /// 注释（用户/UI 标注）
    pub note: Option<String>,
}

impl Attachment {
    fn new(kind: AttachmentKind, reference: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            kind,
            reference: reference.into(),
            mime_type: None,
            content: None,
            note: None,
        }
    }

    /// 设置 MIME
    pub fn with_mime(mut self, mime: impl Into<String>) -> Self {
        self.mime_type = Some(mime.into());
        self
    }

    /// 设置内容
    pub fn with_content(mut self, content: impl Into<String>) -> Self {
        self.content = Some(content.into());
        self
    }

    /// 设置注释
    pub fn with_note(mut self, note: impl Into<String>) -> Self {
        self.note = Some(note.into());
        self
    }
}

/// 附件上限
pub const MAX_ATTACHMENTS: usize = 64;

/// 提示附件集合
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptAttachments {
    items: Vec<Attachment>,
}

impl PromptAttachments {
    pub fn new() -> Self {
        Self::default()
    }

    /// 当前数量
    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// 全部
    pub fn items(&self) -> &[Attachment] {
        &self.items
    }

    /// 添加文件
    pub fn add_file(&mut self, path: impl Into<String>, content: impl Into<String>) -> Option<&Attachment> {
        if self.items.len() >= MAX_ATTACHMENTS {
            return None;
        }
        self.items.push(
            Attachment::new(AttachmentKind::File, path).with_content(content),
        );
        self.items.last()
    }

    /// 添加目录（只记 reference，不带内容）
    pub fn add_directory(&mut self, path: impl Into<String>) -> Option<&Attachment> {
        if self.items.len() >= MAX_ATTACHMENTS {
            return None;
        }
        self.items.push(Attachment::new(AttachmentKind::Directory, path));
        self.items.last()
    }

    /// 添加图片
    pub fn add_image(
        &mut self,
        path: impl Into<String>,
        mime: impl Into<String>,
        base64: impl Into<String>,
    ) -> Option<&Attachment> {
        if self.items.len() >= MAX_ATTACHMENTS {
            return None;
        }
        self.items.push(
            Attachment::new(AttachmentKind::Image, path)
                .with_mime(mime)
                .with_content(base64),
        );
        self.items.last()
    }

    /// 添加 URL
    pub fn add_url(&mut self, url: impl Into<String>) -> Option<&Attachment> {
        if self.items.len() >= MAX_ATTACHMENTS {
            return None;
        }
        self.items.push(Attachment::new(AttachmentKind::Url, url));
        self.items.last()
    }

    /// 添加 AGENTS.md
    pub fn add_agents_md(&mut self, content: impl Into<String>) -> Option<&Attachment> {
        if self.items.len() >= MAX_ATTACHMENTS {
            return None;
        }
        self.items.push(
            Attachment::new(AttachmentKind::AgentsMd, "AGENTS.md")
                .with_mime("text/markdown")
                .with_content(content),
        );
        self.items.last()
    }

    /// 移除
    pub fn remove(&mut self, id: &str) -> bool {
        if let Some(pos) = self.items.iter().position(|a| a.id == id) {
            self.items.remove(pos);
            true
        } else {
            false
        }
    }

    /// 清空
    pub fn clear(&mut self) {
        self.items.clear();
    }

    /// 按类型过滤
    pub fn filter(&self, kind: AttachmentKind) -> Vec<&Attachment> {
        self.items.iter().filter(|a| a.kind == kind).collect()
    }

    /// 序列化为 Provider 可消费的 payload
    pub fn to_provider_payload(&self) -> serde_json::Value {
        let mut by_kind: BTreeMap<String, Vec<&Attachment>> = BTreeMap::new();
        for a in &self.items {
            by_kind
                .entry(a.kind.as_str().to_string())
                .or_default()
                .push(a);
        }
        let mut out = serde_json::Map::new();
        for (kind, list) in by_kind {
            out.insert(
                kind,
                serde_json::json!(list
                    .iter()
                    .map(|a| {
                        serde_json::json!({
                            "id": a.id,
                            "reference": a.reference,
                            "mime_type": a.mime_type,
                            "content": a.content,
                            "note": a.note,
                        })
                    })
                    .collect::<Vec<_>>()),
            );
        }
        serde_json::Value::Object(out)
    }
}

impl AttachmentKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Directory => "directory",
            Self::Image => "image",
            Self::Url => "url",
            Self::AgentsMd => "agents_md",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_file_records_content() {
        let mut att = PromptAttachments::new();
        att.add_file("src/main.rs", "fn main() {}");
        assert_eq!(att.len(), 1);
        let a = &att.items()[0];
        assert_eq!(a.kind, AttachmentKind::File);
        assert_eq!(a.reference, "src/main.rs");
        assert_eq!(a.content.as_deref(), Some("fn main() {}"));
    }

    #[test]
    fn filter_by_kind() {
        let mut att = PromptAttachments::new();
        att.add_file("a.rs", "x");
        att.add_url("https://example.com");
        att.add_image("a.png", "image/png", "BASE64");
        let files = att.filter(AttachmentKind::File);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].reference, "a.rs");
    }

    #[test]
    fn remove_by_id() {
        let mut att = PromptAttachments::new();
        att.add_file("a.rs", "x");
        let id = att.items()[0].id.clone();
        assert!(att.remove(&id));
        assert!(att.is_empty());
        assert!(!att.remove("nonexistent"));
    }

    #[test]
    fn max_attachments_enforced() {
        let mut att = PromptAttachments::new();
        for i in 0..MAX_ATTACHMENTS {
            assert!(att.add_file(format!("f{}.rs", i), "x").is_some());
        }
        // 第 65 个被拒
        assert!(att.add_file("overflow.rs", "x").is_none());
    }

    #[test]
    fn payload_groups_by_kind() {
        let mut att = PromptAttachments::new();
        att.add_file("a.rs", "x");
        att.add_url("https://example.com");
        let p = att.to_provider_payload();
        assert!(p.get("file").is_some());
        assert!(p.get("url").is_some());
        assert!(p.get("image").is_none());
    }

    #[test]
    fn agents_md_uses_markdown_mime() {
        let mut att = PromptAttachments::new();
        att.add_agents_md("# rules");
        let a = &att.items()[0];
        assert_eq!(a.kind, AttachmentKind::AgentsMd);
        assert_eq!(a.mime_type.as_deref(), Some("text/markdown"));
    }
}
