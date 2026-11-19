//! The ConPTY adapter, exercised against the real `cmd.exe`.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use rustpilot_lib::domain::error::ErrorKind;
use rustpilot_lib::domain::ports::{EventSink, PtySession, PtySpawner};
use rustpilot_lib::domain::terminal::{ShellProfile, TerminalEvent, TerminalSize};
use rustpilot_lib::infrastructure::pty::PortablePtySpawner;
use tempfile::tempdir;

const SIZE: TerminalSize = TerminalSize { cols: 100, rows: 30 };
const TIMEOUT: Duration = Duration::from_secs(15);

fn cmd(args: &[&str]) -> ShellProfile {
    ShellProfile {
        id: "cmd".into(),
        name: "Command Prompt".into(),
        program: std::env::var("ComSpec").expect("ComSpec is set on Windows"),
        args: args.iter().map(|a| a.to_string()).collect(),
    }
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("USERPROFILE").expect("USERPROFILE is set on Windows"))
}

struct Running {
    session: Box<dyn PtySession>,
    events: Receiver<TerminalEvent>,
    output: String,
    exit: Option<u32>,
    /// Everything printed up to the moment the exit event arrived.
    output_at_exit: Option<String>,
}

/// ConPTY asks the terminal where the cursor is when it starts, and waits for
/// the answer. A real emulator replies by itself; here the test plays that part.
const CURSOR_QUERY: &str = "\x1b[6n";
const CURSOR_REPLY: &[u8] = b"\x1b[1;1R";

fn start(profile: &ShellProfile, cwd: &Path) -> Running {
    let (tx, events) = channel();
    let tx = Mutex::new(tx);
    let sink: EventSink = Box::new(move |event| {
        let _ = tx.lock().unwrap().send(event);
    });
    let session = PortablePtySpawner.spawn(profile, cwd, SIZE, sink).expect("shell starts");
    Running { session, events, output: String::new(), exit: None, output_at_exit: None }
}

impl Running {
    /// Pump events until `done` holds or the timeout passes. Returns whether it held.
    fn pump_until(&mut self, done: impl Fn(&Running) -> bool) -> bool {
        let deadline = Instant::now() + TIMEOUT;
        while !done(self) {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.events.recv_timeout(left) {
                Ok(TerminalEvent::Output { data }) => {
                    if data.contains(CURSOR_QUERY) {
                        let _ = self.session.write(CURSOR_REPLY);
                    }
                    self.output.push_str(&data);
                }
                Ok(TerminalEvent::Exit { code }) => {
                    self.exit = Some(code);
                    self.output_at_exit = Some(self.output.clone());
                }
                Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => return done(self),
            }
        }
        true
    }

    fn wait_for_exit(&mut self) -> Option<u32> {
        self.pump_until(|r| r.exit.is_some());
        self.exit
    }

    fn wait_for_output(&mut self, needle: &str) -> bool {
        self.pump_until(|r| r.output.contains(needle))
    }
}

#[test]
fn runs_a_command_and_streams_its_output() {
    let mut run = start(&cmd(&["/C", "echo rp_marker"]), &home());

    assert_eq!(run.wait_for_exit(), Some(0));
    assert!(run.output.contains("rp_marker"), "output was: {:?}", run.output);
}

#[test]
fn output_arrives_before_the_exit_event() {
    let mut run = start(&cmd(&["/C", "echo rp_last_words"]), &home());

    assert_eq!(run.wait_for_exit(), Some(0));
    let at_exit = run.output_at_exit.clone().unwrap();
    assert!(at_exit.contains("rp_last_words"), "output before exit: {at_exit:?}");

    // Nothing may trickle in after the exit event.
    while let Ok(event) = run.events.recv_timeout(Duration::from_millis(500)) {
        panic!("event after exit: {event:?}");
    }
}

#[test]
fn reports_the_exit_code() {
    let mut run = start(&cmd(&["/C", "exit 3"]), &home());
    assert_eq!(run.wait_for_exit(), Some(3));
}

#[test]
fn input_written_to_the_session_reaches_the_shell() {
    let mut run = start(&cmd(&[]), &home());

    run.session.write(b"echo rp_%OS%\r\n").unwrap();

    assert!(run.wait_for_output("rp_Windows_NT"), "output was: {:?}", run.output);
    run.session.kill();
}

#[test]
fn starts_in_the_requested_directory() {
    let dir = tempdir().unwrap();
    let marker = dir.path().file_name().unwrap().to_string_lossy().into_owned();
    let mut run = start(&cmd(&["/C", "cd"]), dir.path());

    assert_eq!(run.wait_for_exit(), Some(0));
    assert!(run.output.contains(&marker), "expected {marker} in {:?}", run.output);
}

#[test]
fn kill_ends_a_running_shell() {
    let mut run = start(&cmd(&[]), &home());
    assert!(run.wait_for_output(">"), "the prompt never appeared: {:?}", run.output);

    run.session.kill();
    run.session.kill();

    assert!(run.wait_for_exit().is_some(), "no exit event after kill");
}

#[test]
fn resize_is_accepted_while_running_and_rejected_after_kill() {
    let mut run = start(&cmd(&[]), &home());
    assert!(run.session.resize(TerminalSize { cols: 120, rows: 40 }).is_ok());

    run.session.kill();

    assert!(run.session.resize(SIZE).is_err());
    assert!(run.session.write(b"x").is_err());
}

#[test]
fn a_missing_program_is_an_error() {
    let mut profile = cmd(&[]);
    profile.program = r"C:\no\such\shell.exe".into();
    let sink: EventSink = Box::new(|_| {});

    let err = PortablePtySpawner.spawn(&profile, &home(), SIZE, sink).err().expect("spawn must fail");

    assert_eq!(err.kind, ErrorKind::NotFound);
}

#[test]
fn a_missing_working_directory_is_an_error() {
    let dir = tempdir().unwrap();
    let gone = dir.path().join("gone");
    let sink: EventSink = Box::new(|_| {});

    let err = PortablePtySpawner.spawn(&cmd(&[]), &gone, SIZE, sink).err().expect("spawn must fail");

    assert_eq!(err.kind, ErrorKind::NotFound);
}

#[test]
fn non_ascii_output_is_not_mangled() {
    let mut run = start(&cmd(&["/C", "echo héllo wörld"]), &home());

    assert_eq!(run.wait_for_exit(), Some(0));
    assert!(run.output.contains("héllo wörld"), "output was: {:?}", run.output);
    assert!(!run.output.contains('\u{FFFD}'), "replacement character in: {:?}", run.output);
}
