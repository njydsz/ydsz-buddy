use std::path::Path;

pub struct PptxGenerator;

impl PptxGenerator {
    pub fn new() -> Self { Self }

    pub fn add_title_slide_with_notes(&mut self, title: String, subtitle: String, notes: Option<String>) {}
    pub fn add_content_slide_with_notes(&mut self, title: String, bullets: Vec<String>, notes: Option<String>) {}
    pub fn add_section_slide_with_notes(&mut self, title: String, notes: Option<String>) {}
    pub fn add_two_column_slide_with_notes(&mut self, title: String, left_heading: String, left_bullets: Vec<String>, right_heading: String, right_bullets: Vec<String>, notes: Option<String>) {}
    pub fn add_table_slide_with_notes(&mut self, title: String, headers: Vec<String>, rows: Vec<Vec<String>>, notes: Option<String>) {}

    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        std::fs::write(path, "")?;
        Ok(())
    }
}
