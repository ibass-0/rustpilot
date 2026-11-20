# Plan 08: Project Task Runner — Complete

## Goal

Run common project commands without manually typing them each time.

## Scope

- Read `.rustpilot/tasks.json`.
- Define label, command, working directory, and environment.
- Run a task in the Run panel or terminal.
- Stop the active task and rerun the last task.
- Stream output and exit code.

## Acceptance

- Commands use argument-safe process spawning where possible.
- A task cannot accidentally run outside its configured workspace.
- Errors identify the task and exit code.

## Commit

`feat: add project task runner`
