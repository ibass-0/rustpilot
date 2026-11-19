# RustPilot

<img src="assets/logo.svg" alt="RustPilot logo" width="96" />

RustPilot is a lightweight desktop code editor with a JetBrains-style "islands" interface and a custom title bar, built on Tauri 2, SolidJS and CodeMirror 6. Phase 0 is the foundation: open a folder, browse the file tree, edit files in tabs and save them. The AI agent and the terminal arrive in later phases; their tool windows are already in place but empty. Windows 11 only for now.

## Running

Prerequisites: Rust (stable, MSVC toolchain), Node 22, pnpm, and GNU Make.

```
make install    # install frontend dependencies
make dev        # run the desktop app in dev mode
make test       # all tests (Vitest + cargo test)
make check      # typecheck TS + cargo check
make build      # release build; installer lands in installer/, build cache is removed
```

Without Make: `pnpm install`, `pnpm tauri dev`, `pnpm test`, and `cargo test` inside `src-tauri/`.

## Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+1` | Project tool window |
| `Alt+2` | AI Agent tool window |
| `Alt+F12` | Terminal tool window |
| `Ctrl+S` | Save the active tab |
| `Ctrl+W`, `Ctrl+F4` | Close the active tab |
| `Ctrl+F` | Find in the active file |

## Architecture

Clean architecture on both sides; dependencies only point inwards.

```
src/                      src-tauri/src/
  domain/                   domain/          entities, errors, ports
  application/              application/     use cases and state stores
  infrastructure/           infrastructure/  Tauri, storage, CodeMirror, std::fs
  presentation/             presentation/    SolidJS components / Tauri commands
  index.tsx                 lib.rs           composition roots
tests/                    src-tauri/tests/   all tests live here
```

## Credits

File and folder icons are from the [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT).

## Phase 0 baseline

Measured on the release build (`make build`), Windows 11, 2026-11-19.

| Metric | Target | Result |
|---|---|---|
| NSIS installer | ≤ 10 MB | 1.36 MB |
| Initial JS (gzip, language packages excluded) | ≤ 250 KB | 123 KB |
| Window shown after process start | ≤ 1 s | 0.03 s to window, 0.92 s to first paint (median of 7, range 0.73-1.51 s) |
| Idle memory, one folder and one file open, all processes including WebView2 | ≤ 200 MB | 419 MB working set (191 MB private) |

The idle memory target is missed. WebView2 runs six helper processes (browser, GPU, renderer, utilities) next to the 26 MB RustPilot process, and summing working sets counts the pages those processes share once per process; the private memory actually owned by the app is 191 MB. The WebView2 runtime is a fixed cost of the Tauri approach rather than something Phase 0 code controls.

First paint was measured while the machine was busy with other applications, which explains the spread; the slowest of the seven runs missed the 1 s target.
