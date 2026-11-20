//! Adapters that implement the domain ports against the real world.

pub mod keyring_secrets;
pub mod local_fs;
pub mod git_cli;
pub mod git_watch;
pub mod program_locator;
pub mod pty;
pub mod server_source;
pub mod sql_values;
pub mod sqlx_driver;
