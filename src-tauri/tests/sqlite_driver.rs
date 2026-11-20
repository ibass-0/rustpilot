use std::path::Path;

use rustpilot_lib::domain::data_source::{DataSourceConfig, EngineKind, NodeKind};
use rustpilot_lib::domain::error::ErrorKind;
use rustpilot_lib::domain::ports::{DataSourceConnection, DataSourceDriver};
use rustpilot_lib::domain::sql::CellValue;
use rustpilot_lib::infrastructure::sqlx_driver::SqlxDriver;
use sqlx::Connection;
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};

async fn create_db(path: &Path, statements: &[&str]) {
    let options = SqliteConnectOptions::new().filename(path).create_if_missing(true);
    let mut conn = SqliteConnection::connect_with(&options).await.unwrap();
    for sql in statements {
        sqlx::query(sql).execute(&mut conn).await.unwrap();
    }
    conn.close().await.unwrap();
}

fn config(path: &Path, read_only: bool) -> DataSourceConfig {
    DataSourceConfig {
        id: "t1".into(),
        name: "test".into(),
        engine: EngineKind::Sqlite,
        file_path: Some(path.to_string_lossy().into_owned()),
        read_only,
        ..DataSourceConfig::default()
    }
}

async fn open(path: &Path) -> Box<dyn DataSourceConnection> {
    SqlxDriver.connect(&config(path, false), None).await.unwrap()
}

fn s(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|p| p.to_string()).collect()
}

#[tokio::test]
async fn lists_main_schema_then_folders_then_tables_then_columns() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(
        &path,
        &[
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, bio TEXT)",
            "CREATE TABLE zed (x INT)",
            "CREATE VIEW v_users AS SELECT id FROM users",
        ],
    )
    .await;
    let conn = open(&path).await;

    let schemas = conn.children(&[]).await.unwrap();
    assert_eq!(schemas.len(), 1);
    assert_eq!(schemas[0].label, "main");
    assert_eq!(schemas[0].kind, NodeKind::Schema);
    assert!(schemas[0].has_children);

    let folders = conn.children(&s(&["main"])).await.unwrap();
    assert_eq!(folders.iter().map(|n| n.label.as_str()).collect::<Vec<_>>(), ["Tables", "Views"]);
    assert_eq!(folders[0].path, s(&["main", "tables"]));

    let tables = conn.children(&s(&["main", "tables"])).await.unwrap();
    assert_eq!(tables.iter().map(|n| n.label.as_str()).collect::<Vec<_>>(), ["users", "zed"]);
    assert_eq!(tables[0].kind, NodeKind::Table);
    assert_eq!(tables[0].path, s(&["main", "tables", "users"]));
    assert!(tables[0].has_children);

    let views = conn.children(&s(&["main", "views"])).await.unwrap();
    assert_eq!(views.len(), 1);
    assert_eq!(views[0].kind, NodeKind::View);

    let columns = conn.children(&s(&["main", "tables", "users"])).await.unwrap();
    assert_eq!(columns.len(), 3);
    assert_eq!(columns[0].label, "id");
    assert_eq!(columns[0].detail.as_deref(), Some("INTEGER, PK"));
    assert_eq!(columns[1].detail.as_deref(), Some("TEXT, NOT NULL"));
    assert_eq!(columns[2].detail.as_deref(), Some("TEXT"));
    assert!(!columns[0].has_children);
    assert_eq!(columns[0].kind, NodeKind::Column);
}

#[tokio::test]
async fn table_names_with_quotes_are_handled() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &["CREATE TABLE \"we\"\"ird\" (a INT)"]).await;
    let conn = open(&path).await;
    let tables = conn.children(&s(&["main", "tables"])).await.unwrap();
    assert_eq!(tables[0].label, "we\"ird");
    let columns = conn.children(&tables[0].path).await.unwrap();
    assert_eq!(columns[0].label, "a");
}

#[tokio::test]
async fn select_returns_columns_and_typed_cells() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &[]).await;
    let conn = open(&path).await;
    let result = conn
        .execute("SELECT NULL AS n, 42 AS i, 9007199254740993 AS big, 1.5 AS r, 'hi' AS t, x'0102' AS b")
        .await
        .unwrap();
    let names: Vec<_> = result.columns.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["n", "i", "big", "r", "t", "b"]);
    assert_eq!(
        result.rows[0],
        vec![
            CellValue::Null,
            CellValue::Number(42.0),
            CellValue::Text("9007199254740993".into()),
            CellValue::Number(1.5),
            CellValue::Text("hi".into()),
            CellValue::Text("<binary 2 bytes>".into()),
        ]
    );
    assert!(!result.truncated);
    assert_eq!(result.rows_affected, None);
}

#[tokio::test]
async fn an_empty_select_still_has_columns() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &["CREATE TABLE t (a INT, b TEXT)"]).await;
    let conn = open(&path).await;
    let result = conn.execute("SELECT a, b FROM t").await.unwrap();
    assert!(result.rows.is_empty());
    assert_eq!(result.columns.len(), 2);
}

#[tokio::test]
async fn select_stops_at_500_rows() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &[]).await;
    let conn = open(&path).await;
    let result = conn
        .execute("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 1000) SELECT x FROM c")
        .await
        .unwrap();
    assert_eq!(result.rows.len(), 500);
    assert!(result.truncated);
}

#[tokio::test]
async fn insert_reports_rows_affected() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &["CREATE TABLE t (a INT)"]).await;
    let conn = open(&path).await;
    let result = conn.execute("INSERT INTO t VALUES (1), (2), (3)").await.unwrap();
    assert_eq!(result.rows_affected, Some(3));
    assert!(result.columns.is_empty());
}

#[tokio::test]
async fn syntax_error_is_a_query_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &[]).await;
    let conn = open(&path).await;
    let err = conn.execute("SELEC 1").await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Query);
    assert!(err.message.contains("syntax"));
}

#[tokio::test]
async fn missing_file_is_not_found_and_not_created() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("missing.db");
    let err = SqlxDriver.connect(&config(&path, false), None).await.err().unwrap();
    assert_eq!(err.kind, ErrorKind::NotFound);
    assert!(!path.exists());
}

#[tokio::test]
async fn read_only_connection_rejects_writes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &["CREATE TABLE t (a INT)"]).await;
    let conn = SqlxDriver.connect(&config(&path, true), None).await.unwrap();
    let err = conn.execute("INSERT INTO t VALUES (1)").await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Query);
}

#[tokio::test]
async fn interrupt_stops_a_statement_that_is_running_inside_the_engine() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    create_db(&path, &[]).await;
    let conn: std::sync::Arc<dyn DataSourceConnection> = open(&path).await.into();
    let running = {
        let conn = conn.clone();
        tokio::spawn(async move {
            conn.execute("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c").await
        })
    };
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    conn.interrupt();
    let outcome = tokio::time::timeout(std::time::Duration::from_secs(5), running).await;
    let result = outcome.expect("the query must stop after interrupt").unwrap();
    assert!(result.is_err());
    // The connection still works afterwards.
    assert_eq!(conn.execute("SELECT 1").await.unwrap().rows.len(), 1);
}
