# Plan 11: Lightweight Feature-Rich Splash Screen

> Ide ini ringan secara teknis, tetapi memberi kesan pertama yang lengkap:
> RustPilot tampil cepat, menjelaskan apa yang sedang disiapkan, dan tetap
> membantu pengguna jika startup mengalami masalah.

## Opening copy

**RustPilot**

*A lightweight editor with a complete developer workflow.*

Preparing your workspace…

The splash should communicate that RustPilot is intentionally lightweight while
still providing a full editing experience: project navigation, fast search,
terminal, tasks, recovery, and source-control tooling.

## Goal

Show a polished startup surface before the main editor becomes interactive,
without delaying the application unnecessarily.

## Scope

- Add a dedicated splash window in Tauri.
- Use the RustPilot mark, name, version, and opening copy.
- Show a subtle progress indicator and current startup step.
- Keep the visual language consistent with the editor islands and orange accent.
- Close the splash only after the main window is ready.
- Avoid displaying secrets, workspace paths, or noisy logs.

## Startup steps

Display short, user-readable states:

1. Starting RustPilot.
2. Loading editor services.
3. Restoring the last workspace.
4. Preparing terminal and project tools.
5. Ready.

The progress is informational rather than a false percentage. Each step should
be driven by an actual lifecycle event where possible.

## Error and recovery behavior

- If the workspace cannot be restored, continue to the editor and show the
  normal Open Folder state.
- If a non-critical service fails, close the splash and show a notification in
  the main window.
- If the main window cannot initialize, keep the splash visible with a concise
  error and a Retry button.
- Never trap the user in a splash with no action.

## Technical design

- Add a splash window in `tauri.conf.json` or create it during the Tauri setup.
- Keep the splash HTML/CSS independent from the main SolidJS application so it
  can render before the full bundle is ready.
- Send startup progress events from Rust/Tauri to the splash window.
- Signal `startup-ready` from the main window only after ports, layout, and
  workspace restoration have been initialized.
- Close the splash from the backend after receiving `startup-ready`.
- Use a short maximum fallback timeout so a stale event cannot leave the splash
  open forever.

## Visual direction

- Compact centered card or frameless rounded window.
- RustPilot logo mark at the top.
- Dark background with the existing rust-orange accent.
- One-line status message.
- Thin progress bar or animated dot indicator.
- Version in the lower corner.
- Respect reduced-motion preferences.

## Acceptance criteria

- The splash appears immediately when launching the desktop app.
- The main window never flashes unstyled content behind it.
- The splash closes automatically when startup is ready.
- Retry is available for fatal initialization errors.
- Startup remains fast on a workspace with many files.
- `cargo test`, frontend tests, and production build remain green.

## Delivery steps

1. Add static splash window and visual design.
2. Wire startup-ready event from the main window.
3. Add real startup progress messages.
4. Add fatal-error and Retry state.
5. Add reduced-motion and timeout fallback.
6. Test cold launch, restored workspace, missing Git, and failed services.

## Commit

`feat: add lightweight startup splash screen`
