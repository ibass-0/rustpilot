# Plan 04: Autosave and Recovery — Complete

## Goal

Protect edits without surprising the user.

## Scope

- [x] Autosave after an idle debounce and on window blur.
- [x] Store recovery buffers for dirty documents.
- [x] Offer Restore or Discard after an interrupted session.
- Preserve explicit Save behavior.

## Acceptance

- Concurrent saves for one file are serialized.
- A failed save leaves the document dirty and shows an actionable error.
- Recovery data is removed after a successful save.

## Commit

`feat: add autosave and editor recovery`
