use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};

use crate::domain::error::{AppError, ErrorKind};
use crate::domain::ports::{EventSink, PtySession, PtySpawner};
use crate::domain::terminal::Utf8Stream;
use crate::domain::terminal::{ShellProfile, TerminalEvent, TerminalSize};

/// `PtySpawner` on top of the platform pseudo terminal (ConPTY on Windows).
pub struct PortablePtySpawner;

/// The terminal end of the PTY. Shared so that whichever comes first, the
/// shell exiting or the session being killed, can release it.
type SharedMaster = Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>;

/// How many output chunks may be in flight, sent but not yet drawn, before
/// the reader stops and lets the screen catch up.
const UNACKNOWLEDGED_WINDOW: u64 = 16;
/// A screen that stops acknowledging altogether (a reloaded page) must not
/// block the reader forever.
const STALL_LIMIT: Duration = Duration::from_secs(5);

/// Flow control between the reader thread and the screen that draws its
/// output. A shell can print far faster than a terminal can render; without
/// this, seconds of backlog pile up and Ctrl+C appears to do nothing.
#[derive(Default)]
struct Flow {
    sent: AtomicU64,
    acknowledged: AtomicU64,
    closed: AtomicBool,
}

impl Flow {
    /// Block while the screen is a full window behind.
    fn wait_for_room(&self) {
        let waiting_since = Instant::now();
        while self.sent.load(Ordering::Acquire) - self.acknowledged.load(Ordering::Acquire) >= UNACKNOWLEDGED_WINDOW
            && !self.closed.load(Ordering::Acquire)
            && waiting_since.elapsed() < STALL_LIMIT
        {
            thread::sleep(Duration::from_millis(2));
        }
    }

    /// The sequence number for the next chunk, counting from 1.
    fn next(&self) -> u64 {
        self.sent.fetch_add(1, Ordering::AcqRel) + 1
    }
}

struct PortablePtySession {
    master: SharedMaster,
    writer: Option<Box<dyn Write + Send>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    flow: Arc<Flow>,
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
        let flow = Arc::new(Flow::default());

        let output = Arc::clone(&events);
        let reader_flow = Arc::clone(&flow);
        let reading = thread::spawn(move || {
            let mut decoder = Utf8Stream::default();
            let mut buffer = [0u8; 16 * 1024];
            loop {
                reader_flow.wait_for_room();
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        let data = decoder.push(&buffer[..count]);
                        if !data.is_empty() {
                            output(TerminalEvent::Output { data, seq: reader_flow.next() });
                        }
                    }
                }
            }
        });

        let shared = Arc::clone(&master);
        let exit_flow = Arc::clone(&flow);
        thread::spawn(move || {
            let code = child.wait().map(|status| status.exit_code()).unwrap_or(1);
            // Whatever is still unread should arrive without waiting on the screen.
            exit_flow.closed.store(true, Ordering::Release);
            // Closing the pseudo console flushes what the shell printed last and
            // ends the reader, so every bit of output is delivered before `Exit`.
            release(&shared);
            let _ = reading.join();
            events(TerminalEvent::Exit { code });
        });

        Ok(Box::new(PortablePtySession { master, writer: Some(writer), killer, flow }))
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

    fn acknowledge(&mut self, seq: u64) {
        self.flow.acknowledged.fetch_max(seq, Ordering::AcqRel);
    }

    fn kill(&mut self) {
        // Killing a shell that already exited fails harmlessly.
        let _ = self.killer.kill();
        self.flow.closed.store(true, Ordering::Release);
        self.writer = None;
        release(&self.master);
    }
}

impl Drop for PortablePtySession {
    fn drop(&mut self) {
        self.kill();
    }
}
