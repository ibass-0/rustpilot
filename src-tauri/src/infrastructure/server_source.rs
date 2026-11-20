//! PostgreSQL, MySQL and MariaDB through `sqlx`.
//!
//! Each data source is a pool holding exactly one connection, so session state
//! (read-only mode, the id used to cancel) stays valid. A second, short-lived
//! connection carries the cancel request (`pg_cancel_backend` / `KILL QUERY`),
//! because a query already running on the server does not stop when the Rust
//! future is dropped. Queries use the text protocol, so every value arrives as
//! text and `sql_values` reads it by column type.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use futures::StreamExt;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions, MySqlRow, MySqlSslMode};
use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions, PgRow, PgSslMode};
use sqlx::{Column, Either, Executor, Row, TypeInfo, ValueRef};

use crate::domain::data_source::{DataNode, DataSourceConfig, EngineKind, NodeKind, Secret, SslMode, default_port};
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::DataSourceConnection;
use crate::domain::sql::{CellValue, MAX_ROWS, SqlColumn, SqlResult};
use crate::infrastructure::sql_values::cell_from_text;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Queries queue behind a long-running one on the single connection, so waiting for it is not an error.
const QUEUE_TIMEOUT: Duration = Duration::from_secs(3600);
const APPLICATION_NAME: &str = "RustPilot";

enum Db {
    Pg(PgPool),
    My(MySqlPool),
}

/// What the cancel request needs: how to reach the server and which session to stop.
/// The session id is refreshed whenever the pool opens a connection.
#[derive(Clone)]
enum Control {
    Pg { options: PgConnectOptions, pid: Arc<AtomicI32> },
    My { options: MySqlConnectOptions, id: Arc<AtomicU64> },
}

pub struct ServerSource {
    db: Db,
    control: Control,
    runtime: tokio::runtime::Handle,
    /// True from the moment a query is sent until it finishes. `interrupt` stops a query that is in flight.
    in_flight: Arc<AtomicBool>,
    read_only: bool,
    /// False after the connection was lost: the pool opens a new one, which needs `pg_setup` / `my_setup` again.
    ready: Arc<AtomicBool>,
}

// ---------- errors ----------

fn auth_code(code: Option<&str>) -> bool {
    matches!(code, Some("28P01" | "28000"))
}

/// An error while running SQL. Messages come from the server and never contain our password.
fn query_error(err: sqlx::Error) -> AppError {
    match err {
        sqlx::Error::Database(db) => {
            let kind = match db.code().as_deref() {
                Some("57014" | "70100") => ErrorKind::Cancelled,
                code if auth_code(code) => ErrorKind::Auth,
                _ => ErrorKind::Query,
            };
            AppError::new(kind, db.message().to_string())
        }
        sqlx::Error::Io(io) => AppError::new(ErrorKind::Connection, format!("The connection was lost: {io}")),
        other => AppError::new(ErrorKind::Query, other.to_string()),
    }
}

/// An error while opening the connection.
fn connect_error(err: sqlx::Error) -> AppError {
    match err {
        sqlx::Error::Database(db) if auth_code(db.code().as_deref()) => AppError::new(ErrorKind::Auth, db.message().to_string()),
        sqlx::Error::Database(db) => AppError::new(ErrorKind::Connection, db.message().to_string()),
        sqlx::Error::Io(io) => AppError::new(ErrorKind::Connection, format!("Could not reach the server: {io}")),
        // After a wrong password MariaDB on Windows offers another login method (GSSAPI) that we cannot use.
        sqlx::Error::Protocol(message) if message.contains("unknown authentication plugin") => {
            AppError::new(ErrorKind::Auth, "Authentication failed. Check the user and password.")
        }
        other => AppError::new(ErrorKind::Connection, other.to_string()),
    }
}

fn timed_out() -> AppError {
    AppError::new(ErrorKind::Connection, "Could not reach the server within 10 seconds.")
}

// ---------- connecting ----------

fn nonblank(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|v| !v.is_empty())
}

impl ServerSource {
    pub async fn connect(config: &DataSourceConfig, password: Option<&Secret>) -> Result<Self, AppError> {
        let host = nonblank(&config.host).ok_or_else(|| AppError::new(ErrorKind::InvalidConfig, "Enter a host."))?;
        let user = nonblank(&config.user).ok_or_else(|| AppError::new(ErrorKind::InvalidConfig, "Enter a user."))?;
        let port = config.port.or(default_port(config.engine)).unwrap_or(0);
        let password = password.map(Secret::expose).unwrap_or_default();
        let database = nonblank(&config.database);
        let read_only = config.read_only;
        let runtime = tokio::runtime::Handle::current();
        let in_flight = Arc::new(AtomicBool::new(false));

        match config.engine {
            EngineKind::Postgres => {
                let mut options = PgConnectOptions::new()
                    .host(host)
                    .port(port)
                    .username(user)
                    .password(password)
                    .application_name(APPLICATION_NAME)
                    .ssl_mode(match config.ssl_mode {
                        SslMode::Disable => PgSslMode::Disable,
                        SslMode::Prefer => PgSslMode::Prefer,
                        SslMode::Require => PgSslMode::Require,
                    });
                if let Some(database) = database {
                    options = options.database(database);
                }
                let pid = Arc::new(AtomicI32::new(0));
                let setup = async {
                    let pool = pg_pool(&options).await?;
                    pg_setup(&pool, &pid, read_only).await?;
                    Ok::<_, sqlx::Error>(pool)
                };
                let pool = tokio::time::timeout(CONNECT_TIMEOUT, setup).await.map_err(|_| timed_out())?.map_err(connect_error)?;
                Ok(Self { db: Db::Pg(pool), control: Control::Pg { options, pid }, runtime, in_flight, read_only, ready: Arc::new(AtomicBool::new(true)) })
            }
            EngineKind::Mysql | EngineKind::Mariadb => {
                let mut options = MySqlConnectOptions::new()
                    .host(host)
                    .port(port)
                    .username(user)
                    .password(password)
                    .charset("utf8mb4")
                    .ssl_mode(match config.ssl_mode {
                        SslMode::Disable => MySqlSslMode::Disabled,
                        SslMode::Prefer => MySqlSslMode::Preferred,
                        SslMode::Require => MySqlSslMode::Required,
                    });
                if let Some(database) = database {
                    options = options.database(database);
                }
                let id = Arc::new(AtomicU64::new(0));
                let setup = async {
                    let pool = my_pool(&options).await?;
                    my_setup(&pool, &id, read_only).await?;
                    Ok::<_, sqlx::Error>(pool)
                };
                let pool = tokio::time::timeout(CONNECT_TIMEOUT, setup).await.map_err(|_| timed_out())?.map_err(connect_error)?;
                Ok(Self { db: Db::My(pool), control: Control::My { options, id }, runtime, in_flight, read_only, ready: Arc::new(AtomicBool::new(true)) })
            }
            _ => Err(AppError::new(ErrorKind::InvalidConfig, "This engine is not supported yet.")),
        }
    }
}

/// A pool of exactly one connection that is never recycled behind our back.
async fn pg_pool(options: &PgConnectOptions) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(QUEUE_TIMEOUT)
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(options.clone())
        .await
}

async fn my_pool(options: &MySqlConnectOptions) -> Result<MySqlPool, sqlx::Error> {
    MySqlPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(QUEUE_TIMEOUT)
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(options.clone())
        .await
}

/// Learn the backend pid (for cancelling) and apply the read-only setting to the pool's connection.
async fn pg_setup(pool: &PgPool, pid: &AtomicI32, read_only: bool) -> Result<(), sqlx::Error> {
    let backend: i32 = sqlx::query_scalar("SELECT pg_backend_pid()").fetch_one(pool).await?;
    pid.store(backend, Ordering::SeqCst);
    if read_only {
        sqlx::raw_sql("SET default_transaction_read_only = on").execute(pool).await?;
    }
    Ok(())
}

/// Learn the connection id (for cancelling) and apply the read-only setting to the pool's connection.
async fn my_setup(pool: &MySqlPool, id: &AtomicU64, read_only: bool) -> Result<(), sqlx::Error> {
    let session: u64 = sqlx::query_scalar("SELECT CONNECTION_ID()").fetch_one(pool).await?;
    id.store(session, Ordering::SeqCst);
    if read_only {
        sqlx::raw_sql("SET SESSION TRANSACTION READ ONLY").execute(pool).await?;
    }
    Ok(())
}

async fn pg_cancel_session(options: PgConnectOptions, pid: i32) {
    if let Ok(pool) = pg_pool(&options).await {
        let _ = sqlx::query("SELECT pg_cancel_backend($1)").bind(pid).execute(&pool).await;
        pool.close().await;
    }
}

async fn my_kill_session(options: MySqlConnectOptions, id: u64) {
    if let Ok(pool) = my_pool(&options).await {
        let kill = format!("KILL QUERY {id}");
        let _ = sqlx::raw_sql(&kill).execute(&pool).await;
        pool.close().await;
    }
}

impl Control {
    /// Ask the server to stop the query the session is running. Failures are ignored: the query may just have ended.
    async fn cancel(self) {
        let _ = tokio::time::timeout(CONNECT_TIMEOUT, async move {
            match self {
                Control::Pg { options, pid } => pg_cancel_session(options, pid.load(Ordering::SeqCst)).await,
                Control::My { options, id } => my_kill_session(options, id.load(Ordering::SeqCst)).await,
            }
        })
        .await;
    }
}

// ---------- running queries ----------

#[derive(Default)]
struct Collector {
    columns: Vec<SqlColumn>,
    rows: Vec<Vec<CellValue>>,
    truncated: bool,
    affected: u64,
}

impl Collector {
    /// Returns `false` once the row limit is reached and no more rows are wanted.
    fn add(&mut self, columns: impl FnOnce() -> Vec<SqlColumn>, cells: impl FnOnce() -> Vec<CellValue>) -> bool {
        if self.rows.len() == MAX_ROWS {
            self.truncated = true;
            return false;
        }
        if self.columns.is_empty() {
            self.columns = columns();
        }
        self.rows.push(cells());
        true
    }
}

fn pg_cells(row: &PgRow) -> Vec<CellValue> {
    (0..row.len())
        .map(|i| {
            let type_name = row.column(i).type_info().name().to_string();
            match row.try_get_raw(i) {
                Ok(raw) if !raw.is_null() => cell_from_text(&type_name, raw.as_bytes().ok()),
                _ => CellValue::Null,
            }
        })
        .collect()
}

fn my_cells(row: &MySqlRow) -> Vec<CellValue> {
    (0..row.len())
        .map(|i| {
            let type_name = row.column(i).type_info().name().to_string();
            match row.try_get_raw(i) {
                Ok(raw) if !raw.is_null() => {
                    let bytes = row.try_get_unchecked::<Vec<u8>, _>(i).ok();
                    cell_from_text(&type_name, bytes.as_deref())
                }
                _ => CellValue::Null,
            }
        })
        .collect()
}

fn columns_of<R: Row>(row: &R) -> Vec<SqlColumn> {
    row.columns().iter().map(|c| SqlColumn { name: c.name().to_string(), type_name: c.type_info().name().to_string() }).collect()
}

async fn run_pg(pool: &PgPool, sql: String) -> Result<Collector, AppError> {
    let mut collected = Collector::default();
    {
        #[allow(deprecated)]
        let mut stream = sqlx::raw_sql(&sql).fetch_many(pool);
        while let Some(item) = stream.next().await {
            match item.map_err(query_error)? {
                Either::Left(done) => collected.affected += done.rows_affected(),
                Either::Right(row) => {
                    if !collected.add(|| columns_of(&row), || pg_cells(&row)) {
                        break;
                    }
                }
            }
        }
    }
    // A query that matched no rows still has column headers.
    if collected.columns.is_empty() && collected.rows.is_empty() {
        if let Ok(described) = pool.describe(&sql).await {
            collected.columns = described
                .columns()
                .iter()
                .map(|c| SqlColumn { name: c.name().to_string(), type_name: c.type_info().name().to_string() })
                .collect();
        }
    }
    Ok(collected)
}

async fn run_my(pool: &MySqlPool, sql: String) -> Result<Collector, AppError> {
    let mut collected = Collector::default();
    {
        #[allow(deprecated)]
        let mut stream = sqlx::raw_sql(&sql).fetch_many(pool);
        while let Some(item) = stream.next().await {
            match item.map_err(query_error)? {
                Either::Left(done) => collected.affected += done.rows_affected(),
                Either::Right(row) => {
                    if !collected.add(|| columns_of(&row), || my_cells(&row)) {
                        break;
                    }
                }
            }
        }
    }
    if collected.columns.is_empty() && collected.rows.is_empty() {
        if let Ok(described) = pool.describe(&sql).await {
            collected.columns = described
                .columns()
                .iter()
                .map(|c| SqlColumn { name: c.name().to_string(), type_name: c.type_info().name().to_string() })
                .collect();
        }
    }
    Ok(collected)
}

// ---------- the tree ----------

#[derive(Clone, Copy)]
enum Lookup {
    Schemas,
    Tables,
    Views,
    Columns,
}

/// The text of every column of every row, for the small metadata queries.
async fn lookup(db: &Db, what: Lookup, binds: &[&str]) -> Result<Vec<Vec<Option<String>>>, AppError> {
    macro_rules! fetch {
        ($pool:expr, $sql:expr, $width:expr) => {{
            let mut query = sqlx::query($sql);
            for bind in binds {
                query = query.bind(*bind);
            }
            let rows = query.fetch_all($pool).await.map_err(query_error)?;
            rows.iter()
                .map(|row| (0..$width).map(|i| row.try_get::<Option<String>, _>(i).ok().flatten()).collect())
                .collect()
        }};
    }
    Ok(match (db, what) {
        (Db::Pg(p), Lookup::Schemas) => fetch!(
            p,
            "SELECT nspname::text FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY nspname",
            1
        ),
        (Db::Pg(p), Lookup::Tables) => fetch!(
            p,
            "SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname::text = $1 AND c.relkind IN ('r', 'p', 'f') ORDER BY c.relname",
            1
        ),
        (Db::Pg(p), Lookup::Views) => fetch!(
            p,
            "SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname::text = $1 AND c.relkind IN ('v', 'm') ORDER BY c.relname",
            1
        ),
        (Db::Pg(p), Lookup::Columns) => fetch!(
            p,
            "SELECT a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod)::text, \
                    CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END, \
                    CASE WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary \
                                      AND a.attnum = ANY(i.indkey)) THEN 'PRI' ELSE '' END \
             FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname::text = $1 AND c.relname::text = $2 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum",
            4
        ),
        (Db::My(p), Lookup::Schemas) => fetch!(
            p,
            "SELECT CAST(SCHEMA_NAME AS CHAR) FROM information_schema.SCHEMATA \
             WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys') ORDER BY SCHEMA_NAME",
            1
        ),
        (Db::My(p), Lookup::Tables) => fetch!(
            p,
            "SELECT CAST(TABLE_NAME AS CHAR) FROM information_schema.TABLES \
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE IN ('BASE TABLE', 'SYSTEM VERSIONED') ORDER BY TABLE_NAME",
            1
        ),
        (Db::My(p), Lookup::Views) => fetch!(
            p,
            "SELECT CAST(TABLE_NAME AS CHAR) FROM information_schema.TABLES \
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW' ORDER BY TABLE_NAME",
            1
        ),
        (Db::My(p), Lookup::Columns) => fetch!(
            p,
            "SELECT CAST(COLUMN_NAME AS CHAR), CAST(COLUMN_TYPE AS CHAR), CAST(IS_NULLABLE AS CHAR), CAST(COLUMN_KEY AS CHAR) \
             FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
            4
        ),
    })
}

fn node(path: Vec<String>, label: String, kind: NodeKind, detail: Option<String>, has_children: bool) -> DataNode {
    DataNode { path, label, kind, detail, has_children }
}

impl ServerSource {
    /// After a lost connection the pool has opened a new one; give it the same session setup as the first.
    async fn ensure_session(&self) -> Result<(), AppError> {
        if self.ready.load(Ordering::SeqCst) {
            return Ok(());
        }
        match (&self.db, &self.control) {
            (Db::Pg(pool), Control::Pg { pid, .. }) => pg_setup(pool, pid, self.read_only).await.map_err(connect_error)?,
            (Db::My(pool), Control::My { id, .. }) => my_setup(pool, id, self.read_only).await.map_err(connect_error)?,
            _ => {}
        }
        self.ready.store(true, Ordering::SeqCst);
        Ok(())
    }

    /// A lost connection means the next query needs `ensure_session`.
    fn note_connection<T>(&self, result: Result<T, AppError>) -> Result<T, AppError> {
        if matches!(&result, Err(e) if e.kind == ErrorKind::Connection) {
            self.ready.store(false, Ordering::SeqCst);
        }
        result
    }
}

#[async_trait::async_trait]
impl DataSourceConnection for ServerSource {
    async fn children(&self, path: &[String]) -> Result<Vec<DataNode>, AppError> {
        self.ensure_session().await?;
        match path {
            [] => Ok(lookup(&self.db, Lookup::Schemas, &[])
                .await?
                .into_iter()
                .filter_map(|row| row.into_iter().next().flatten())
                .map(|name| node(vec![name.clone()], name, NodeKind::Schema, None, true))
                .collect()),
            [schema] => Ok(vec![
                node(vec![schema.clone(), "tables".into()], "Tables".into(), NodeKind::Folder, None, true),
                node(vec![schema.clone(), "views".into()], "Views".into(), NodeKind::Folder, None, true),
            ]),
            [schema, folder] if folder == "tables" || folder == "views" => {
                let (what, kind) = if folder == "tables" { (Lookup::Tables, NodeKind::Table) } else { (Lookup::Views, NodeKind::View) };
                Ok(lookup(&self.db, what, &[schema])
                    .await?
                    .into_iter()
                    .filter_map(|row| row.into_iter().next().flatten())
                    .map(|name| node(vec![schema.clone(), folder.clone(), name.clone()], name, kind, None, true))
                    .collect())
            }
            [schema, folder, table] if folder == "tables" || folder == "views" => Ok(lookup(&self.db, Lookup::Columns, &[schema, table])
                .await?
                .into_iter()
                .filter_map(|row| {
                    let mut cells = row.into_iter();
                    let name = cells.next().flatten()?;
                    let type_name = cells.next().flatten().unwrap_or_default();
                    let nullable = cells.next().flatten().unwrap_or_default();
                    let key = cells.next().flatten().unwrap_or_default();
                    let mut parts = Vec::new();
                    if !type_name.is_empty() {
                        parts.push(type_name.to_uppercase());
                    }
                    if key == "PRI" {
                        parts.push("PK".to_string());
                    } else if nullable == "NO" {
                        parts.push("NOT NULL".to_string());
                    }
                    let detail = (!parts.is_empty()).then(|| parts.join(", "));
                    let mut p = path.to_vec();
                    p.push(name.clone());
                    Some(node(p, name, NodeKind::Column, detail, false))
                })
                .collect()),
            _ => Ok(Vec::new()),
        }
    }

    async fn execute(&self, sql: &str) -> Result<SqlResult, AppError> {
        self.ensure_session().await?;
        let started = Instant::now();
        let sql = sql.to_string();
        self.in_flight.store(true, Ordering::SeqCst);
        let collected = match &self.db {
            Db::Pg(pool) => run_pg(pool, sql).await,
            Db::My(pool) => run_my(pool, sql).await,
        };
        // A dropped future never reaches this line: the query stays in flight and `interrupt` stops it.
        self.in_flight.store(false, Ordering::SeqCst);
        let collected = self.note_connection(collected)?;
        if collected.truncated {
            // Rows are still streaming from the server; stop them so the connection is free for the next query.
            self.control.clone().cancel().await;
        }
        let rows_affected = collected.columns.is_empty().then_some(collected.affected);
        Ok(SqlResult {
            columns: collected.columns,
            rows: collected.rows,
            truncated: collected.truncated,
            rows_affected,
            elapsed_ms: started.elapsed().as_millis() as u64,
        })
    }

    fn interrupt(&self) {
        if self.in_flight.swap(false, Ordering::SeqCst) {
            self.runtime.spawn(self.control.clone().cancel());
        }
    }

    async fn close(&self) {
        self.interrupt();
        match &self.db {
            Db::Pg(pool) => pool.close().await,
            Db::My(pool) => pool.close().await,
        }
    }
}
