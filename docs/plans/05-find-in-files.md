# Plan 05: Find in Files

## Goal

Search and replace across the workspace.

## Scope

- `Ctrl+Shift+F` opens the search panel.
- Plain text, case-sensitive, whole-word, and regex modes.
- Group results by file with line preview.
- Click a result opens the file at the matching line and column.
- Add replace one and replace all with confirmation.

## Acceptance

- Search is cancellable and does not freeze the UI.
- Excluded folders are never searched.
- Replacing creates one undoable change per file.

## Commit

`feat: add workspace search`
