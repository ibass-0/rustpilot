//! Terminal use cases: which shells exist on this machine, and the registry
//! of sessions that are currently running.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::{EventSink, ProgramLocator, PtySession, PtySpawner};
use crate::domain::terminal::{ShellProfile, TerminalSize};

fn profile(id: &str, name: &str, program: PathBuf, args: &[&str]) -> ShellProfile {
    ShellProfile {
        id: id.to_string(),
        name: name.to_string(),
        program: program.to_string_lossy().into_owned(),
        args: args.iter().map(|arg| arg.to_string()).collect(),
    }
}

/// Git Bash is looked up in Git's own install folders. `bash.exe` on `PATH`
/// cannot be trusted: on a stock Windows it is the WSL launcher.
fn find_git_bash(locator: &dyn ProgramLocator) -> Option<PathBuf> {
    const INSTALL_ROOTS: [(&str, &[&str]); 3] = [
        ("ProgramFiles", &["Git"]),
        ("ProgramFiles(x86)", &["Git"]),
        ("LocalAppData", &["Programs", "Git"]),
    ];
    INSTALL_ROOTS.iter().find_map(|(variable, folders)| {
        let mut path = PathBuf::from(locator.env(variable)?);
        path.extend(folders.iter());
        path.push("bin");
        path.push("bash.exe");
        locator.exists(&path).then_some(path)
    })
}

/// The shells installed on this machine, most preferred first. The first one
/// is the default for a new terminal.
pub fn available_shells(locator: &dyn ProgramLocator) -> Vec<ShellProfile> {
    let mut shells = Vec::new();
    if let Some(program) = locator.find_in_path("pwsh.exe") {
        shells.push(profile("pwsh", "PowerShell", program, &["-NoLogo"]));
    }
    if let Some(program) = locator.find_in_path("powershell.exe") {
        shells.push(profile("powershell", "Windows PowerShell", program, &["-NoLogo"]));
    }
    if let Some(program) = locator.find_in_path("cmd.exe") {
        shells.push(profile("cmd", "Command Prompt", program, &[]));
    }
    if let Some(program) = find_git_bash(locator) {
        shells.push(profile("git-bash", "Git Bash", program, &["--login", "-i"]));
    }
    if let Some(program) = locator.find_in_path("wsl.exe") {
        shells.push(profile("wsl", "WSL", program, &[]));
    }
    shells
}

/// Every terminal session that is currently open, keyed by the id the
/// frontend chose for it. Dropping the registry ends all of them.
#[derive(Default)]
pub struct TerminalSessions {
    sessions: Mutex<HashMap<u32, Box<dyn PtySession>>>,
}

impl TerminalSessions {
    pub fn new() -> Self {
        Self::default()
    }

    /// A panic in another thread must not make the sessions unreachable: they still need killing.
    fn lock(&self) -> MutexGuard<'_, HashMap<u32, Box<dyn PtySession>>> {
        self.sessions.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn open(
        &self,
        spawner: &dyn PtySpawner,
        id: u32,
        profile: &ShellProfile,
        cwd: &Path,
        size: TerminalSize,
        events: EventSink,
    ) -> Result<(), AppError> {
        // The lock is held across the spawn so that a shell which exits at once
        // cannot be closed (by its own exit event) before it is registered.
        let mut sessions = self.lock();
        if sessions.contains_key(&id) {
            return Err(AppError::new(ErrorKind::Io, format!("terminal {id} is already open")));
        }
        let session = spawner.spawn(profile, cwd, size.clamped(), events)?;
        sessions.insert(id, session);
        Ok(())
    }

    fn with_session<T>(
        &self,
        id: u32,
        action: impl FnOnce(&mut dyn PtySession) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        match self.lock().get_mut(&id) {
            Some(session) => action(session.as_mut()),
            None => Err(AppError::new(ErrorKind::NotFound, format!("terminal {id} is not open"))),
        }
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), AppError> {
        self.with_session(id, |session| session.write(data.as_bytes()))
    }

    pub fn resize(&self, id: u32, size: TerminalSize) -> Result<(), AppError> {
        self.with_session(id, |session| session.resize(size.clamped()))
    }

    /// Tell a session how much of its output has been drawn. Unknown ids are ignored:
    /// an acknowledgement may arrive just after its session ended.
    pub fn acknowledge(&self, id: u32, seq: u64) {
        if let Some(session) = self.lock().get_mut(&id) {
            session.acknowledge(seq);
        }
    }

    /// End a session and forget it. Unknown ids are ignored.
    pub fn close(&self, id: u32) {
        let removed = self.lock().remove(&id);
        if let Some(mut session) = removed {
            session.kill();
        }
    }

    pub fn close_all(&self) {
        let drained: Vec<_> = self.lock().drain().collect();
        for (_, mut session) in drained {
            session.kill();
        }
    }

    pub fn len(&self) -> usize {
        self.lock().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Drop for TerminalSessions {
    fn drop(&mut self) {
        self.close_all();
    }
}
