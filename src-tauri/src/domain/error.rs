use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    NotFound,
    PermissionDenied,
    NotUtf8,
    TooLarge,
    Io,
    Connection,
    Auth,
    GitMissing,
    GitTooOld,
    Query,
    Cancelled,
    InvalidConfig,
}

/// The single error shape for every command, sent to the frontend as
/// `{ kind, message }`.
#[derive(Serialize, Debug)]
pub struct AppError {
    pub kind: ErrorKind,
    pub message: String,
}

impl AppError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        let kind = match err.kind() {
            std::io::ErrorKind::NotFound => ErrorKind::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorKind::PermissionDenied,
            _ => ErrorKind::Io,
        };
        Self::new(kind, err.to_string())
    }
}
