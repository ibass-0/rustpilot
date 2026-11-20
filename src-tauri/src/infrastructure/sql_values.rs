//! Turns the text a server sends for a value into a `CellValue`. Server
//! queries run in the text protocol, so every value arrives as text and the
//! column type says how to read it.

use crate::domain::sql::{CellValue, clip_text, integer_cell};

const INTEGERS: &[&str] = &[
    "int", "int1", "int2", "int4", "int8", "integer", "smallint", "bigint", "tinyint", "mediumint", "year", "serial",
    "smallserial", "bigserial", "oid",
];
const FLOATS: &[&str] = &["float", "float4", "float8", "real", "double", "double precision"];
const BINARIES: &[&str] = &["bytea", "blob", "tinyblob", "mediumblob", "longblob", "binary", "varbinary"];

/// `text` is `None` for SQL `NULL`. `type_name` is the column type as the driver reports it.
pub fn cell_from_text(type_name: &str, text: Option<&[u8]>) -> CellValue {
    let Some(bytes) = text else {
        return CellValue::Null;
    };
    let lower = type_name.to_ascii_lowercase();
    let kind = lower.strip_suffix(" unsigned").unwrap_or(&lower);
    if kind.ends_with("[]") {
        return as_text(bytes);
    }
    if BINARIES.contains(&kind) {
        return binary(kind, bytes);
    }
    let as_str = || std::str::from_utf8(bytes).ok().map(str::trim);
    if INTEGERS.contains(&kind) {
        if let Some(n) = as_str().and_then(|s| s.parse::<i64>().ok()) {
            return integer_cell(n);
        }
    } else if FLOATS.contains(&kind) {
        if let Some(n) = as_str().and_then(|s| s.parse::<f64>().ok()).filter(|n| n.is_finite()) {
            return CellValue::Number(n);
        }
    } else if kind == "bool" || kind == "boolean" {
        match as_str() {
            Some("t" | "true" | "1") => return CellValue::Bool(true),
            Some("f" | "false" | "0") => return CellValue::Bool(false),
            _ => {}
        }
    }
    as_text(bytes)
}

fn as_text(bytes: &[u8]) -> CellValue {
    clip_text(String::from_utf8_lossy(bytes).into_owned())
}

/// PostgreSQL prints `bytea` as a backslash, `x` and hex digits. Other engines send the raw bytes,
/// and MariaDB reports JSON and case-sensitive text columns as BLOB, so bytes that read as plain
/// text (valid UTF-8 without control characters) are shown as text.
fn binary(kind: &str, bytes: &[u8]) -> CellValue {
    if kind == "bytea" {
        let size = bytes.strip_prefix(b"\\x").map_or(bytes.len(), |hex| hex.len() / 2);
        return CellValue::Text(format!("<binary {size} bytes>"));
    }
    match std::str::from_utf8(bytes) {
        Ok(text) if !text.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t')) => as_text(bytes),
        _ => CellValue::Text(format!("<binary {} bytes>", bytes.len())),
    }
}
