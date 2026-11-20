use serde::Serialize;

pub const MAX_ROWS: usize = 500;
pub const MAX_CELL_CHARS: usize = 10_000;
/// Largest integer a JavaScript number holds exactly.
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum CellValue {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SqlColumn {
    pub name: String,
    pub type_name: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SqlResult {
    pub columns: Vec<SqlColumn>,
    pub rows: Vec<Vec<CellValue>>,
    pub truncated: bool,
    pub rows_affected: Option<u64>,
    pub elapsed_ms: u64,
}

/// Text longer than `MAX_CELL_CHARS` is cut and ends with `…`.
pub fn clip_text(text: String) -> CellValue {
    match text.char_indices().nth(MAX_CELL_CHARS) {
        None => CellValue::Text(text),
        Some((cut, _)) => CellValue::Text(format!("{}…", &text[..cut])),
    }
}

/// Integers outside JavaScript's safe range travel as text so no digit is lost.
pub fn integer_cell(value: i64) -> CellValue {
    if (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&value) {
        CellValue::Number(value as f64)
    } else {
        CellValue::Text(value.to_string())
    }
}
