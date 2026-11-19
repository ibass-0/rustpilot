//! File use cases exercised against the real local file system.
use std::fs;
use std::path::Path;

use rustpilot_lib::application::fs::{list_dir, read_text_file, write_text_file};
use rustpilot_lib::domain::error::ErrorKind;
use rustpilot_lib::domain::fs::{LineEnding, MAX_FILE_BYTES};
use rustpilot_lib::infrastructure::local_fs::LocalFileSystem;
use tempfile::tempdir;

const FS: LocalFileSystem = LocalFileSystem;

#[test]
fn list_dir_sorts_dirs_first_case_insensitive() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("b.txt"), "").unwrap();
    fs::write(dir.path().join("A.txt"), "").unwrap();
    fs::create_dir(dir.path().join("zeta")).unwrap();
    fs::create_dir(dir.path().join("Alpha")).unwrap();
    fs::write(dir.path().join(".env"), "").unwrap();

    let entries = list_dir(&FS, dir.path()).unwrap();

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

    let entries = list_dir(&FS, dir.path()).unwrap();

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "sub");
}

#[test]
fn list_dir_missing_path_is_not_found() {
    let dir = tempdir().unwrap();
    let err = list_dir(&FS, &dir.path().join("nope")).unwrap_err();
    assert_eq!(err.kind, ErrorKind::NotFound);
}

#[test]
fn read_detects_crlf() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.txt");
    fs::write(&p, b"a\r\nb\r\n").unwrap();
    let c = read_text_file(&FS, &p).unwrap();
    assert_eq!(c.line_ending, LineEnding::Crlf);
    assert_eq!(c.text, "a\r\nb\r\n");
}

#[test]
fn read_detects_lf() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.txt");
    fs::write(&p, b"a\nb\n").unwrap();
    assert_eq!(read_text_file(&FS, &p).unwrap().line_ending, LineEnding::Lf);
}

#[test]
fn read_empty_file_is_lf() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.txt");
    fs::write(&p, b"").unwrap();
    let c = read_text_file(&FS, &p).unwrap();
    assert_eq!(c.text, "");
    assert_eq!(c.line_ending, LineEnding::Lf);
}

#[test]
fn read_rejects_non_utf8() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.bin");
    fs::write(&p, [0xff, 0xfe, 0x00]).unwrap();
    assert_eq!(read_text_file(&FS, &p).unwrap_err().kind, ErrorKind::NotUtf8);
}

#[test]
fn read_rejects_too_large() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("big.log");
    fs::File::create(&p).unwrap().set_len(MAX_FILE_BYTES + 1).unwrap();
    assert_eq!(read_text_file(&FS, &p).unwrap_err().kind, ErrorKind::TooLarge);
}

#[test]
fn write_preserves_crlf() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.txt");
    write_text_file(&FS, &p, "a\nb\n", LineEnding::Crlf).unwrap();
    assert_eq!(fs::read(&p).unwrap(), b"a\r\nb\r\n");
}

#[test]
fn write_does_not_double_cr() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.txt");
    write_text_file(&FS, &p, "a\r\nb", LineEnding::Crlf).unwrap();
    assert_eq!(fs::read(&p).unwrap(), b"a\r\nb");
}

#[test]
fn write_lf_strips_cr() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.txt");
    write_text_file(&FS, &p, "a\r\nb", LineEnding::Lf).unwrap();
    assert_eq!(fs::read(&p).unwrap(), b"a\nb");
}

#[test]
fn write_to_missing_dir_is_not_found() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("nope").join("f.txt");
    let err = write_text_file(&FS, &p, "x", LineEnding::Lf).unwrap_err();
    assert_eq!(err.kind, ErrorKind::NotFound);
}

#[test]
fn write_keeps_a_lone_carriage_return() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("f.txt");
    write_text_file(&FS, &p, "10%\r20%\ndone", LineEnding::Crlf).unwrap();
    assert_eq!(fs::read(&p).unwrap(), b"10%\r20%\r\ndone");
}
