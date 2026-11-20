//! Runs against real servers. Each engine is tested only when its env var holds a
//! connection URL, otherwise the test prints SKIPPED and passes:
//!
//!   RUSTPILOT_TEST_PG      postgres://user:password@host:port/database
//!   RUSTPILOT_TEST_MYSQL   mysql://user:password@host:port/database
//!   RUSTPILOT_TEST_MARIADB mysql://user:password@host:port/database

use std::time::{Duration, Instant};

use rustpilot_lib::domain::data_source::{DataNode, DataSourceConfig, EngineKind, NodeKind, Secret};
use rustpilot_lib::domain::error::ErrorKind;
use rustpilot_lib::domain::ports::{DataSourceConnection, DataSourceDriver};
use rustpilot_lib::domain::sql::{CellValue, SqlResult};
use rustpilot_lib::infrastructure::sqlx_driver::SqlxDriver;

#[derive(Clone, Copy)]
struct Engine {
    kind: EngineKind,
    env: &'static str,
}

const PG: Engine = Engine { kind: EngineKind::Postgres, env: "RUSTPILOT_TEST_PG" };
const MYSQL: Engine = Engine { kind: EngineKind::Mysql, env: "RUSTPILOT_TEST_MYSQL" };
const MARIADB: Engine = Engine { kind: EngineKind::Mariadb, env: "RUSTPILOT_TEST_MARIADB" };

impl Engine {
    fn is_pg(self) -> bool {
        self.kind == EngineKind::Postgres
    }

    /// The configured server, or `None` (after saying so) when the env var is not set.
    fn server(self) -> Option<(DataSourceConfig, Secret)> {
        let Ok(url) = std::env::var(self.env) else {
            eprintln!("SKIPPED: {} is not set", self.env);
            return None;
        };
        let rest = url.split_once("://").expect("a URL").1;
        let (credentials, location) = rest.rsplit_once('@').expect("user:password@host");
        let (user, password) = credentials.split_once(':').expect("user:password");
        let (host_port, database) = location.split_once('/').unwrap_or((location, ""));
        let (host, port) = host_port.split_once(':').expect("host:port");
        let config = DataSourceConfig {
            id: "srv-test".into(),
            name: "test".into(),
            engine: self.kind,
            host: Some(host.into()),
            port: Some(port.parse().expect("a port")),
            database: (!database.is_empty()).then(|| database.to_string()),
            user: Some(user.into()),
            ..DataSourceConfig::default()
        };
        Some((config, Secret::new(password)))
    }

    fn quote(self, name: &str) -> String {
        if self.is_pg() { format!("\"{}\"", name.replace('"', "\"\"")) } else { format!("`{}`", name.replace('`', "``")) }
    }

    fn create_schema(self, name: &str) -> String {
        if self.is_pg() { format!("CREATE SCHEMA {}", self.quote(name)) } else { format!("CREATE DATABASE {}", self.quote(name)) }
    }

    fn drop_schema(self, name: &str) -> String {
        if self.is_pg() {
            format!("DROP SCHEMA IF EXISTS {} CASCADE", self.quote(name))
        } else {
            format!("DROP DATABASE IF EXISTS {}", self.quote(name))
        }
    }

    fn table(self, schema: &str, table: &str) -> String {
        format!("{}.{}", self.quote(schema), self.quote(table))
    }

    fn sleep_forever(self) -> &'static str {
        if self.is_pg() { "SELECT pg_sleep(60)" } else { "SELECT SLEEP(60)" }
    }

    fn thousand_rows(self) -> &'static str {
        if self.is_pg() {
            "SELECT g FROM generate_series(1, 1000) g"
        } else {
            "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 1000) SELECT x FROM c"
        }
    }

    fn session_id_sql(self) -> &'static str {
        if self.is_pg() { "SELECT pg_backend_pid()" } else { "SELECT CONNECTION_ID()" }
    }

    fn session_exists_sql(self, id: i64) -> String {
        if self.is_pg() {
            format!("SELECT count(*) FROM pg_stat_activity WHERE pid = {id}")
        } else {
            format!("SELECT count(*) FROM information_schema.processlist WHERE id = {id}")
        }
    }
}

async fn connect(config: &DataSourceConfig, password: &Secret) -> Box<dyn DataSourceConnection> {
    SqlxDriver.connect(config, Some(password)).await.expect("connect")
}

/// A scratch schema that is dropped again, plus a connection into the server.
struct Fixture {
    engine: Engine,
    conn: Box<dyn DataSourceConnection>,
    schema: String,
}

impl Fixture {
    async fn new(engine: Engine, name: &str) -> Option<Self> {
        let (config, password) = engine.server()?;
        let conn = connect(&config, &password).await;
        let schema = format!("rp_{name}_{}", std::process::id());
        conn.execute(&engine.drop_schema(&schema)).await.expect("drop leftovers");
        conn.execute(&engine.create_schema(&schema)).await.expect("create schema");
        Some(Self { engine, conn, schema })
    }

    fn table(&self, name: &str) -> String {
        self.engine.table(&self.schema, name)
    }

    async fn finish(self) {
        let _ = self.conn.execute(&self.engine.drop_schema(&self.schema)).await;
        self.conn.close().await;
    }
}

fn labels(nodes: &[DataNode]) -> Vec<&str> {
    nodes.iter().map(|n| n.label.as_str()).collect()
}

fn text(s: &str) -> CellValue {
    CellValue::Text(s.into())
}

fn first_number(result: &SqlResult) -> f64 {
    match &result.rows[0][0] {
        CellValue::Number(n) => *n,
        other => panic!("expected a number, got {other:?}"),
    }
}

// ---------- the tree ----------

async fn lists_schemas_without_system_ones(engine: Engine) {
    let Some(f) = Fixture::new(engine, "tree").await else { return };
    let schemas = f.conn.children(&[]).await.unwrap();
    let names = labels(&schemas);
    assert!(names.contains(&f.schema.as_str()), "{names:?}");
    for system in ["information_schema", "pg_catalog", "pg_toast", "performance_schema", "sys", "mysql"] {
        assert!(!names.contains(&system), "{system} should be hidden: {names:?}");
    }
    assert!(schemas.iter().all(|n| n.kind == NodeKind::Schema && n.has_children));
    f.finish().await;
}

async fn browses_tables_views_and_columns(engine: Engine) {
    let Some(f) = Fixture::new(engine, "browse").await else { return };
    let weird = if engine.is_pg() { "we\"ird" } else { "we`ird" };
    f.conn
        .execute(&format!("CREATE TABLE {} (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL, bio TEXT)", f.table("users")))
        .await
        .unwrap();
    f.conn.execute(&format!("CREATE TABLE {} (a INT)", f.table(weird))).await.unwrap();
    f.conn.execute(&format!("CREATE VIEW {} AS SELECT id FROM {}", f.table("v_users"), f.table("users"))).await.unwrap();

    let folders = f.conn.children(&[f.schema.clone()]).await.unwrap();
    assert_eq!(labels(&folders), ["Tables", "Views"]);
    assert_eq!(folders[0].path, vec![f.schema.clone(), "tables".to_string()]);

    let tables = f.conn.children(&[f.schema.clone(), "tables".into()]).await.unwrap();
    let mut names: Vec<_> = labels(&tables).into_iter().map(String::from).collect();
    names.sort();
    let mut expected = vec![weird.to_string(), "users".to_string()];
    expected.sort();
    assert_eq!(names, expected);
    assert!(tables.iter().all(|n| n.kind == NodeKind::Table && n.has_children));

    let views = f.conn.children(&[f.schema.clone(), "views".into()]).await.unwrap();
    assert_eq!(labels(&views), ["v_users"]);
    assert_eq!(views[0].kind, NodeKind::View);

    let users = tables.iter().find(|n| n.label == "users").unwrap();
    let columns = f.conn.children(&users.path).await.unwrap();
    assert_eq!(labels(&columns), ["id", "name", "bio"]);
    assert!(columns[0].detail.as_deref().unwrap().ends_with("PK"), "{:?}", columns[0].detail);
    assert!(columns[0].detail.as_deref().unwrap().starts_with("INT"));
    assert!(columns[1].detail.as_deref().unwrap().contains("NOT NULL"));
    assert!(columns[1].detail.as_deref().unwrap().starts_with("VARCHAR") || columns[1].detail.as_deref().unwrap().starts_with("CHARACTER VARYING"));
    assert!(!columns[2].detail.as_deref().unwrap().contains("NOT NULL"));
    assert!(columns.iter().all(|n| n.kind == NodeKind::Column && !n.has_children));

    let weird_node = tables.iter().find(|n| n.label == weird).unwrap();
    assert_eq!(labels(&f.conn.children(&weird_node.path).await.unwrap()), ["a"]);
    f.finish().await;
}

// ---------- queries ----------

async fn typed_cells(engine: Engine) {
    let Some(f) = Fixture::new(engine, "types").await else { return };
    let t = f.table("t");
    if engine.is_pg() {
        f.conn
            .execute(&format!(
                "CREATE TABLE {t} (n numeric(30,10), big bigint, ts timestamptz, u uuid, j jsonb, b bytea, arr int[], flag bool, note text, r float8)"
            ))
            .await
            .unwrap();
        f.conn
            .execute(&format!(
                "INSERT INTO {t} VALUES (12345678901234567890.1234567890, 9007199254740993, '2024-05-01 10:00:00+00', \
                 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{{\"a\": 1}}', '\\x010203', '{{1,2}}', true, NULL, 1.5)"
            ))
            .await
            .unwrap();
    } else {
        f.conn
            .execute(&format!(
                "CREATE TABLE {t} (n decimal(30,10), big bigint, ts datetime, u char(36), j json, b blob, flag boolean, note text, r double)"
            ))
            .await
            .unwrap();
        f.conn
            .execute(&format!(
                "INSERT INTO {t} VALUES (12345678901234567890.1234567890, 9007199254740993, '2024-05-01 10:00:00', \
                 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{{\"a\": 1}}', x'010203', true, NULL, 1.5)"
            ))
            .await
            .unwrap();
    }
    let result = f.conn.execute(&format!("SELECT * FROM {t}")).await.unwrap();
    let row = &result.rows[0];
    let by_name = |name: &str| {
        let i = result.columns.iter().position(|c| c.name.eq_ignore_ascii_case(name)).unwrap_or_else(|| panic!("no column {name}"));
        row[i].clone()
    };
    assert_eq!(by_name("n"), text("12345678901234567890.1234567890"));
    assert_eq!(by_name("big"), text("9007199254740993"));
    assert_eq!(by_name("note"), CellValue::Null);
    assert_eq!(by_name("r"), CellValue::Number(1.5));
    assert_eq!(by_name("u"), text("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"));
    match by_name("j") {
        CellValue::Text(j) => assert!(j.contains("\"a\"") && j.contains('1'), "{j}"),
        other => panic!("json should be text, got {other:?}"),
    }
    assert_eq!(by_name("b"), text("<binary 3 bytes>"));
    match by_name("ts") {
        CellValue::Text(ts) => assert!(ts.starts_with("2024-05-01 10:00:00"), "{ts}"),
        other => panic!("timestamp should be text, got {other:?}"),
    }
    let flag = by_name("flag");
    assert!(flag == CellValue::Bool(true) || flag == CellValue::Number(1.0), "{flag:?}");
    if engine.is_pg() {
        assert_eq!(by_name("arr"), text("{1,2}"));
    }
    f.finish().await;
}

async fn small_integers_and_empty_results_keep_headers(engine: Engine) {
    let Some(f) = Fixture::new(engine, "small").await else { return };
    let t = f.table("t");
    f.conn.execute(&format!("CREATE TABLE {t} (a INT, b VARCHAR(10))")).await.unwrap();
    let empty = f.conn.execute(&format!("SELECT a, b FROM {t}")).await.unwrap();
    assert!(empty.rows.is_empty());
    assert_eq!(empty.columns.len(), 2);
    assert_eq!(empty.rows_affected, None);
    let one = f.conn.execute("SELECT 42 AS answer").await.unwrap();
    assert_eq!(first_number(&one), 42.0);
    assert_eq!(one.columns[0].name, "answer");
    f.finish().await;
}

async fn stops_at_500_rows(engine: Engine) {
    let Some(f) = Fixture::new(engine, "rows").await else { return };
    let result = f.conn.execute(engine.thousand_rows()).await.unwrap();
    assert_eq!(result.rows.len(), 500);
    assert!(result.truncated);
    assert_eq!(f.conn.execute("SELECT 1").await.unwrap().rows.len(), 1);
    f.finish().await;
}

async fn reports_rows_affected(engine: Engine) {
    let Some(f) = Fixture::new(engine, "affected").await else { return };
    let t = f.table("t");
    f.conn.execute(&format!("CREATE TABLE {t} (a INT)")).await.unwrap();
    let inserted = f.conn.execute(&format!("INSERT INTO {t} VALUES (1), (2), (3)")).await.unwrap();
    assert_eq!(inserted.rows_affected, Some(3));
    assert!(inserted.columns.is_empty());
    let updated = f.conn.execute(&format!("UPDATE {t} SET a = a + 1 WHERE a > 1")).await.unwrap();
    assert_eq!(updated.rows_affected, Some(2));
    f.finish().await;
}

async fn syntax_errors_are_query_errors(engine: Engine) {
    let Some(f) = Fixture::new(engine, "syntax").await else { return };
    let err = f.conn.execute("SELEC 1").await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Query);
    assert!(!err.message.is_empty());
    assert_eq!(f.conn.execute("SELECT 1").await.unwrap().rows.len(), 1, "the connection survives an error");
    f.finish().await;
}

async fn read_only_connections_reject_writes(engine: Engine) {
    let Some((mut config, password)) = engine.server() else { return };
    config.read_only = true;
    let conn = connect(&config, &password).await;
    let err = conn.execute("CREATE TABLE rp_should_not_exist (a INT)").await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Query);
    conn.close().await;
}

// ---------- connecting ----------

async fn a_wrong_password_is_an_auth_error_that_does_not_echo_it(engine: Engine) {
    let Some((config, _)) = engine.server() else { return };
    let started = Instant::now();
    let err = SqlxDriver.connect(&config, Some(&Secret::new("definitely-wrong-pw"))).await.err().unwrap();
    assert_eq!(err.kind, ErrorKind::Auth, "{}", err.message);
    assert!(!err.message.contains("definitely-wrong-pw"));
    assert!(started.elapsed() < Duration::from_secs(10));
}

async fn a_closed_port_is_a_connection_error_within_ten_seconds(engine: Engine) {
    let Some((mut config, password)) = engine.server() else { return };
    config.host = Some("127.0.0.1".into());
    config.port = Some(1);
    let started = Instant::now();
    let err = SqlxDriver.connect(&config, Some(&password)).await.err().unwrap();
    assert_eq!(err.kind, ErrorKind::Connection, "{}", err.message);
    assert!(started.elapsed() < Duration::from_secs(11));
}

async fn a_missing_database_is_reported(engine: Engine) {
    let Some((mut config, password)) = engine.server() else { return };
    config.database = Some("rp_no_such_database".into());
    let err = SqlxDriver.connect(&config, Some(&password)).await.err().unwrap();
    assert!(matches!(err.kind, ErrorKind::Connection | ErrorKind::Query), "{err:?}");
    assert!(!err.message.contains(password.expose()) || password.expose().len() < 4);
}

// ---------- stopping and closing ----------

async fn interrupt_cancels_a_running_query_and_the_connection_still_works(engine: Engine) {
    let Some(f) = Fixture::new(engine, "cancel").await else { return };
    let conn: std::sync::Arc<dyn DataSourceConnection> = f.conn.into();
    let running = {
        let conn = conn.clone();
        tokio::spawn(async move { conn.execute(engine.sleep_forever()).await })
    };
    tokio::time::sleep(Duration::from_millis(600)).await;
    let started = Instant::now();
    conn.interrupt();
    let finished = tokio::time::timeout(Duration::from_secs(5), running).await.expect("the query must stop soon after interrupt");
    assert!(started.elapsed() < Duration::from_secs(5));
    // PostgreSQL reports an error; MySQL and MariaDB end SLEEP early with a normal result.
    let _ = finished.unwrap();
    assert_eq!(conn.execute("SELECT 1").await.unwrap().rows.len(), 1);
    let _ = conn.execute(&engine.drop_schema(&f.schema)).await;
    conn.close().await;
}

async fn close_ends_the_session_on_the_server(engine: Engine) {
    let Some((config, password)) = engine.server() else { return };
    let watched = connect(&config, &password).await;
    let admin = connect(&config, &password).await;
    let id = first_number(&watched.execute(engine.session_id_sql()).await.unwrap()) as i64;
    assert_eq!(first_number(&admin.execute(&engine.session_exists_sql(id)).await.unwrap()), 1.0);
    watched.close().await;
    let mut gone = false;
    for _ in 0..20 {
        if first_number(&admin.execute(&engine.session_exists_sql(id)).await.unwrap()) == 0.0 {
            gone = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(gone, "the server still has the closed session");
    admin.close().await;
}

macro_rules! for_each_engine {
    ($($case:ident),* $(,)?) => {
        mod postgres { use super::*; $( #[tokio::test] async fn $case() { super::$case(PG).await } )* }
        mod mysql { use super::*; $( #[tokio::test] async fn $case() { super::$case(MYSQL).await } )* }
        mod mariadb { use super::*; $( #[tokio::test] async fn $case() { super::$case(MARIADB).await } )* }
    };
}

for_each_engine!(
    lists_schemas_without_system_ones,
    browses_tables_views_and_columns,
    typed_cells,
    small_integers_and_empty_results_keep_headers,
    stops_at_500_rows,
    reports_rows_affected,
    syntax_errors_are_query_errors,
    read_only_connections_reject_writes,
    a_wrong_password_is_an_auth_error_that_does_not_echo_it,
    a_closed_port_is_a_connection_error_within_ten_seconds,
    a_missing_database_is_reported,
    interrupt_cancels_a_running_query_and_the_connection_still_works,
    close_ends_the_session_on_the_server,
);
