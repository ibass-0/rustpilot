# Plan 09: Workspace Settings

## Goal

Allow each project to customize the editor without global configuration noise.

## Scope

- Read and validate `.rustpilot/settings.json`.
- Configure tab size, spaces/tabs, autosave, exclusions, theme, and terminal.
- Add a small Settings UI with reset-to-default.
- Ignore malformed settings with a visible warning.

## Acceptance

- Invalid values fall back individually to defaults.
- Settings are applied on workspace open and do not leak between projects.

## Commit

`feat: add workspace settings`
