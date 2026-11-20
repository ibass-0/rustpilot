//! Which Git files signal a change in a repository, and how bursts of events are folded into one signal.

use std::path::{Component, Path};

/// Whether a change to `path`, given relative to a Git folder, means the repository state changed.
/// Objects, logs, hooks and lock files do not.
pub fn is_relevant(path: &Path) -> bool {
    let names: Vec<String> = path
        .components()
        .filter_map(|c| match c {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    let Some(first) = names.first() else {
        return false;
    };
    if names.iter().any(|n| n.ends_with(".lock")) {
        return false;
    }
    match first.as_str() {
        "HEAD" | "index" | "packed-refs" | "config" | "MERGE_HEAD" | "CHERRY_PICK_HEAD" | "REVERT_HEAD" | "REBASE_HEAD" => {
            names.len() == 1
        }
        "refs" | "rebase-merge" | "rebase-apply" => true,
        _ => false,
    }
}

/// Folds a burst of events into one signal, given once nothing has happened for `delay_ms`.
/// Time is passed in, so this stays pure.
pub struct Debouncer {
    delay_ms: u64,
    last_event: Option<u64>,
}

impl Debouncer {
    pub fn new(delay_ms: u64) -> Self {
        Self { delay_ms, last_event: None }
    }

    pub fn record(&mut self, now_ms: u64) {
        self.last_event = Some(now_ms);
    }

    /// True once, when events were recorded and the quiet period is over.
    pub fn take_due(&mut self, now_ms: u64) -> bool {
        match self.last_event {
            Some(last) if now_ms.saturating_sub(last) >= self.delay_ms => {
                self.last_event = None;
                true
            }
            _ => false,
        }
    }
}
