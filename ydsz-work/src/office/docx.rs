use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DocxBlock {
    Paragraph { text: String, style: Option<String>, bold: bool, italic: bool },
    Heading { text: String, level: u8 },
    Table { headers: Option<Vec<String>>, rows: Vec<Vec<String>> },
    BulletList { items: Vec<String> },
}

pub struct DocxProcessor;

impl DocxProcessor {
    pub fn read(path: &Path) -> anyhow::Result<Vec<DocxParagraph>> {
        // Stub: return empty
        Ok(vec![])
    }

    pub fn write(path: &Path, paragraphs: &[String]) -> anyhow::Result<()> {
        // Stub: create minimal docx
        std::fs::write(path, "")?;
        Ok(())
    }

    pub fn write_blocks(path: &Path, blocks: &[DocxBlock]) -> anyhow::Result<()> {
        // Stub
        std::fs::write(path, "")?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct DocxParagraph {
    pub text: String,
}
