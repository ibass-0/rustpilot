use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};

use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::{EventSink, PtySession, PtySpawner};
use crate::domain::terminal::{ShellProfile, TerminalEvent, TerminalSize};
use crate::domain::terminal::Utf8Stream;

/// `PtySpawner` on top of the platform pseudo terminal (ConPTY on Windows).
pub struct PortablePtySpawner;

/// The terminal end of the PTY. Shared so that whichever comes first, the
/// shell exiting or the session being killed, can release it.
type SharedMaster = Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>;

struct PortablePtySession {
    master: SharedMaster,
    writer: Option<Box<dyn Write + Send>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

fn pty_size(size: TerminalSize) -> PtySize {
    PtySize { rows: size.rows, cols: size.cols, pixel_width: 0, pixel_height: 0 }
}

fn io_error(context: &str, err: impl std::fmt::Display) -> AppError {
    AppError::new(ErrorKind::Io, format!("{context}: {err}"))
}

fn exited() -> AppError {
    AppError::new(ErrorKind::Io, "the terminal has exited")
}

/// Dropping the master closes the pseudo console, which ends the reader thread.
fn release(master: &SharedMaster) {
    let taken = master.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).take();
    drop(taken);
}

impl PtySpawner for PortablePtySpawner {
    fn spawn(
        &self,
        profile: &ShellProfile,
        cwd: &Path,
        size: TerminalSize,
        events: EventSink,
    ) -> Result<Box<dyn PtySession>, AppError> {
        if !Path::new(&profile.program).is_file() {
            return Err(AppError::new(ErrorKind::NotFound, format!("{} was not found", profile.program)));
        }
        if !cwd.is_dir() {
            return Err(AppError::new(
                ErrorKind::NotFound,
                format!("the folder {} does not exist", cwd.display()),
            ));
        }

        let pair = native_pty_system()
            .openpty(pty_size(size))
            .map_err(|err| io_error("could not open a terminal", err))?;

        let mut command = CommandBuilder::new(&profile.program);
        command.args(&profile.args);
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");

        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|err| io_error(&format!("could not start {}", profile.name), err))?;
        // The shell holds its own handle to the slave side; ours is no longer needed.
        drop(pair.slave);

        let killer = child.clone_killer();
        let mut reader =
            pair.master.try_clone_reader().map_err(|err| io_error("could not read from the terminal", err))?;
        let writer = pair.master.take_writer().map_err(|err| io_error("could not write to the terminal", err))?;
        let master: SharedMaster = Arc::new(Mutex::new(Some(pair.master)));

        let events = Arc::new(events);

        let output = Arc::clone(&events);
        let reading = thread::spawn(move || {
            let mut decoder = Utf8Stream::default();
            let mut buffer = [0u8; 16 * 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        let data = decoder.push(&buffer[..count]);
                        if !data.is_empty() {
                            output(TerminalEvent::Output { data });
                        }
                    }
                }
            }
        });

        let shared = Arc::clone(&master);
        thread::spawn(move || {
            let code = child.wait().map(|status| status.exit_code()).unwrap_or(1);
            // Closing the pseudo console flushes what the shell printed last and
            // ends the reader, so every bit of output is delivered before `Exit`.
            release(&shared);
            let _ = reading.join();
            events(TerminalEvent::Exit { code });
        });

        Ok(Box::new(PortablePtySession { master, writer: Some(writer), killer }))
    }
}

impl PtySession for PortablePtySession {
    fn write(&mut self, data: &[u8]) -> Result<(), AppError> {
        let writer = self.writer.as_mut().ok_or_else(exited)?;
        writer.write_all(data).and_then(|()| writer.flush()).map_err(|err| io_error("terminal input failed", err))
    }

    fn resize(&mut self, size: TerminalSize) -> Result<(), AppError> {
        let guard = self.master.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let master = guard.as_ref().ok_or_else(exited)?;
        master.resize(pty_size(size)).map_err(|err| io_error("terminal resize failed", err))
    }

    fn kill(&mut self) {
        // Killing a shell that already exited fails harmlessly.
        let _ = self.killer.kill();
        self.writer = None;
        release(&self.master);
    }
}

impl Drop for PortablePtySession {
    fn drop(&mut self) {
        self.kill();
    }
}
