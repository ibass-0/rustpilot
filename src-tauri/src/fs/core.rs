//! Akses file murni tanpa Tauri. Dipanggil perintah Tauri sekarang dan tool
//! agent nanti.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, ErrorKind};

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

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub text: String,
    pub line_ending: LineEnding,
}

/// Isi satu tingkat folder: folder dulu, lalu file, urut nama tanpa
/// membedakan huruf besar-kecil.
pub fn list_dir(path: &Path) -> Result<Vec<DirEntry>, AppError> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        // `metadata` mengikuti symlink/junction, jadi tautan ke folder tampil
        // sebagai folder; tautan rusak jatuh ke `file_type`.
        let is_dir = match std::fs::metadata(entry.path()) {
            Ok(meta) => meta.is_dir(),
            Err(_) => entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        };
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));
    Ok(entries)
}

pub fn read_text_file(path: &Path) -> Result<FileContent, AppError> {
    let size = std::fs::metadata(path)?.len();
    if size > MAX_FILE_BYTES {
        return Err(AppError::new(
            ErrorKind::TooLarge,
            format!("ukuran file {size} byte melebihi batas {MAX_FILE_BYTES} byte"),
        ));
    }
    let bytes = std::fs::read(path)?;
    let text = String::from_utf8(bytes)
        .map_err(|_| AppError::new(ErrorKind::NotUtf8, "file bukan teks UTF-8"))?;
    let line_ending = if text.contains("\r\n") { LineEnding::Crlf } else { LineEnding::Lf };
    Ok(FileContent { text, line_ending })
}

pub fn write_text_file(path: &Path, text: &str, line_ending: LineEnding) -> Result<(), AppError> {
    let normalized = text.replace("\r\n", "\n");
    let out = match line_ending {
        LineEnding::Lf => normalized,
        LineEnding::Crlf => normalized.replace('\n', "\r\n"),
    };
    std::fs::write(path, out)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorKind;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn list_dir_sorts_dirs_first_case_insensitive() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("b.txt"), "").unwrap();
        fs::write(dir.path().join("A.txt"), "").unwrap();
        fs::create_dir(dir.path().join("zeta")).unwrap();
        fs::create_dir(dir.path().join("Alpha")).unwrap();
        fs::write(dir.path().join(".env"), "").unwrap();

        let entries = list_dir(dir.path()).unwrap();

        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        let dirs: Vec<bool> = entries.iter().map(|e| e.is_dir).collect();
        assert_eq!(names, ["Alpha", "zeta", ".env", "A.txt", "b.txt"]);
        assert_eq!(dirs, [true, true, false, false, false]);
        assert!(Path::new(&entries[0].path).is_absolute());
        assert_eq!(Path::new(&entries[0].path), dir.path().join("Alpha"));
    }

    #[test]
    fn list_dir_is_not_recursive() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub").join("inner.txt"), "").unwrap();

        let entries = list_dir(dir.path()).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "sub");
    }

    #[test]
    fn list_dir_missing_path_is_not_found() {
        let dir = tempdir().unwrap();
        let err = list_dir(&dir.path().join("nope")).unwrap_err();
        assert_eq!(err.kind, ErrorKind::NotFound);
    }

    #[test]
    fn read_detects_crlf() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.txt");
        fs::write(&p, b"a\r\nb\r\n").unwrap();
        let c = read_text_file(&p).unwrap();
        assert_eq!(c.line_ending, LineEnding::Crlf);
        assert_eq!(c.text, "a\r\nb\r\n");
    }

    #[test]
    fn read_detects_lf() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.txt");
        fs::write(&p, b"a\nb\n").unwrap();
        assert_eq!(read_text_file(&p).unwrap().line_ending, LineEnding::Lf);
    }

    #[test]
    fn read_empty_file_is_lf() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.txt");
        fs::write(&p, b"").unwrap();
        let c = read_text_file(&p).unwrap();
        assert_eq!(c.text, "");
        assert_eq!(c.line_ending, LineEnding::Lf);
    }

    #[test]
    fn read_rejects_non_utf8() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.bin");
        fs::write(&p, [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read_text_file(&p).unwrap_err().kind, ErrorKind::NotUtf8);
    }

    #[test]
    fn read_rejects_too_large() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("big.log");
        fs::File::create(&p).unwrap().set_len(MAX_FILE_BYTES + 1).unwrap();
        assert_eq!(read_text_file(&p).unwrap_err().kind, ErrorKind::TooLarge);
    }

    #[test]
    fn write_preserves_crlf() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.txt");
        write_text_file(&p, "a\nb\n", LineEnding::Crlf).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"a\r\nb\r\n");
    }

    #[test]
    fn write_does_not_double_cr() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.txt");
        write_text_file(&p, "a\r\nb", LineEnding::Crlf).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"a\r\nb");
    }

    #[test]
    fn write_lf_strips_cr() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("f.txt");
        write_text_file(&p, "a\r\nb", LineEnding::Lf).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"a\nb");
    }

    #[test]
    fn write_to_missing_dir_is_not_found() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("nope").join("f.txt");
        let err = write_text_file(&p, "x", LineEnding::Lf).unwrap_err();
        assert_eq!(err.kind, ErrorKind::NotFound);
    }
}
