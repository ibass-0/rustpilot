# RustPilot Fase 3 G2 (Commit workflow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Panel Commit menjadi alat kerja lengkap per repository: grup Merge/Staged/Changes/Untracked, tampilan daftar atau pohon, multi-pilih, stage/unstage/discard (dengan konfirmasi), kotak pesan commit dengan riwayat dan validasi, Commit, Amend, Sign-off, dan error hook yang terbaca.

**Spec:** `docs/superpowers/specs/2026-11-20-rustpilot-fase-3-git-design.md` (G2). "Commit & Push" ditambahkan di G6 bersama push.

## Constraints

- `CLAUDE.md`: clean architecture, tes dulu, bahasa Inggris di kode/UI, commit satu baris tanpa atribusi.
- Pesan commit lewat file sementara (`-F`), tidak pernah argumen; hooks tidak dilewati (tanpa `--no-verify`); `GIT_EDITOR=:`.
- Path ke `restore`/`clean`/`add` selalu setelah `--`; path absolut atau berisi `..` ditolak.
- Discard tidak pernah berjalan tanpa konfirmasi yang menyebut jumlah file dan bahwa tidak bisa dibatalkan.

## Tasks

1. **Backend: use case dan adapter** (`application/git.rs`, `infrastructure/git_cli.rs`, `domain/ports.rs`, tes integrasi pada repo nyata): `commit(root, message, amend, sign_off)`, `discard(root, tracked, untracked)`, `stage_all`, `unstage_all`, `last_message`. Validasi: pesan kosong, NUL, tidak ada yang di-stage (kecuali amend), path tidak aman. Error commit = stderr + stdout (pesan hook dan "nothing to commit" tampil utuh).
2. **Perintah Tauri**: `git_commit`, `git_discard`, `git_stage_all`, `git_unstage_all`, `git_last_message`.
3. **Frontend port + gitStore**: `GitPort` baru, `commitInRepository`, `discardInRepository`, `stageAllInRepository`, `unstageAllInRepository`, `lastCommitMessage`.
4. **commitStore** (per repository): draft pesan, opsi amend/sign-off, riwayat 20 pesan terakhir (StoragePort), validasi di domain (`validateCommit`), amend mengisi pesan commit terakhir, draft dikosongkan setelah sukses, error tampil per repository.
5. **UI**: textarea pesan + tombol Commit + Amend + Sign-off di tiap repository; grup Untracked; daftar ↔ pohon; multi-pilih (Ctrl/Shift) dengan menu klik-kanan (Stage, Unstage, Discard, Open Diff, Open File); dialog konfirmasi discard; `Ctrl+Enter` mengirim; riwayat pesan lewat tombol panah.
6. **Verifikasi + commit** per bagian (backend, frontend).
