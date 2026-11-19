use serde::{Deserialize, Serialize};

/// A shell the user can start a terminal with.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShellProfile {
    pub id: String,
    pub name: String,
    /// Absolute path of the executable.
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct TerminalSize {
    pub cols: u16,
    pub rows: u16,
}

impl TerminalSize {
    /// A PTY cannot have a zero dimension; treat it as the smallest real one.
    pub fn clamped(self) -> Self {
        Self { cols: self.cols.max(1), rows: self.rows.max(1) }
    }
}

/// What a running terminal reports to the frontend.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum TerminalEvent {
    Output { data: String },
    Exit { code: u32 },
}

/// Turns terminal output, which arrives in arbitrary byte chunks, into text.
/// A multi-byte character cut in half by a chunk boundary is held back until
/// the rest arrives, so it is never shown as a replacement character.
#[derive(Default)]
pub struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    pub fn push(&mut self, bytes: &[u8]) -> String {
        let mut data = std::mem::take(&mut self.pending);
        data.extend_from_slice(bytes);

        let mut text = String::with_capacity(data.len());
        let mut rest = data.as_slice();
        loop {
            match std::str::from_utf8(rest) {
                Ok(valid) => {
                    text.push_str(valid);
                    rest = &[];
                    break;
                }
                Err(err) => {
                    let (valid, after) = rest.split_at(err.valid_up_to());
                    text.push_str(&String::from_utf8_lossy(valid));
                    match err.error_len() {
                        // Bytes that can never be valid: replace them and carry on.
                        Some(len) => {
                            text.push(char::REPLACEMENT_CHARACTER);
                            rest = &after[len..];
                        }
                        // The start of a character whose remaining bytes have not arrived yet.
                        None => {
                            rest = after;
                            break;
                        }
                    }
                }
            }
        }
        self.pending = rest.to_vec();
        text
    }
}
