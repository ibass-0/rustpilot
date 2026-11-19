//! The registry of live terminal sessions, exercised with a fake PTY.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rustpilot_lib::application::terminal::TerminalSessions;
use rustpilot_lib::domain::error::{AppError, ErrorKind};
use rustpilot_lib::domain::ports::{EventSink, PtySession, PtySpawner};
use rustpilot_lib::domain::terminal::{ShellProfile, TerminalSize};

type Log = Arc<Mutex<Vec<String>>>;

struct FakeSession {
    name: String,
    log: Log,
}

impl PtySession for FakeSession {
    fn write(&mut self, data: &[u8]) -> Result<(), AppError> {
        self.log.lock().unwrap().push(format!("{} write {}", self.name, String::from_utf8_lossy(data)));
        Ok(())
    }
    fn resize(&mut self, size: TerminalSize) -> Result<(), AppError> {
        self.log.lock().unwrap().push(format!("{} resize {}x{}", self.name, size.cols, size.rows));
        Ok(())
    }
    fn kill(&mut self) {
        self.log.lock().unwrap().push(format!("{} kill", self.name));
    }
}

#[derive(Default)]
struct FakeSpawner {
    log: Log,
    fail: bool,
    spawned: Mutex<Vec<(ShellProfile, PathBuf, TerminalSize)>>,
}

impl PtySpawner for FakeSpawner {
    fn spawn(
        &self,
        profile: &ShellProfile,
        cwd: &Path,
        size: TerminalSize,
        _events: EventSink,
    ) -> Result<Box<dyn PtySession>, AppError> {
        if self.fail {
            return Err(AppError::new(ErrorKind::NotFound, "no such shell"));
        }
        let mut spawned = self.spawned.lock().unwrap();
        spawned.push((profile.clone(), cwd.to_path_buf(), size));
        Ok(Box::new(FakeSession { name: format!("s{}", spawned.len()), log: self.log.clone() }))
    }
}

fn profile() -> ShellProfile {
    ShellProfile { id: "cmd".into(), name: "Command Prompt".into(), program: r"C:\cmd.exe".into(), args: vec![] }
}

fn sink() -> EventSink {
    Box::new(|_| {})
}

const SIZE: TerminalSize = TerminalSize { cols: 80, rows: 24 };

fn open(sessions: &TerminalSessions, spawner: &FakeSpawner, id: u32) -> Result<(), AppError> {
    sessions.open(spawner, id, &profile(), Path::new(r"C:\work"), SIZE, sink())
}

fn log_of(spawner: &FakeSpawner) -> Vec<String> {
    spawner.log.lock().unwrap().clone()
}

#[test]
fn open_spawns_with_profile_cwd_and_size() {
    let spawner = FakeSpawner::default();
    let sessions = TerminalSessions::new();

    open(&sessions, &spawner, 1).unwrap();

    let spawned = spawner.spawned.lock().unwrap();
    assert_eq!(spawned.len(), 1);
    assert_eq!(spawned[0].0, profile());
    assert_eq!(spawned[0].1, PathBuf::from(r"C:\work"));
    assert_eq!(spawned[0].2, SIZE);
    assert_eq!(sessions.len(), 1);
}

#[test]
fn open_rejects_a_duplicate_id() {
    let spawner = FakeSpawner::default();
    let sessions = TerminalSessions::new();
    open(&sessions, &spawner, 1).unwrap();

    let err = open(&sessions, &spawner, 1).unwrap_err();

    assert_eq!(err.kind, ErrorKind::Io);
    assert_eq!(sessions.len(), 1);
    assert_eq!(spawner.spawned.lock().unwrap().len(), 1, "the duplicate must not spawn a second shell");
}

#[test]
fn a_failed_spawn_leaves_no_session() {
    let spawner = FakeSpawner { fail: true, ..Default::default() };
    let sessions = TerminalSessions::new();

    let err = open(&sessions, &spawner, 1).unwrap_err();

    assert_eq!(err.kind, ErrorKind::NotFound);
    assert_eq!(sessions.len(), 0);
}

#[test]
fn write_and_resize_reach_the_right_session() {
    let spawner = FakeSpawner::default();
    let sessions = TerminalSessions::new();
    open(&sessions, &spawner, 1).unwrap();
    open(&sessions, &spawner, 2).unwrap();

    sessions.write(2, "dir\r").unwrap();
    sessions.resize(1, TerminalSize { cols: 120, rows: 40 }).unwrap();

    assert_eq!(log_of(&spawner), ["s2 write dir\r", "s1 resize 120x40"]);
}

#[test]
fn write_to_an_unknown_id_is_not_found() {
    let sessions = TerminalSessions::new();
    assert_eq!(sessions.write(9, "x").unwrap_err().kind, ErrorKind::NotFound);
    assert_eq!(sessions.resize(9, SIZE).unwrap_err().kind, ErrorKind::NotFound);
}

#[test]
fn close_kills_and_forgets_the_session() {
    let spawner = FakeSpawner::default();
    let sessions = TerminalSessions::new();
    open(&sessions, &spawner, 1).unwrap();

    sessions.close(1);
    sessions.close(1);
    sessions.close(42);

    assert_eq!(log_of(&spawner), ["s1 kill"]);
    assert_eq!(sessions.len(), 0);
}

#[test]
fn close_all_kills_every_session() {
    let spawner = FakeSpawner::default();
    let sessions = TerminalSessions::new();
    open(&sessions, &spawner, 1).unwrap();
    open(&sessions, &spawner, 2).unwrap();

    sessions.close_all();

    let mut log = log_of(&spawner);
    log.sort();
    assert_eq!(log, ["s1 kill", "s2 kill"]);
    assert_eq!(sessions.len(), 0);
}

#[test]
fn dropping_the_registry_kills_every_session() {
    let spawner = FakeSpawner::default();
    {
        let sessions = TerminalSessions::new();
        open(&sessions, &spawner, 1).unwrap();
    }
    assert_eq!(log_of(&spawner), ["s1 kill"]);
}

#[test]
fn a_zero_size_is_clamped_to_one() {
    let spawner = FakeSpawner::default();
    let sessions = TerminalSessions::new();
    sessions
        .open(&spawner, 1, &profile(), Path::new(r"C:\work"), TerminalSize { cols: 0, rows: 0 }, sink())
        .unwrap();
    assert_eq!(spawner.spawned.lock().unwrap()[0].2, TerminalSize { cols: 1, rows: 1 });

    sessions.resize(1, TerminalSize { cols: 0, rows: 30 }).unwrap();
    assert_eq!(log_of(&spawner), ["s1 resize 1x30"]);
}
