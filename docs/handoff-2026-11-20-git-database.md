# Handoff: Database (Fase 2) dan Git (Fase 3), 2026-11-20

Ditulis saat pemilik meminta agent lain melanjutkan. Acuan: `docs/superpowers/specs/2026-11-20-rustpilot-fase-2-database-design.md` dan `...-fase-3-git-design.md`, plan di `docs/superpowers/plans/`.

## Aturan proyek (CLAUDE.md, wajib)

- Commit satu baris bahasa Inggris, Conventional Commits, tanpa trailer/atribusi apa pun. `docs/` tidak pernah di-commit.
- Tes di `tests/` dan `src-tauri/tests/`, tulis tes gagal dulu. Kode, komentar, teks UI bahasa Inggris. pnpm saja.
- Working tree dipakai beberapa sesi (SSH, Docker, indent guide, dll.): **commit hanya berkas milik sendiri dengan `git commit -m "..." -- <path...>`**, jangan `git add -A`.
- Ikon: hanya Lucide / material-icon-theme, tanpa logo merek.
- Peringatan alat: heredoc shell merusak backslash dan backtick; tulis berkas berisi `\` atau `` ` `` dengan Write/Edit, bukan `cat <<EOF` atau skrip Python tanpa kutip.

## Selesai dan sudah di-commit

- Database: 2A.1 SQLite, 2A.2 PostgreSQL/MySQL/MariaDB + Credential Manager, 2A.2b lencana provider/grup/environment/warna.
- Git G1 multi-project (workspace multi-root, state per repository, watcher `.git`, title bar repo + branch).
- Git G2 commit workflow (pesan, amend, sign-off, discard, stage all, tampilan pohon).
- Git G3 diff per hunk (Stage/Unstage/Revert, unified + side-by-side via `@codemirror/merge`). **Belum**: penanda baris berubah di gutter editor + peek.

## Pekerjaan terakhir: G4a Git Graph, backend SELESAI tapi BELUM di-commit

Berkas (semua di working tree, belum di-commit):

- Baru: `src-tauri/src/domain/git_graph.rs` (tipe + `layout_graph` lane murni), `src-tauri/src/application/git_log.rs` (log, details, compare, refs), `src-tauri/tests/git_graph.rs` (11 tes lulus), `src-tauri/tests/git_log.rs` (23 tes lulus).
- Diubah: `application/git.rs` (`validate_repository_path` jadi `pub`), `application/mod.rs`, `domain/mod.rs`, `domain/ports.rs` (method `query`), `infrastructure/git_cli.rs` (`query`), `presentation/commands.rs` dan `lib.rs` (perintah baru), `tests/git_status.rs` (stub `query`).
- Perintah dan wiring terakhir dijalankan lewat skrip yang **diinterupsi**: periksa `commands.rs` dan `lib.rs` sudah memuat `git_log`, `git_commit_details`, `git_commit_file_diff`, `git_compare_files`, `git_compare_file_diff`, `git_refs` (di `generate_handler!` dan fungsinya) dan `use crate::application::git_log::{...}`. Jika ada yang kurang, tambahkan. `lib.rs` dan `commands.rs` juga mungkin berisi perubahan Docker milik sesi lain: **jangan ikut di-commit bagian Docker**.
- Langkah berikut: `cd src-tauri && cargo test` (semua harus hijau), lalu commit: `git commit -m "feat: Git log with graph lanes, commit details and comparison" -- <berkas milik G4a>`. Bila `lib.rs`/`commands.rs` bercampur dengan Docker, gunakan `git add -p`-setara (staging manual per hunk tidak bisa interaktif di sini: pisahkan dengan menunggu sesi Docker commit lebih dulu, atau commit seluruh berkas bila pemilik setuju).

## Sisa pekerjaan

1. **G4a frontend**: `GitPort` (`log`, `commitDetails`, `commitFileDiff`, `compareFiles`, `compareFileDiff`, `refs`) + adapter `infrastructure/tauri/git.ts` + fake `tests/helpers/ports.ts`; `gitLogStore` (halaman 500, `laneState` dari jawaban, filter, pencarian, seleksi commit, detail, bandingkan dua commit, refresh dari watcher); UI tab **Graph** di tool window Git (bawah): daftar virtual, SVG lane per baris dari `GraphRow` (`incoming`/`through`/`outgoing`, `color` = indeks palet, `width`), label ref, kolom author/tanggal/hash, panel detail + daftar file (klik → diff via `diffStore`), menu klik-kanan (Copy hash/subject dulu; checkout/branch/tag/cherry-pick/revert/reset menyusul di G5/G7), pemilih repository + "All repositories" (log gabungan tanpa lane).
2. **G4b Blame**: `git blame --porcelain` (+ `--contents -` untuk isi buffer), parser di `domain/git_blame.rs`, blame inline baris aktif, annotate gutter, hover dengan aksi, author di atas deklarasi (Code Vision, memakai pohon Lezer seperti panel Structure), file history (`--follow`), line history (`git log -L`). Rincian di spec bagian "Blame".
3. **G5 Branch & tag**: branch popup (recent/local/remote/tag), checkout (smart checkout), new, rename, delete, merge, rebase, compare; serentak multi-repo.
4. **G6 Remote**: fetch/pull/push/sync dengan progres + batal (Tauri `Channel`), push dialog, publish branch, auto-fetch, tombol Commit & Push di panel Commit.
5. **G7**: konflik (editor tiga panel), continue/abort/skip merge-rebase-cherry-pick, stash, cherry-pick, revert, reset.
6. **G8**: interactive rebase, changelists, shelve, worktree manager.
7. Database tahap lanjut: 2A.3 SQL Server (`tiberius`), 2B table viewer/editor, 2C designer, 2D Redis, 2E Kafka, 2F RabbitMQ, 2G export/import, 2H ER diagram.
8. Tiap tahap: tulis plan singkat di `docs/superpowers/plans/`, tes dulu, commit per bagian, update status di spec.

## Catatan lingkungan

- `tsc --noEmit` memunculkan error di `src/application/sshStore.ts`, `src/presentation/layout/Stripe.tsx`, `src/infrastructure/codemirror/extensions.ts`: milik sesi lain, abaikan (filter dengan `grep -v`). `pnpm build` gagal karena itu; pakai `pnpm exec vite build` untuk cek ukuran bundle (JS awal terakhir ±190 KB gzip, batas 250).
- Disk D: sempat penuh. `src-tauri/Cargo.toml` kini `[profile.dev] debug = "line-tables-only"`; bila perlu hapus `src-tauri/target/release` dan `target/debug/incremental`.
- Server uji database terisolasi masih mungkin menyala: PostgreSQL :55432, MySQL :53306, MariaDB :53307 (password `pw`, data di folder scratchpad). Env tes: `RUSTPILOT_TEST_PG=postgres://postgres:pw@127.0.0.1:55432/postgres`, `RUSTPILOT_TEST_MYSQL=mysql://root:pw@127.0.0.1:53306/mysql`, `RUSTPILOT_TEST_MARIADB=mysql://root:pw@127.0.0.1:53307/mysql`. Tanpa env tes server dilewati. Matikan bila tidak dipakai.
- `sample.db` di root adalah berkas uji SQLite, tidak di-commit.
- Hasil tes terakhir yang diketahui: Vitest 638 lulus; Rust seluruhnya hijau sebelum G4a (G4a: 34 tes baru lulus).
