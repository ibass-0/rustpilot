use rustpilot_lib::domain::sql::{CellValue, MAX_CELL_CHARS};
use rustpilot_lib::infrastructure::sql_values::cell_from_text;

fn cell(type_name: &str, text: &str) -> CellValue {
    cell_from_text(type_name, Some(text.as_bytes()))
}

fn text(s: &str) -> CellValue {
    CellValue::Text(s.into())
}

#[test]
fn null_is_null_for_every_type() {
    for ty in ["INT4", "TEXT", "BYTEA", "BOOL", "VARCHAR"] {
        assert_eq!(cell_from_text(ty, None), CellValue::Null);
    }
}

#[test]
fn integers_become_numbers() {
    for ty in ["INT2", "INT4", "INT8", "SMALLINT", "INT", "BIGINT", "TINYINT", "MEDIUMINT", "YEAR", "bigint"] {
        assert_eq!(cell(ty, "42"), CellValue::Number(42.0), "{ty}");
    }
    assert_eq!(cell("INT4", "-7"), CellValue::Number(-7.0));
}

#[test]
fn integers_beyond_javascript_precision_stay_text() {
    assert_eq!(cell("INT8", "9007199254740993"), text("9007199254740993"));
    assert_eq!(cell("BIGINT UNSIGNED", "18446744073709551615"), text("18446744073709551615"));
    assert_eq!(cell("BIGINT UNSIGNED", "12"), CellValue::Number(12.0));
}

#[test]
fn floats_become_numbers_unless_not_finite() {
    for ty in ["FLOAT4", "FLOAT8", "REAL", "DOUBLE", "FLOAT", "DOUBLE PRECISION"] {
        assert_eq!(cell(ty, "1.5"), CellValue::Number(1.5), "{ty}");
    }
    assert_eq!(cell("FLOAT8", "NaN"), text("NaN"));
    assert_eq!(cell("FLOAT8", "Infinity"), text("Infinity"));
    assert_eq!(cell("FLOAT8", "-Infinity"), text("-Infinity"));
}

#[test]
fn exact_decimals_stay_text_so_no_digit_is_lost() {
    assert_eq!(cell("NUMERIC", "12345678901234567890.123456789"), text("12345678901234567890.123456789"));
    assert_eq!(cell("DECIMAL", "10.50"), text("10.50"));
}

#[test]
fn booleans() {
    assert_eq!(cell("BOOL", "t"), CellValue::Bool(true));
    assert_eq!(cell("BOOL", "f"), CellValue::Bool(false));
    assert_eq!(cell("BOOLEAN", "1"), CellValue::Bool(true));
    assert_eq!(cell("BOOLEAN", "0"), CellValue::Bool(false));
    assert_eq!(cell("BOOLEAN", "true"), CellValue::Bool(true));
    assert_eq!(cell("BOOLEAN", "weird"), text("weird"));
}

#[test]
fn binary_shows_its_size() {
    assert_eq!(cell("BYTEA", "\\x010203"), text("<binary 3 bytes>"));
    assert_eq!(cell("BYTEA", "\\x"), text("<binary 0 bytes>"));
    for ty in ["BLOB", "TINYBLOB", "LONGBLOB", "BINARY", "VARBINARY"] {
        assert_eq!(cell_from_text(ty, Some(&[1, 2, 3, 4])), text("<binary 4 bytes>"), "{ty}");
    }
}

#[test]
fn everything_else_is_text() {
    assert_eq!(cell("TIMESTAMPTZ", "2024-05-01 10:00:00+00"), text("2024-05-01 10:00:00+00"));
    assert_eq!(cell("UUID", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"), text("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"));
    assert_eq!(cell("JSONB", "{\"a\": 1}"), text("{\"a\": 1}"));
    assert_eq!(cell("VARCHAR", "hello"), text("hello"));
    assert_eq!(cell("DATETIME", "2024-05-01 10:00:00"), text("2024-05-01 10:00:00"));
}

#[test]
fn arrays_stay_text_even_of_numbers() {
    assert_eq!(cell("INT4[]", "{1,2,3}"), text("{1,2,3}"));
}

#[test]
fn an_unparsable_number_falls_back_to_text() {
    assert_eq!(cell("INT4", "abc"), text("abc"));
    assert_eq!(cell("FLOAT8", "abc"), text("abc"));
}

#[test]
fn long_text_is_clipped() {
    let long = "a".repeat(MAX_CELL_CHARS + 5);
    match cell("TEXT", &long) {
        CellValue::Text(t) => {
            assert_eq!(t.chars().count(), MAX_CELL_CHARS + 1);
            assert!(t.ends_with('…'));
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn invalid_utf8_is_replaced_not_dropped() {
    assert_eq!(cell_from_text("TEXT", Some(&[b'a', 0xFF, b'b'])), text("a\u{FFFD}b"));
}

#[test]
fn readable_text_in_a_blob_column_stays_text() {
    // MariaDB reports JSON and case-sensitive text columns as BLOB.
    assert_eq!(cell("BLOB", "{\"a\": 1}"), text("{\"a\": 1}"));
    assert_eq!(cell("LONGBLOB", "line one\nline two\ttabbed"), text("line one\nline two\ttabbed"));
    assert_eq!(cell("BLOB", "caf\u{e9}"), text("caf\u{e9}"));
}

#[test]
fn real_binary_in_a_blob_column_is_still_binary() {
    assert_eq!(cell_from_text("BLOB", Some(&[0x00, 0x01, 0x02])), text("<binary 3 bytes>"));
    assert_eq!(cell_from_text("BLOB", Some(&[0xFF, 0xFE, 0xFD])), text("<binary 3 bytes>"));
    assert_eq!(cell_from_text("BLOB", Some(b"ab\x07cd")), text("<binary 5 bytes>"));
}

#[test]
fn postgres_bytea_is_always_binary() {
    assert_eq!(cell("BYTEA", r"\x68656c6c6f"), text("<binary 5 bytes>"));
}
