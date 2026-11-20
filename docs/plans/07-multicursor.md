# Plan 07: Multi-cursor Editing — Complete

## Goal

Support high-leverage keyboard editing workflows.

## Scope

- [x] Alt-click adds a cursor through CodeMirror's native multiple-selection support.
- [x] `Ctrl+D` selects the next occurrence.
- [x] Select all occurrences of the current selection (`Ctrl+Shift+L`).
- [ ] Add keyboard-only line cursors.
- Preserve CodeMirror undo grouping.

## Acceptance

- Multiple cursors render clearly in the active editor theme.
- Save, undo, redo, and dirty tracking work as one coherent edit.

## Commit

`feat: add multi-cursor editing`
