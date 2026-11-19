//! Shell detection rules, exercised against a fake machine.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use rustpilot_lib::application::terminal::available_shells;
use rustpilot_lib::domain::ports::ProgramLocator;

#[derive(Default)]
struct FakeLocator {
    on_path: HashMap<String, PathBuf>,
    files: HashSet<PathBuf>,
    env: HashMap<String, String>,
}

impl FakeLocator {
    fn with_path(mut self, exe: &str, location: &str) -> Self {
        self.on_path.insert(exe.to_string(), PathBuf::from(location));
        self
    }
    fn with_file(mut self, path: &str) -> Self {
        self.files.insert(PathBuf::from(path));
        self
    }
    fn with_env(mut self, name: &str, value: &str) -> Self {
        self.env.insert(name.to_string(), value.to_string());
        self
    }
    fn windows_dirs(self) -> Self {
        self.with_env("ProgramFiles", r"C:\Program Files")
            .with_env("ProgramFiles(x86)", r"C:\Program Files (x86)")
            .with_env("LocalAppData", r"C:\Users\me\AppData\Local")
    }
}

impl ProgramLocator for FakeLocator {
    fn find_in_path(&self, exe: &str) -> Option<PathBuf> {
        self.on_path.get(exe).cloned()
    }
    fn exists(&self, path: &Path) -> bool {
        self.files.contains(path)
    }
    fn env(&self, name: &str) -> Option<String> {
        self.env.get(name).cloned()
    }
}

fn ids(locator: &FakeLocator) -> Vec<String> {
    available_shells(locator).into_iter().map(|s| s.id).collect()
}

#[test]
fn lists_shells_in_preference_order() {
    let locator = FakeLocator::default()
        .windows_dirs()
        .with_path("wsl.exe", r"C:\Windows\System32\wsl.exe")
        .with_path("cmd.exe", r"C:\Windows\System32\cmd.exe")
        .with_path("powershell.exe", r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
        .with_path("pwsh.exe", r"C:\Program Files\PowerShell\7\pwsh.exe")
        .with_file(r"C:\Program Files\Git\bin\bash.exe");

    assert_eq!(ids(&locator), ["pwsh", "powershell", "cmd", "git-bash", "wsl"]);
}

#[test]
fn skips_shells_that_are_not_installed() {
    let locator = FakeLocator::default().windows_dirs().with_path("cmd.exe", r"C:\Windows\System32\cmd.exe");

    let shells = available_shells(&locator);

    assert_eq!(shells.len(), 1);
    assert_eq!(shells[0].id, "cmd");
    assert_eq!(shells[0].name, "Command Prompt");
    assert_eq!(shells[0].program, r"C:\Windows\System32\cmd.exe");
    assert!(shells[0].args.is_empty());
}

#[test]
fn git_bash_is_found_in_program_files_not_on_path() {
    // `bash.exe` on PATH is the WSL launcher on a stock Windows; it is not Git Bash.
    let wsl_only = FakeLocator::default().windows_dirs().with_path("bash.exe", r"C:\Windows\System32\bash.exe");
    assert!(!ids(&wsl_only).contains(&"git-bash".to_string()));

    let with_git = wsl_only.with_file(r"C:\Program Files\Git\bin\bash.exe");
    let shells = available_shells(&with_git);
    let git_bash = shells.iter().find(|s| s.id == "git-bash").expect("git-bash profile");
    assert_eq!(git_bash.name, "Git Bash");
    assert_eq!(git_bash.program, r"C:\Program Files\Git\bin\bash.exe");
    assert_eq!(git_bash.args, ["--login", "-i"]);
}

#[test]
fn git_bash_falls_back_to_per_user_install() {
    let locator = FakeLocator::default()
        .windows_dirs()
        .with_file(r"C:\Users\me\AppData\Local\Programs\Git\bin\bash.exe");

    let shells = available_shells(&locator);

    assert_eq!(shells.len(), 1);
    assert_eq!(shells[0].program, r"C:\Users\me\AppData\Local\Programs\Git\bin\bash.exe");
}

#[test]
fn git_bash_prefers_the_machine_wide_install() {
    let locator = FakeLocator::default()
        .windows_dirs()
        .with_file(r"C:\Users\me\AppData\Local\Programs\Git\bin\bash.exe")
        .with_file(r"C:\Program Files\Git\bin\bash.exe");

    let shells = available_shells(&locator);

    assert_eq!(shells.len(), 1);
    assert_eq!(shells[0].program, r"C:\Program Files\Git\bin\bash.exe");
}

#[test]
fn no_shells_gives_an_empty_list() {
    assert!(available_shells(&FakeLocator::default()).is_empty());
}

#[test]
fn powershell_profiles_start_without_the_logo() {
    let locator = FakeLocator::default()
        .with_path("powershell.exe", r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
        .with_path("pwsh.exe", r"C:\Program Files\PowerShell\7\pwsh.exe");

    let shells = available_shells(&locator);

    assert_eq!(shells[0].name, "PowerShell");
    assert_eq!(shells[1].name, "Windows PowerShell");
    assert!(shells.iter().all(|s| s.args == ["-NoLogo"]));
}
