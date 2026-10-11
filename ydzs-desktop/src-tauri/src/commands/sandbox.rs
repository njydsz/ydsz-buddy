//! # 数据分析沙箱命令模块
//!
//! 提供数据分析和转换相关的 Tauri 命令。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `sandbox_analyze_csv` | 分析 CSV 文件 |
//! | `sandbox_analyze_csv_content` | 分析 CSV 内容字符串 |
//! | `sandbox_analyze_json` | 分析 JSON 数据 |
//! | `sandbox_transform_csv` | 对 CSV 数据执行转换 |
//! | `sandbox_generate_chart` | 从 CSV 数据生成图表规格 |

use serde::{Deserialize, Serialize};
use tracing::info;

use ydsz_work::datasandbox::{
    DataSandbox, TransformOp, CsvAnalysis, JsonAnalysis, ColumnStats, ColumnType,
    TransformResult, ChartSpec, ChartData, ChartType, ChartSeries, ChartPoint,
};

// --- DTO 类型（带 specta::Type）---

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ColumnStatsDto {
    pub name: String,
    pub column_type: String,
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

impl From<ColumnStats> for ColumnStatsDto {
    fn from(c: ColumnStats) -> Self {
        Self {
            name: c.name,
            column_type: match c.column_type {
                ColumnType::Integer => "integer",
                ColumnType::Float => "float",
                ColumnType::String => "string",
                ColumnType::Boolean => "boolean",
                ColumnType::Date => "date",
                ColumnType::Null => "null",
            }.to_string(),
            count: c.count,
            null_count: c.null_count,
            unique_count: c.unique_count,
            min: c.min,
            max: c.max,
            mean: c.mean,
            median: c.median,
            std_dev: c.std_dev,
            mode: c.mode,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CsvAnalysisDto {
    pub source: String,
    pub row_count: usize,
    pub column_count: usize,
    pub columns: Vec<ColumnStatsDto>,
    pub preview: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct JsonAnalysisDto {
    pub source: String,
    pub root_type: String,
    pub array_length: Option<usize>,
    pub columns: Vec<ColumnStatsDto>,
    pub preview: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum TransformOpDto {
    Filter { column: String, operator: String, value: String },
    Sort { column: String, descending: bool },
    Aggregate { group_by: String, agg_column: String, agg_func: String },
    Select { columns: Vec<String> },
    Limit { count: usize },
}

impl From<TransformOpDto> for TransformOp {
    fn from(dto: TransformOpDto) -> Self {
        match dto {
            TransformOpDto::Filter { column, operator, value } => Self::Filter { column, operator, value },
            TransformOpDto::Sort { column, descending } => Self::Sort { column, descending },
            TransformOpDto::Aggregate { group_by, agg_column, agg_func } => Self::Aggregate { group_by, agg_column, agg_func },
            TransformOpDto::Select { columns } => Self::Select { columns },
            TransformOpDto::Limit { count } => Self::Limit { count },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TransformResultDto {
    pub row_count: usize,
    pub rows: Vec<serde_json::Value>,
}

// --- 图表生成 DTO ---

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChartTypeDto {
    pub chart_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChartPointDto {
    pub x: String,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChartSeriesDto {
    pub name: String,
    pub points: Vec<ChartPointDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChartDataDto {
    pub chart_type: String,
    pub title: String,
    pub x_label: String,
    pub y_label: String,
    pub series: Vec<ChartSeriesDto>,
    pub categories: Vec<String>,
    pub y_max: f64,
    pub y_min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChartSpecDto {
    pub chart_type: String,
    pub title: String,
    pub x_column: String,
    pub y_column: String,
    pub group_column: Option<String>,
    pub agg_func: Option<String>,
}

impl TryFrom<ChartSpecDto> for ChartSpec {
    type Error = String;

    fn try_from(dto: ChartSpecDto) -> Result<Self, String> {
        let chart_type = match dto.chart_type.as_str() {
            "bar" => ChartType::Bar,
            "line" => ChartType::Line,
            "pie" => ChartType::Pie,
            "scatter" => ChartType::Scatter,
            "area" => ChartType::Area,
            _ => return Err(format!("不支持的图表类型: {}", dto.chart_type)),
        };
        Ok(Self {
            chart_type,
            title: dto.title,
            x_column: dto.x_column,
            y_column: dto.y_column,
            group_column: dto.group_column,
            agg_func: dto.agg_func,
            data: ChartData { series: vec![] },
            x_label: None,
            y_label: None,
            categories: vec![],
            y_min: None,
            y_max: None,
        })
    }
}

impl From<ChartSpec> for ChartDataDto {
    fn from(c: ChartSpec) -> Self {
        Self {
            chart_type: match c.chart_type {
                ChartType::Bar => "bar",
                ChartType::Line => "line",
                ChartType::Pie => "pie",
                ChartType::Scatter => "scatter",
                ChartType::Area => "area",
            }.to_string(),
            title: c.title,
            x_label: c.x_label.unwrap_or_default(),
            y_label: c.y_label.unwrap_or_default(),
            series: c.data.series.into_iter().map(Into::into).collect(),
            categories: c.categories,
            y_max: c.y_max.unwrap_or_default(),
            y_min: c.y_min.unwrap_or_default(),
        }
    }
}

impl From<ChartSeries> for ChartSeriesDto {
    fn from(s: ChartSeries) -> Self {
        Self {
            name: s.name,
            points: s.points.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<ChartPoint> for ChartPointDto {
    fn from(p: ChartPoint) -> Self {
        Self {
            x: p.x,
            y: p.y,
        }
    }
}

/// 分析 CSV 文件
#[tauri::command]
#[specta::specta]
pub async fn sandbox_analyze_csv(path: String) -> Result<CsvAnalysisDto, String> {
    info!(path = %path, "分析 CSV 文件");
    let analysis = DataSandbox::analyze_csv(&path).map_err(|e| e.to_string())?;
    Ok(convert_csv_analysis(analysis))
}

/// 分析 CSV 内容字符串
#[tauri::command]
#[specta::specta]
pub async fn sandbox_analyze_csv_content(content: String) -> Result<CsvAnalysisDto, String> {
    info!(len = content.len(), "分析 CSV 内容");
    let analysis = DataSandbox::analyze_csv_content(&content, "inline").map_err(|e| e.to_string())?;
    Ok(convert_csv_analysis(analysis))
}

/// 分析 JSON 数据
#[tauri::command]
#[specta::specta]
pub async fn sandbox_analyze_json(json: String) -> Result<JsonAnalysisDto, String> {
    info!(len = json.len(), "分析 JSON 数据");
    let analysis = DataSandbox::analyze_json(&json, "inline").map_err(|e| e.to_string())?;
    Ok(convert_json_analysis(analysis))
}

/// 对 CSV 数据执行转换
#[tauri::command]
#[specta::specta]
pub async fn sandbox_transform_csv(
    content: String,
    ops: Vec<TransformOpDto>,
) -> Result<TransformResultDto, String> {
    info!(ops = ops.len(), "转换 CSV 数据");
    let ops: Vec<TransformOp> = ops.into_iter().map(Into::into).collect();
    let result = DataSandbox::transform_csv(&content, &ops, "inline").map_err(|e| e.to_string())?;
    Ok(TransformResultDto {
        row_count: result.row_count,
        rows: result.rows.into_iter().map(|m| serde_json::to_value(m).unwrap_or_default()).collect(),
    })
}

/// 从 CSV 数据生成图表
#[tauri::command]
#[specta::specta]
pub async fn sandbox_generate_chart(
    content: String,
    spec: ChartSpecDto,
) -> Result<ChartDataDto, String> {
    info!(chart_type = %spec.chart_type, "生成图表");
    let chart_spec: ChartSpec = spec.try_into()?;
    let result = DataSandbox::generate_chart(
        &content,
        chart_spec.chart_type,
        &chart_spec.x_column,
        &chart_spec.y_column,
        chart_spec.group_column.as_deref(),
        chart_spec.agg_func.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(result.into())
}

fn convert_csv_analysis(a: CsvAnalysis) -> CsvAnalysisDto {
    CsvAnalysisDto {
        source: a.source,
        row_count: a.row_count,
        column_count: a.column_count,
        columns: a.columns.into_iter().map(Into::into).collect(),
        preview: a.preview.into_iter().map(|m| serde_json::to_value(m).unwrap_or_default()).collect(),
    }
}

fn convert_json_analysis(a: JsonAnalysis) -> JsonAnalysisDto {
    JsonAnalysisDto {
        source: a.source,
        root_type: a.root_type,
        array_length: a.array_length,
        columns: a.columns.into_iter().map(Into::into).collect(),
        preview: a.preview,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_op_conversion() {
        let dto = TransformOpDto::Limit { count: 10 };
        let op: TransformOp = dto.into();
        match op {
            TransformOp::Limit { count } => assert_eq!(count, 10),
            _ => panic!("wrong variant"),
        }
    }
}
