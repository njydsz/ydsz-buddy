use std::path::Path;

pub struct PdfProcessor;

impl PdfProcessor {
    pub fn extract_text(path: &Path) -> anyhow::Result<String> {
        // Stub
        Ok(String::new())
    }
}
