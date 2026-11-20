# Plan 02: Quick Open — Complete

## Goal

Open any workspace file quickly, like VS Code `Ctrl+P`.

## Scope

- `Ctrl+P` opens a modal file picker.
- Recursively index workspace files while excluding `.git`, `node_modules`,
  `target`, and configured exclusions.
- Fuzzy matching by filename and relative path.
- Show parent path and keyboard selection.
- Enter opens the file; Escape closes the picker.

## Acceptance

- Results appear incrementally for large workspaces.
- Selecting a result opens or activates one editor tab.
- The index refreshes after external file changes.

## Commit

`feat: add quick file picker`
