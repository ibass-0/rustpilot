# Plan 03: Recent Files and Projects — Complete

## Goal

Make returning to recent work instant.

## Scope

- Persist recent files and workspace folders.
- Add Recent Files and Recent Projects commands.
- Keep a bounded, deduplicated history with pin and remove actions.
- Remove missing paths silently.
- Restore the last workspace and optionally its open tabs.

## Acceptance

- History survives restart and never exposes invalid paths.
- The most recently used item appears first.

## Commit

`feat: add recent files and projects`
