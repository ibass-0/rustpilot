# Plan 04: Autosave and Recovery

## Goal

Protect edits without surprising the user.

## Scope

- Autosave after an idle debounce and on window blur.
- Show saving/saved/failed state in the tab.
- Store recovery buffers for dirty documents.
- Offer Restore or Discard after an interrupted session.
- Preserve explicit Save behavior.

## Acceptance

- Concurrent saves for one file are serialized.
- A failed save leaves the document dirty and shows an actionable error.
- Recovery data is removed after a successful save.

## Commit

`feat: add autosave and editor recovery`
