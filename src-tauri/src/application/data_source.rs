use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use futures::future::{AbortHandle, Abortable};

use crate::domain::data_source::{DataNode, DataSourceConfig, Secret, is_safe_id};
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::{DataSourceConnection, DataSourceDriver, SecretStore};
use crate::domain::sql::SqlResult;

type Connection = Arc<dyn DataSourceConnection>;

/// The live connections and the statements running on them.
#[derive(Default)]
pub struct DataSourceSessions {
    connections: Mutex<HashMap<String, Connection>>,
    executions: Mutex<HashMap<u64, (AbortHandle, Connection)>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn not_connected() -> AppError {
    AppError::new(ErrorKind::Connection, "Not connected.")
}

impl DataSourceSessions {
    pub fn new() -> Self {
        Self::default()
    }

    /// Connects and closes again; keeps no session.
    pub async fn test(
        &self,
        driver: &dyn DataSourceDriver,
        secrets: &dyn SecretStore,
        config: &DataSourceConfig,
        password: Option<Secret>,
    ) -> Result<(), AppError> {
        config.validate()?;
        let password = resolve_password(config, secrets, password)?;
        let connection = driver.connect(config, password.as_ref()).await?;
        connection.close().await;
        Ok(())
    }

    /// Replaces any connection already open under the same id.
    pub async fn connect(
        &self,
        driver: &dyn DataSourceDriver,
        secrets: &dyn SecretStore,
        config: DataSourceConfig,
        password: Option<Secret>,
    ) -> Result<(), AppError> {
        config.validate()?;
        let password = resolve_password(&config, secrets, password)?;
        let connection: Connection = Arc::from(driver.connect(&config, password.as_ref()).await?);
        let previous = lock(&self.connections).insert(config.id, connection);
        if let Some(previous) = previous {
            previous.close().await;
        }
        Ok(())
    }

    pub async fn disconnect(&self, id: &str) {
        let connection = lock(&self.connections).remove(id);
        if let Some(connection) = connection {
            connection.close().await;
        }
    }

    fn get(&self, id: &str) -> Result<Connection, AppError> {
        lock(&self.connections).get(id).cloned().ok_or_else(not_connected)
    }

    pub async fn children(&self, id: &str, path: &[String]) -> Result<Vec<DataNode>, AppError> {
        self.get(id)?.children(path).await
    }

    pub async fn execute(&self, id: &str, execution_id: u64, sql: &str) -> Result<SqlResult, AppError> {
        let connection = self.get(id)?;
        let (handle, registration) = AbortHandle::new_pair();
        lock(&self.executions).insert(execution_id, (handle, connection.clone()));
        let sql = sql.to_string();
        let outcome = Abortable::new(async move { connection.execute(&sql).await }, registration).await;
        lock(&self.executions).remove(&execution_id);
        match outcome {
            Ok(result) => result,
            Err(_) => Err(AppError::new(ErrorKind::Cancelled, "The query was cancelled.")),
        }
    }

    /// Stop a running statement. Unknown ids are ignored.
    pub fn cancel(&self, execution_id: u64) {
        let entry = lock(&self.executions).get(&execution_id).map(|(h, c)| (h.clone(), c.clone()));
        if let Some((handle, connection)) = entry {
            handle.abort();
            connection.interrupt();
        }
    }

    pub fn running_executions(&self) -> usize {
        lock(&self.executions).len()
    }

    pub async fn close_all(&self) {
        let all: Vec<Connection> = lock(&self.connections).drain().map(|(_, c)| c).collect();
        for connection in all {
            connection.interrupt();
            connection.close().await;
        }
    }
}

/// The password to connect with: the one given, else the saved one when saving is on.
/// Only server engines need one; an empty password still counts as given.
fn resolve_password(
    config: &DataSourceConfig,
    secrets: &dyn SecretStore,
    given: Option<Secret>,
) -> Result<Option<Secret>, AppError> {
    if !config.engine.is_server() {
        return Ok(None);
    }
    if given.is_some() {
        return Ok(given);
    }
    let saved = if config.save_password { secrets.get(&config.id)? } else { None };
    saved
        .map(Some)
        .ok_or_else(|| AppError::new(ErrorKind::Auth, "A password is required."))
}

fn checked_id(id: &str) -> Result<(), AppError> {
    if is_safe_id(id) {
        Ok(())
    } else {
        Err(AppError::new(ErrorKind::InvalidConfig, "The data source id is not valid."))
    }
}

/// Keep a password in the credential store for later connections.
pub fn save_secret(secrets: &dyn SecretStore, id: &str, secret: Secret) -> Result<(), AppError> {
    checked_id(id)?;
    secrets.set(id, &secret)
}

/// Remove a saved password. Forgetting one that is not there succeeds.
pub fn forget_secret(secrets: &dyn SecretStore, id: &str) -> Result<(), AppError> {
    checked_id(id)?;
    secrets.delete(id)
}
