use serde::{Deserialize, Serialize};

/// Largest text file the editor will open.
pub const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

impl LineEnding {
    /// `Crlf` when the text contains at least one `\r\n`, otherwise `Lf`.
    pub fn detect(text: &str) -> Self {
        if text.contains("\r\n") { Self::Crlf } else { Self::Lf }
    }

    /// Rewrite every line break in `text` to this ending.
    pub fn apply(self, text: &str) -> String {
        let normalized = text.replace("\r\n", "\n");
        match self {
            Self::Lf => normalized,
            Self::Crlf => normalized.replace('\n', "\r\n"),
        }
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub text: String,
    pub line_ending: LineEnding,
}
