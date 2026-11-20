//! Passwords in the Windows Credential Manager, under the service name
//! `RustPilot` and the target `rustpilot/dataSource/<id>`.

use keyring::Entry;

use crate::domain::data_source::{Secret, is_safe_id};
use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::SecretStore;

const SERVICE: &str = "RustPilot";

pub struct KeyringSecretStore;

fn entry(id: &str) -> Result<Entry, AppError> {
    if !is_safe_id(id) {
        return Err(AppError::new(ErrorKind::InvalidConfig, "The data source id is not valid."));
    }
    Entry::new(SERVICE, &format!("rustpilot/dataSource/{id}")).map_err(store_error)
}

/// The message names the problem, never the secret.
fn store_error(err: keyring::Error) -> AppError {
    AppError::new(ErrorKind::Io, format!("The credential store failed: {err}"))
}

impl SecretStore for KeyringSecretStore {
    fn get(&self, id: &str) -> Result<Option<Secret>, AppError> {
        match entry(id)?.get_password() {
            Ok(password) => Ok(Some(Secret::new(password))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(store_error(err)),
        }
    }

    fn set(&self, id: &str, secret: &Secret) -> Result<(), AppError> {
        entry(id)?.set_password(secret.expose()).map_err(store_error)
    }

    fn delete(&self, id: &str) -> Result<(), AppError> {
        match entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(store_error(err)),
        }
    }
}
