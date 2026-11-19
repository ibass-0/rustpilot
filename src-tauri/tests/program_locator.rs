//! The real program locator, checked against this machine.

use std::path::Path;

use rustpilot_lib::domain::ports::ProgramLocator;
use rustpilot_lib::infrastructure::program_locator::SystemProgramLocator;

#[test]
fn finds_cmd_on_the_real_path() {
    let found = SystemProgramLocator.find_in_path("cmd.exe").expect("cmd.exe is on PATH");
    assert!(found.is_absolute());
    assert!(found.is_file());
}

#[test]
fn a_missing_program_is_none() {
    assert!(SystemProgramLocator.find_in_path("rp-definitely-not-a-program.exe").is_none());
}

#[test]
fn a_directory_on_path_is_not_a_program() {
    // `System32` holds a `drivers` folder; a folder must never be reported as an executable.
    assert!(SystemProgramLocator.find_in_path("drivers").is_none());
}

#[test]
fn exists_and_env_reflect_the_system() {
    let locator = SystemProgramLocator;
    let comspec = locator.env("ComSpec").expect("ComSpec is set");
    assert!(locator.exists(Path::new(&comspec)));
    assert!(!locator.exists(Path::new(r"C:\no\such\file.exe")));
    assert!(locator.env("RP_DEFINITELY_NOT_SET").is_none());
}
