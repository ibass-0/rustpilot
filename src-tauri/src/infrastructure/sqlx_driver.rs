//! SQLite through `sqlx`. One connection per data source: its raw handle is
//! kept so `interrupt` can stop a statement that is already running inside the
//! engine, which dropping the Rust future alone cannot do.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use futures::StreamExt;
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection, SqliteRow};
use sqlx::{Column, Connection, Either, Executor, Row, TypeInfo};

use crate::domain::data_source::{DataNode, DataSourceConfig, EngineKind, NodeKind, Secret};
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::{DataSourceConnection, DataSourceDriver};
use crate::infrastructure::server_source::ServerSource;
use crate::domain::sql::{CellValue, MAX_ROWS, SqlColumn, SqlResult, clip_text, integer_cell};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

pub struct SqlxDriver;

#[async_trait]
impl DataSourceDriver for SqlxDriver {
    async fn connect(&self, config: &DataSourceConfig, password: Option<&Secret>) -> Result<Box<dyn DataSourceConnection>, AppError> {
        config.validate()?;
        match config.engine {
            EngineKind::Sqlite => {
                let path = config.file_path.as_deref().unwrap_or_default();
                Ok(Box::new(SqliteSource::open(path, config.read_only).await?))
            }
            EngineKind::Postgres | EngineKind::Mysql | EngineKind::Mariadb => {
                Ok(Box::new(ServerSource::connect(config, password).await?))
            }
            _ => Err(AppError::new(ErrorKind::InvalidConfig, "This engine is not supported yet.")),
        }
    }
}

struct SqliteSource {
    conn: tokio::sync::Mutex<Option<SqliteConnection>>,
    /// The `sqlite3*` of `conn` as an integer, or 0 once the connection is closed.
    raw: Mutex<usize>,
}

fn map_error(err: sqlx::Error) -> AppError {
    match err {
        sqlx::Error::Database(db) => AppError::new(ErrorKind::Query, db.message().to_string()),
        sqlx::Error::Io(io) => AppError::from(io),
        other => AppError::new(ErrorKind::Query, other.to_string()),
    }
}

fn not_connected() -> AppError {
    AppError::new(ErrorKind::Connection, "Not connected.")
}

fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

impl SqliteSource {
    async fn open(path: &str, read_only: bool) -> Result<Self, AppError> {
        if !Path::new(path).is_file() {
            return Err(AppError::new(ErrorKind::NotFound, format!("File not found: {path}")));
        }
        let options = SqliteConnectOptions::new().filename(path).read_only(read_only).create_if_missing(false);
        let mut conn = tokio::time::timeout(CONNECT_TIMEOUT, SqliteConnection::connect_with(&options))
            .await
            .map_err(|_| AppError::new(ErrorKind::Connection, "Connecting timed out after 10 seconds."))?
            .map_err(|e| AppError::new(ErrorKind::Connection, e.to_string()))?;
        let raw = conn
            .lock_handle()
            .await
            .map_err(|e| AppError::new(ErrorKind::Connection, e.to_string()))?
            .as_raw_handle()
            .as_ptr() as usize;
        Ok(Self { conn: tokio::sync::Mutex::new(Some(conn)), raw: Mutex::new(raw) })
    }
}

fn cell(row: &SqliteRow, index: usize) -> CellValue {
    use sqlx::ValueRef;
    match row.try_get_raw(index) {
        Ok(raw) if !raw.is_null() => {}
        _ => return CellValue::Null,
    }
    if let Ok(v) = row.try_get::<i64, _>(index) {
        return integer_cell(v);
    }
    if let Ok(v) = row.try_get::<f64, _>(index) {
        return CellValue::Number(v);
    }
    if let Ok(v) = row.try_get::<String, _>(index) {
        return clip_text(v);
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(index) {
        return CellValue::Text(format!("<binary {} bytes>", v.len()));
    }
    CellValue::Null
}

fn columns_of(row: &SqliteRow) -> Vec<SqlColumn> {
    row.columns()
        .iter()
        .map(|c| SqlColumn { name: c.name().to_string(), type_name: c.type_info().name().to_string() })
        .collect()
}

#[async_trait]
impl DataSourceConnection for SqliteSource {
    async fn children(&self, path: &[String]) -> Result<Vec<DataNode>, AppError> {
        let mut guard = self.conn.lock().await;
        let conn = guard.as_mut().ok_or_else(not_connected)?;
        let node = |path: Vec<String>, label: String, kind, detail, has_children| DataNode {
            path,
            label,
            kind,
            detail,
            has_children,
        };
        match path {
            [] => {
                let rows = sqlx::query("PRAGMA database_list").fetch_all(&mut *conn).await.map_err(map_error)?;
                Ok(rows
                    .iter()
                    .map(|row| {
                        let name: String = row.get(1);
                        node(vec![name.clone()], name, NodeKind::Schema, None, true)
                    })
                    .collect())
            }
            [schema] => Ok(vec![
                node(vec![schema.clone(), "tables".into()], "Tables".into(), NodeKind::Folder, None, true),
                node(vec![schema.clone(), "views".into()], "Views".into(), NodeKind::Folder, None, true),
            ]),
            [schema, folder] if folder == "tables" || folder == "views" => {
                let kind = if folder == "tables" { ("table", NodeKind::Table) } else { ("view", NodeKind::View) };
                let sql = format!(
                    "SELECT name FROM {}.sqlite_master WHERE type = ? AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name",
                    quote(schema)
                );
                let rows = sqlx::query(&sql).bind(kind.0).fetch_all(&mut *conn).await.map_err(map_error)?;
                Ok(rows
                    .iter()
                    .map(|row| {
                        let name: String = row.get(0);
                        node(vec![schema.clone(), folder.clone(), name.clone()], name, kind.1, None, true)
                    })
                    .collect())
            }
            [schema, folder, table] if folder == "tables" || folder == "views" => {
                let rows = sqlx::query("SELECT name, type, \"notnull\", pk FROM pragma_table_info(?, ?)")
                    .bind(table)
                    .bind(schema)
                    .fetch_all(&mut *conn)
                    .await
                    .map_err(map_error)?;
                Ok(rows
                    .iter()
                    .map(|row| {
                        let name: String = row.get(0);
                        let type_name: String = row.get(1);
                        let not_null: i64 = row.get(2);
                        let pk: i64 = row.get(3);
                        let mut parts = Vec::new();
                        if !type_name.is_empty() {
                            parts.push(type_name.to_uppercase());
                        }
                        if pk > 0 {
                            parts.push("PK".to_string());
                        } else if not_null != 0 {
                            parts.push("NOT NULL".to_string());
                        }
                        let detail = (!parts.is_empty()).then(|| parts.join(", "));
                        let mut p = path.to_vec();
                        p.push(name.clone());
                        node(p, name, NodeKind::Column, detail, false)
                    })
                    .collect())
            }
            _ => Ok(Vec::new()),
        }
    }

    async fn execute(&self, sql: &str) -> Result<SqlResult, AppError> {
        let mut guard = self.conn.lock().await;
        let conn = guard.as_mut().ok_or_else(not_connected)?;
        let started = Instant::now();

        let mut columns: Vec<SqlColumn> = Vec::new();
        let mut rows: Vec<Vec<CellValue>> = Vec::new();
        let mut truncated = false;
        let mut affected: u64 = 0;
        {
            #[allow(deprecated)]
            let mut stream = sqlx::query(sql).persistent(false).fetch_many(&mut *conn);
            while let Some(item) = stream.next().await {
                match item.map_err(map_error)? {
                    Either::Left(done) => affected += done.rows_affected(),
                    Either::Right(row) => {
                        if rows.len() == MAX_ROWS {
                            truncated = true;
                            break;
                        }
                        if columns.is_empty() {
                            columns = columns_of(&row);
                        }
                        rows.push((0..row.len()).map(|i| cell(&row, i)).collect());
                    }
                }
            }
        }
        // A query that matched no rows still has column headers.
        if columns.is_empty() && rows.is_empty() {
            if let Ok(described) = (&mut *conn).describe(sql).await {
                columns = described
                    .columns()
                    .iter()
                    .map(|c| SqlColumn { name: c.name().to_string(), type_name: c.type_info().name().to_string() })
                    .collect();
            }
        }
        let rows_affected = if columns.is_empty() { Some(affected) } else { None };
        Ok(SqlResult { columns, rows, truncated, rows_affected, elapsed_ms: started.elapsed().as_millis() as u64 })
    }

    fn interrupt(&self) {
        let raw = self.raw.lock().unwrap_or_else(|p| p.into_inner());
        if *raw != 0 {
            // SAFETY: `raw` is zeroed, under this same lock, before the
            // connection is closed, so a non-zero value is a live handle.
            // `sqlite3_interrupt` may be called from any thread.
            unsafe { libsqlite3_sys::sqlite3_interrupt(*raw as *mut libsqlite3_sys::sqlite3) };
        }
    }

    async fn close(&self) {
        // Stop whatever is running so the connection lock is released.
        self.interrupt();
        let taken = self.conn.lock().await.take();
        *self.raw.lock().unwrap_or_else(|p| p.into_inner()) = 0;
        if let Some(conn) = taken {
            let _ = conn.close().await;
        }
    }
}
