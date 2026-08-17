use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum XlsxCellInput {
    Text(String),
    Number(f64),
    Formula(String),
    Bool(bool),
    DateTime(String),
    Empty,
}

pub struct XlsxProcessor;

impl XlsxProcessor {
    pub fn read(path: &Path) -> anyhow::Result<Vec<(String, Vec<Vec<XlsxCell>>)>> {
        Ok(vec![])
    }

    pub fn write(path: &Path, sheet_name: &str, rows: &[Vec<String>]) -> anyhow::Result<()> {
        std::fs::write(path, "")?;
        Ok(())
    }

    pub fn write_typed(path: &Path, sheet_name: &str, rows: &[Vec<XlsxCellInput>]) -> anyhow::Result<()> {
        std::fs::write(path, "")?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XlsxCell {
    value: String,
}

impl XlsxCell {
    pub fn as_string(&self) -> String { self.value.clone() }
}

impl Default for XlsxCell {
    fn default() -> Self {
        Self { value: String::new() }
    }
}
