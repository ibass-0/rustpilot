use std::path::{Path, PathBuf};

use crate::domain::ports::ProgramLocator;

/// `ProgramLocator` backed by the real `PATH`, disk and environment.
pub struct SystemProgramLocator;

impl ProgramLocator for SystemProgramLocator {
    fn find_in_path(&self, exe: &str) -> Option<PathBuf> {
        let path = std::env::var_os("PATH")?;
        std::env::split_paths(&path).map(|dir| dir.join(exe)).find(|candidate| candidate.is_file())
    }

    fn exists(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn env(&self, name: &str) -> Option<String> {
        std::env::var(name).ok()
    }
}
