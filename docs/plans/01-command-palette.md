# Plan 01: Command Palette

## Goal

Make every important RustPilot action discoverable from one keyboard-first UI.

## Scope

- `Ctrl+Shift+P` opens a searchable command overlay.
- Register commands with id, label, shortcut, and action.
- Fuzzy filter and keyboard navigation with arrows, Enter, and Escape.
- Initial commands: save, close tab, open folder, quick open, search, terminal,
  project panel, Git panel, reload workspace, and theme toggle.

## Acceptance

- Opening the palette never loses editor focus or terminal input.
- Every listed command can be run without the mouse.
- Unknown text gives an empty state.

## Commit

`feat: add command palette`
