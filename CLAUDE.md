# RustPilot

Code editor desktop ringan ala JetBrains di atas Tauri 2 + SolidJS + CodeMirror 6. Windows 11 saja.

## Git rules

- Commit message: exactly one line, in English, Conventional Commits style (`feat: ...`, `fix: ...`, `chore: ...`). No body.
- No attribution trailers: never add `Co-Authored-By`, "Generated with Claude Code", or any Anthropic/AI credit to commits, pushes, or PR descriptions.
- `docs/` is local-only planning material and must never be committed (it is in `.gitignore`).

## Commands

Run `make help` for the full list. Common: `make dev`, `make test`, `make check`, `make build`.

## Code rules

- Package manager: pnpm only.
- `invoke` may only be called from `src/ipc/`.
- Plain CSS with CSS variables from `src/styles/tokens.css`. No Tailwind, no UI component library, no bundled fonts.
- All JSON fields crossing IPC use camelCase.
- Rust file access lives in pure functions in `src-tauri/src/fs/core.rs`; Tauri commands are thin wrappers.
