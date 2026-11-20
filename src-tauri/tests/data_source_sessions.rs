use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use rustpilot_lib::application::data_source::{DataSourceSessions, forget_secret, save_secret};
use rustpilot_lib::domain::data_source::{DataNode, DataSourceConfig, EngineKind, Secret};
use rustpilot_lib::domain::error::{AppError, ErrorKind};
use rustpilot_lib::domain::ports::{DataSourceConnection, DataSourceDriver, SecretStore};
use rustpilot_lib::domain::sql::SqlResult;
use tokio::sync::Notify;

#[derive(Default)]
struct Counters {
    connects: AtomicUsize,
    closes: AtomicUsize,
    interrupts: AtomicUsize,
    passwords: Mutex<Vec<Option<String>>>,
}

struct FakeDriver {
    counters: Arc<Counters>,
    /// When set, `execute` waits on this before answering.
    hold: Option<Arc<Notify>>,
    fail_execute: bool,
}

struct FakeConnection {
    counters: Arc<Counters>,
    hold: Option<Arc<Notify>>,
    fail_execute: bool,
}

fn driver() -> (FakeDriver, Arc<Counters>) {
    let counters = Arc::new(Counters::default());
    (FakeDriver { counters: counters.clone(), hold: None, fail_execute: false }, counters)
}

#[async_trait]
impl DataSourceDriver for FakeDriver {
    async fn connect(&self, _config: &DataSourceConfig, password: Option<&Secret>) -> Result<Box<dyn DataSourceConnection>, AppError> {
        self.counters.connects.fetch_add(1, Ordering::SeqCst);
        self.counters.passwords.lock().unwrap().push(password.map(|p| p.expose().to_string()));
        Ok(Box::new(FakeConnection {
            counters: self.counters.clone(),
            hold: self.hold.clone(),
            fail_execute: self.fail_execute,
        }))
    }
}

#[async_trait]
impl DataSourceConnection for FakeConnection {
    async fn children(&self, path: &[String]) -> Result<Vec<DataNode>, AppError> {
        Ok(vec![DataNode {
            path: path.to_vec(),
            label: "n".into(),
            kind: rustpilot_lib::domain::data_source::NodeKind::Schema,
            detail: None,
            has_children: false,
        }])
    }
    async fn execute(&self, _sql: &str) -> Result<SqlResult, AppError> {
        if let Some(hold) = &self.hold {
            hold.notified().await;
        }
        if self.fail_execute {
            return Err(AppError::new(ErrorKind::Query, "boom"));
        }
        Ok(SqlResult { columns: vec![], rows: vec![], truncated: false, rows_affected: Some(1), elapsed_ms: 0 })
    }
    fn interrupt(&self) {
        self.counters.interrupts.fetch_add(1, Ordering::SeqCst);
    }
    async fn close(&self) {
        self.counters.closes.fetch_add(1, Ordering::SeqCst);
    }
}

fn config(id: &str) -> DataSourceConfig {
    DataSourceConfig {
        id: id.into(),
        name: "db".into(),
        engine: EngineKind::Sqlite,
        file_path: Some("C:/a.db".into()),
        ..DataSourceConfig::default()
    }
}

#[tokio::test]
async fn test_does_not_keep_a_session() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    sessions.test(&driver, &FakeSecrets::default(), &config("a"), None).await.unwrap();
    assert_eq!(counters.connects.load(Ordering::SeqCst), 1);
    assert_eq!(counters.closes.load(Ordering::SeqCst), 1);
    let err = sessions.children("a", &[]).await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Connection);
}

#[tokio::test]
async fn invalid_config_fails_before_connecting() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    let mut bad = config("a");
    bad.file_path = None;
    let err = sessions.connect(&driver, &FakeSecrets::default(), bad, None).await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::InvalidConfig);
    assert_eq!(counters.connects.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn connecting_twice_closes_the_previous_connection() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    assert_eq!(counters.connects.load(Ordering::SeqCst), 2);
    assert_eq!(counters.closes.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn children_and_execute_need_a_connection() {
    let sessions = DataSourceSessions::new();
    let err = sessions.children("nope", &[]).await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Connection);
    let err = sessions.execute("nope", 1, "select 1").await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Connection);
}

#[tokio::test]
async fn children_come_from_the_connection() {
    let (driver, _) = driver();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    let nodes = sessions.children("a", &["main".to_string()]).await.unwrap();
    assert_eq!(nodes[0].path, vec!["main".to_string()]);
}

#[tokio::test]
async fn cancel_stops_a_running_execution() {
    let (mut driver, counters) = driver();
    driver.hold = Some(Arc::new(Notify::new()));
    let sessions = Arc::new(DataSourceSessions::new());
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();

    let running = {
        let sessions = sessions.clone();
        tokio::spawn(async move { sessions.execute("a", 7, "select 1").await })
    };
    while sessions.running_executions() == 0 {
        tokio::task::yield_now().await;
    }
    sessions.cancel(7);
    let err = running.await.unwrap().unwrap_err();
    assert_eq!(err.kind, ErrorKind::Cancelled);
    assert_eq!(sessions.running_executions(), 0);
    assert_eq!(counters.interrupts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancelling_an_unknown_execution_does_nothing() {
    let sessions = DataSourceSessions::new();
    sessions.cancel(99);
}

#[tokio::test]
async fn failed_execution_is_forgotten() {
    let (mut driver, _) = driver();
    driver.fail_execute = true;
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    let err = sessions.execute("a", 1, "x").await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Query);
    assert_eq!(sessions.running_executions(), 0);
}

#[tokio::test]
async fn successful_execution_is_forgotten() {
    let (driver, _) = driver();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    let result = sessions.execute("a", 1, "x").await.unwrap();
    assert_eq!(result.rows_affected, Some(1));
    assert_eq!(sessions.running_executions(), 0);
}

#[tokio::test]
async fn disconnect_closes_the_connection() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    sessions.disconnect("a").await;
    assert_eq!(counters.closes.load(Ordering::SeqCst), 1);
    assert_eq!(sessions.children("a", &[]).await.unwrap_err().kind, ErrorKind::Connection);
}

#[tokio::test]
async fn close_all_closes_every_connection() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    sessions.connect(&driver, &FakeSecrets::default(), config("b"), None).await.unwrap();
    sessions.close_all().await;
    assert_eq!(counters.closes.load(Ordering::SeqCst), 2);
}

#[derive(Default)]
struct FakeSecrets {
    values: Mutex<HashMap<String, String>>,
    writes: AtomicUsize,
}

impl FakeSecrets {
    fn with(id: &str, value: &str) -> Self {
        let store = Self::default();
        store.values.lock().unwrap().insert(id.into(), value.into());
        store
    }
}

impl SecretStore for FakeSecrets {
    fn get(&self, id: &str) -> Result<Option<Secret>, AppError> {
        Ok(self.values.lock().unwrap().get(id).map(|v| Secret::new(v.clone())))
    }
    fn set(&self, id: &str, secret: &Secret) -> Result<(), AppError> {
        self.writes.fetch_add(1, Ordering::SeqCst);
        self.values.lock().unwrap().insert(id.into(), secret.expose().into());
        Ok(())
    }
    fn delete(&self, id: &str) -> Result<(), AppError> {
        self.values.lock().unwrap().remove(id);
        Ok(())
    }
}

fn pg(id: &str, save_password: bool) -> DataSourceConfig {
    DataSourceConfig {
        id: id.into(),
        name: "pg".into(),
        engine: EngineKind::Postgres,
        host: Some("localhost".into()),
        user: Some("app".into()),
        save_password,
        ..DataSourceConfig::default()
    }
}

fn last_password(counters: &Counters) -> Option<String> {
    counters.passwords.lock().unwrap().last().cloned().flatten()
}

#[tokio::test]
async fn an_explicit_password_beats_the_saved_one() {
    let (driver, counters) = driver();
    let secrets = FakeSecrets::with("pg1", "saved");
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &secrets, pg("pg1", true), Some(Secret::new("typed"))).await.unwrap();
    assert_eq!(last_password(&counters).as_deref(), Some("typed"));
}

#[tokio::test]
async fn the_saved_password_is_used_when_saving_is_on() {
    let (driver, counters) = driver();
    let secrets = FakeSecrets::with("pg1", "saved");
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &secrets, pg("pg1", true), None).await.unwrap();
    assert_eq!(last_password(&counters).as_deref(), Some("saved"));
}

#[tokio::test]
async fn a_saved_password_is_ignored_when_saving_is_off() {
    let (driver, _) = driver();
    let secrets = FakeSecrets::with("pg1", "stale");
    let sessions = DataSourceSessions::new();
    let err = sessions.connect(&driver, &secrets, pg("pg1", false), None).await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Auth);
}

#[tokio::test]
async fn a_server_without_any_password_is_an_auth_error() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    let err = sessions.connect(&driver, &FakeSecrets::default(), pg("pg1", true), None).await.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Auth);
    assert_eq!(counters.connects.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn an_empty_password_is_still_a_password() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), pg("pg1", false), Some(Secret::new(""))).await.unwrap();
    assert_eq!(last_password(&counters).as_deref(), Some(""));
}

#[tokio::test]
async fn sqlite_never_needs_a_password() {
    let (driver, counters) = driver();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &FakeSecrets::default(), config("a"), None).await.unwrap();
    assert_eq!(counters.passwords.lock().unwrap().as_slice(), &[None]);
}

#[tokio::test]
async fn connecting_never_writes_to_the_secret_store() {
    let (driver, _) = driver();
    let secrets = FakeSecrets::default();
    let sessions = DataSourceSessions::new();
    sessions.connect(&driver, &secrets, pg("pg1", true), Some(Secret::new("typed"))).await.unwrap();
    assert_eq!(secrets.writes.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn testing_also_reads_the_saved_password() {
    let (driver, counters) = driver();
    let secrets = FakeSecrets::with("pg1", "saved");
    let sessions = DataSourceSessions::new();
    sessions.test(&driver, &secrets, &pg("pg1", true), None).await.unwrap();
    assert_eq!(last_password(&counters).as_deref(), Some("saved"));
    assert_eq!(counters.closes.load(Ordering::SeqCst), 1);
}

#[test]
fn secrets_can_be_saved_and_forgotten() {
    let secrets = FakeSecrets::default();
    save_secret(&secrets, "pg1", Secret::new("pw")).unwrap();
    assert_eq!(secrets.get("pg1").unwrap().unwrap().expose(), "pw");
    forget_secret(&secrets, "pg1").unwrap();
    assert!(secrets.get("pg1").unwrap().is_none());
}

#[test]
fn secret_ids_must_be_safe() {
    let secrets = FakeSecrets::default();
    assert_eq!(save_secret(&secrets, "../x", Secret::new("pw")).unwrap_err().kind, ErrorKind::InvalidConfig);
    assert_eq!(forget_secret(&secrets, "").unwrap_err().kind, ErrorKind::InvalidConfig);
}
