# RustPilot

Lightweight desktop code editor with an islands interface built on Tauri 2 + SolidJS + CodeMirror 6. Windows 11 only.

## Git rules

- Commit message: exactly one line, in English, Conventional Commits style (`feat: ...`, `fix: ...`, `chore: ...`). No body.
- No attribution trailers: never add `Co-Authored-By`, "Generated with Claude Code", or any Anthropic/AI credit to commits, pushes, or PR descriptions.
- `docs/` is local-only planning material and must never be committed (it is in `.gitignore`).

## Commands

Run `make help` for the full list. Common: `make dev`, `make test`, `make check`, `make build`.

## Architecture

Clean architecture on both sides. Dependencies only point inwards: `domain` <- `application` <- `infrastructure` / `presentation`.

Frontend (`src/`):

- `domain/` - pure types and rules. No framework, no I/O.
- `application/` - state stores and use cases. Talks to the outside world only through the interfaces in `application/ports.ts`. May use `solid-js/store` for reactive state, nothing else.
- `infrastructure/` - adapters that implement the ports (`tauri/`, `storage/`, `codemirror/`). `invoke` may only be called from `infrastructure/tauri/`.
- `presentation/` - SolidJS components, styles, keyboard shortcuts.
- `index.tsx` - composition root; the only place that wires adapters into `configurePorts`.

Backend (`src-tauri/src/`):

- `domain/` - entities, `AppError`, and port traits.
- `application/` - use cases as plain functions taking a port (`&impl FileSystem`). No Tauri.
- `infrastructure/` - port implementations (`LocalFileSystem`).
- `presentation/` - thin `#[tauri::command]` wrappers.

## Tests

- Tests never live next to source files.
- Frontend: `tests/`, mirroring `src/` (`tests/application/layoutStore.test.ts`). Fakes for ports come from `tests/helpers/ports.ts`; do not `vi.mock` application modules.
- Rust: integration tests in `src-tauri/tests/`.
- Write the failing test first.

## Code rules

- Everything in the codebase is written in English: identifiers, comments, UI text, error messages, docs in the repo.
- Package manager: pnpm only.
- Plain CSS with CSS variables from `src/presentation/styles/tokens.css`. No Tailwind, no UI component library, no bundled fonts.
- File and folder icons come from the `material-icon-theme` package (MIT). `scripts/material-icons.mjs` copies them to `public/material-icons/` (ignored) and regenerates `src/infrastructure/material/manifest.generated.json` (committed); it runs before `vite` and `vite build`.
- Code font is Fira Code (system-installed), falling back to JetBrains Mono, Cascadia Code, Consolas.
- The look follows an "islands" layout (rounded panels on a frame, custom title bar) with our own palette built on the logo's rust orange.
- The window is frameless (`decorations: false`); window buttons and dragging live in `presentation/layout/TitleBar.tsx`.
- All JSON fields crossing IPC use camelCase.
