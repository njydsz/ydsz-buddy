use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default)]
pub struct DataSandbox;

impl DataSandbox {
    pub fn new() -> Self { Self }
    
    pub fn analyze_csv(path: &str) -> anyhow::Result<CsvAnalysis> {
        Ok(CsvAnalysis {
            source: path.to_string(),
            row_count: 0,
            column_count: 0,
            columns: vec![],
            preview: vec![],
        })
    }
    
    pub fn analyze_csv_content(content: &str, _name: &str) -> anyhow::Result<CsvAnalysis> {
        let _ = content;
        Ok(CsvAnalysis {
            source: "inline".to_string(),
            row_count: 0,
            column_count: 0,
            columns: vec![],
            preview: vec![],
        })
    }
    
    pub fn analyze_json(json: &str, _name: &str) -> anyhow::Result<JsonAnalysis> {
        let _ = json;
        Ok(JsonAnalysis {
            source: "inline".to_string(),
            root_type: "object".to_string(),
            array_length: None,
            columns: vec![],
            preview: vec![],
        })
    }
    
    pub fn transform_csv(content: &str, _ops: &[TransformOp], _name: &str) -> anyhow::Result<TransformResult> {
        let _ = content;
        Ok(TransformResult {
            row_count: 0,
            rows: vec![],
        })
    }
    
    pub fn generate_chart(content: &str, chart_type: ChartType, x_column: &str, y_column: &str, group_column: Option<&str>, agg_func: Option<&str>) -> anyhow::Result<ChartSpec> {
        let _ = content;
        Ok(ChartSpec {
            chart_type,
            title: String::new(),
            x_column: x_column.to_string(),
            y_column: y_column.to_string(),
            group_column: group_column.map(String::from),
            agg_func: agg_func.map(String::from),
            data: ChartData { series: vec![] },
            x_label: None,
            y_label: None,
            categories: vec![],
            y_min: None,
            y_max: None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnStats {
    pub name: String,
    pub column_type: ColumnType,
    pub count: usize,
    pub null_count: usize,
    pub unique_count: usize,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub median: Option<f64>,
    pub std_dev: Option<f64>,
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColumnType {
    Integer,
    Float,
    String,
    Boolean,
    Date,
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvAnalysis {
    pub source: String,
    pub row_count: usize,
    pub column_count: usize,
    pub columns: Vec<ColumnStats>,
    pub preview: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonAnalysis {
    pub source: String,
    pub root_type: String,
    pub array_length: Option<usize>,
    pub columns: Vec<ColumnStats>,
    pub preview: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformResult {
    pub row_count: usize,
    pub rows: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum TransformOp {
    Filter { column: String, operator: String, value: String },
    Sort { column: String, descending: bool },
    Aggregate { group_by: String, agg_column: String, agg_func: String },
    Select { columns: Vec<String> },
    Limit { count: usize },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartSpec {
    pub chart_type: ChartType,
    pub title: String,
    pub x_column: String,
    pub y_column: String,
    pub group_column: Option<String>,
    pub agg_func: Option<String>,
    pub data: ChartData,
    pub x_label: Option<String>,
    pub y_label: Option<String>,
    pub categories: Vec<String>,
    pub y_min: Option<f64>,
    pub y_max: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChartType {
    Bar,
    Line,
    Pie,
    Scatter,
    Area,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartData {
    pub series: Vec<ChartSeries>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartSeries {
    pub name: String,
    pub points: Vec<ChartPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartPoint {
    pub x: String,
    pub y: f64,
}
