use serde::{Deserialize, Serialize};

use super::error::{AppError, ErrorKind};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "camelCase")]
pub enum EngineKind {
    #[default]
    Sqlite,
    Postgres,
    Mysql,
    Mariadb,
    Mssql,
    Redis,
    Kafka,
    Rabbitmq,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SslMode {
    Disable,
    #[default]
    Prefer,
    Require,
}

impl EngineKind {
    /// Engines reached over the network with a user and a password.
    pub fn is_server(self) -> bool {
        matches!(self, EngineKind::Postgres | EngineKind::Mysql | EngineKind::Mariadb)
    }
}

/// The port an engine listens on unless told otherwise.
pub const fn default_port(engine: EngineKind) -> Option<u16> {
    match engine {
        EngineKind::Postgres => Some(5432),
        EngineKind::Mysql | EngineKind::Mariadb => Some(3306),
        _ => None,
    }
}

/// A password that never prints: no `Serialize`, and `Debug` hides the value.
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secret(***)")
    }
}

/// A saved connection. Holds no secrets.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DataSourceConfig {
    pub id: String,
    pub name: String,
    pub engine: EngineKind,
    /// SQLite only.
    pub file_path: Option<String>,
    pub read_only: bool,
    /// Server engines only.
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub user: Option<String>,
    pub ssl_mode: SslMode,
    /// Whether the password lives in the Credential Manager.
    pub save_password: bool,
}

fn invalid(message: &str) -> AppError {
    AppError::new(ErrorKind::InvalidConfig, message)
}

fn blank(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(|v| v.trim().is_empty())
}

impl DataSourceConfig {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty() {
            return Err(invalid("The data source needs a name."));
        }
        if !is_safe_id(&self.id) {
            return Err(invalid("The data source id is not valid."));
        }
        match self.engine {
            EngineKind::Sqlite => {
                if blank(&self.file_path) {
                    return Err(invalid("Choose a SQLite database file."));
                }
                Ok(())
            }
            EngineKind::Postgres | EngineKind::Mysql | EngineKind::Mariadb => {
                if blank(&self.host) {
                    return Err(invalid("Enter a host."));
                }
                if blank(&self.user) {
                    return Err(invalid("Enter a user."));
                }
                if self.port == Some(0) {
                    return Err(invalid("Enter a port between 1 and 65535."));
                }
                Ok(())
            }
            _ => Err(invalid("This engine is not supported yet.")),
        }
    }
}

/// Ids name files on disk, so only letters, digits and `-` are allowed.
pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Schema,
    Folder,
    Table,
    View,
    Column,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DataNode {
    /// Path segments from the connection root, e.g. `["main", "tables", "users"]`.
    pub path: Vec<String>,
    pub label: String,
    pub kind: NodeKind,
    /// Greyed text after the label, e.g. `INTEGER, PK`.
    pub detail: Option<String>,
    pub has_children: bool,
}
