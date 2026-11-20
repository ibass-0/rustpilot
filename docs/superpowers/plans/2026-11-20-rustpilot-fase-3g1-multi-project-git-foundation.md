# RustPilot Fase 3 G1 (Fondasi Git multi-project) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspace bisa berisi banyak project; Git menemukan semua repository di dalamnya dan menyimpan state per repository; setiap aksi Git diarahkan ke repository pemilik file; status diperbarui otomatis; title bar menunjukkan repository + branch aktif; panel Commit dan dekorasi file bekerja untuk semua project.

**Architecture:** Model workspace berubah dari `root: string` menjadi `projects: Project[]`. `gitStore` berubah dari satu status gabungan menjadi registry `repositories: Record<repoId, RepositoryState>`. Routing path → repository adalah fungsi domain murni. Backend menambah deteksi jenis repository (biasa/submodule/worktree), versi Git, dan watcher metadata `.git` yang mengirim event ke frontend.

**Tech Stack:** Git CLI, crate `notify` (CC0/MIT/Apache), Tauri events, SolidJS store.

**Spec:** `docs/superpowers/specs/2026-11-20-rustpilot-fase-3-git-design.md` (tahap G1)

## Global Constraints

- Aturan `CLAUDE.md`: clean architecture, tes di `tests/` dan `src-tauri/tests/`, tes gagal ditulis dulu, semua kode/teks UI bahasa Inggris, commit satu baris bahasa Inggris tanpa atribusi, `docs/` tidak di-commit.
- Perintah Git: argumen array tanpa shell, `--` sebelum path, `GIT_OPTIONAL_LOCKS=0` untuk operasi baca, `GIT_TERMINAL_PROMPT=0`.
- Ikon tetap Lucide / material-icon-theme (memori `icons-fully-open-source`).
- Kompatibel ke belakang: workspace satu folder yang tersimpan (`rustpilot.workspace.v1`) dimigrasi menjadi workspace dengan satu project.
- Fitur lain yang memakai `workspace.root` (Find in Files, Quick Open, settings, terminal cwd, Structure) tetap jalan: mereka memakai **project pertama** sampai masing-masing diperbarui di plan lain; ini dicatat, bukan diubah diam-diam.

## Review Focus

1. **Routing:** file di repo bersarang (`app/packages/lib/x.ts` dengan repo di `app/` dan `app/packages/lib/`) di-stage ke repo terdalam, tidak ke repo luar. (Task 1, 5)
2. **Multi-project:** dua project yang tidak berhubungan sama-sama tampil di Project dan Commit; menutup satu tidak mengganggu yang lain. (Task 3, 7)
3. **Migrasi:** pengguna lama membuka aplikasi dan workspace satu foldernya muncul utuh. (Task 3)
4. **Refresh:** `git commit` / `git checkout` di terminal terlihat di RustPilot ≤ 1 detik tanpa klik apa pun; watcher tidak bocor saat project ditutup. (Task 4, 6)
5. **Kinerja:** 5 repository × 1.000 perubahan tampil ≤ 1 detik; status dijalankan paralel; respons lama tidak menimpa yang baru. (Task 5)
6. **Git tidak ada / terlalu lama** memberi pesan jelas sekali, bukan error di setiap aksi. (Task 2)

---

### Task 1: Domain routing dan project (frontend)

**Files:**
- Create: `src/domain/workspace.ts`
- Modify: `src/domain/git.ts`
- Test: `tests/domain/workspace.test.ts`, `tests/domain/git.test.ts` (tambah)

**Interfaces:**

```ts
// workspace.ts
export interface Project { root: string; name: string }
export function normalizePath(path: string): string;      // backslash -> '/', tanpa '/' di akhir, huruf kecil untuk perbandingan (Windows)
export function samePath(a: string, b: string): boolean;
export function isInside(path: string, root: string): boolean;
export function projectFor(projects: readonly Project[], path: string): Project | null;
export function addProject(projects: readonly Project[], root: string): Project[];   // menolak duplikat & folder di dalam project lain? -> lihat aturan
export function parseStoredProjects(raw: string | null, legacyRoot: string | null): Project[];

// git.ts
export type RepositoryKind = 'repository' | 'submodule' | 'worktree';
export interface RepositoryInfo { root: string; projectRoot: string; kind: RepositoryKind; name: string }
export function repositoryFor(repos: readonly RepositoryInfo[], path: string): RepositoryInfo | null; // prefix terpanjang
export function relativeToRepository(repo: RepositoryInfo, path: string): string;      // path dengan '/', untuk argumen git
export function repositoryLabel(repo: RepositoryInfo, projects: readonly Project[]): string; // "project" atau "project / sub/repo"
```

Aturan:
- Perbandingan path tidak membedakan huruf besar-kecil dan `\` vs `/`; `C:\a\b` ada di dalam `c:/A`, tapi `C:\ab` tidak di dalam `C:\a`.
- `addProject`: folder yang sama tidak ditambah dua kali; folder di dalam project lain atau yang membungkus project lain **boleh** (seperti VS Code), urutan sesuai penambahan.
- `parseStoredProjects`: JSON rusak → kosong; bila tidak ada data baru tapi ada `legacyRoot` → satu project.
- `name` project = nama folder terakhir.

- [ ] **Step 1: Tes gagal** untuk semua aturan di atas, termasuk repo bersarang tiga tingkat, path dengan spasi dan Unicode, drive berbeda, path persis sama dengan root repo.
- [ ] **Step 2–4:** gagal → implementasi → lulus.
- [ ] **Step 5: Commit** — `feat: project and repository routing rules`

---

### Task 2: Backend: info repository dan versi Git

**Files:**
- Modify: `src-tauri/src/domain/git.rs`, `src-tauri/src/domain/ports.rs`, `src-tauri/src/application/git.rs`, `src-tauri/src/infrastructure/git_cli.rs`, `src-tauri/src/presentation/commands.rs`, `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/git_status.rs` (tambah), `src-tauri/tests/git_cli_integration.rs` (tambah)

**Interfaces:**

```rust
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub enum RepositoryKind { Repository, Submodule, Worktree }
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct RepositoryInfo { pub root: String, pub kind: RepositoryKind }

pub fn parse_git_version(output: &str) -> Option<(u32, u32, u32)>;   // "git version 2.47.1.windows.2"
pub fn check_git_version(v: Option<(u32,u32,u32)>) -> Result<(), AppError>; // < 2.30 atau None -> AppError GitMissing/GitTooOld

// commands
#[tauri::command] fn git_version() -> Result<String, AppError>;
#[tauri::command] fn git_repositories(root: String) -> Result<Vec<RepositoryInfo>, AppError>; // menggantikan Vec<PathBuf>
```

Aturan:
- Penemuan: berjalan rekursif di bawah root project, berhenti masuk ke `node_modules`, `target`, `.git`, `dist`, `build`, `.venv`; mengenali `.git` folder (repository), `.git` file berisi `gitdir:` yang menunjuk ke `.../modules/...` (submodule) atau `.../worktrees/...` (worktree). Root project sendiri ikut bila repository. Kedalaman maksimal 8.
- Semua perintah baca memakai `GIT_OPTIONAL_LOCKS=0`; semua perintah memakai `GIT_TERMINAL_PROMPT=0` dan `-c core.quotepath=false`.
- `ErrorKind` tambah `GitMissing`, `GitTooOld` (frontend: `'gitMissing'`, `'gitTooOld'`).

- [ ] **Step 1: Tes gagal**: parser versi (format Windows, Linux, rc, sampah), cek versi; integrasi dengan `tempfile`: repo biasa, repo bersarang, submodule (`git submodule add` dari repo lokal), worktree (`git worktree add`), folder `node_modules` berisi `.git` diabaikan, status tidak membuat `index.lock` (cek env tercatat via fake runner bila perlu).
- [ ] **Step 2–4:** gagal → implementasi → lulus.
- [ ] **Step 5: Commit** — `feat: repository kinds and Git version check`

---

### Task 3: Workspace multi-project

**Files:**
- Modify: `src/application/workspaceStore.ts`, pemanggil `workspace.root` (cari dengan grep; ganti ke `primaryRoot()` helper), `src/presentation/workspace/ProjectPanel.tsx`, `src/presentation/workspace/FileTree.tsx`, `src/presentation/App.tsx` (menu)
- Test: `tests/application/workspaceStore.test.ts` (tambah)

**Interfaces:**

```ts
export interface WorkspaceState { projects: Project[]; children; expanded; }
export function primaryRoot(): string | null;                 // project pertama, untuk fitur lama
export async function openWorkspace(path: string): Promise<void>;   // mengganti seluruh workspace dengan satu project (perilaku lama)
export async function addFolderToWorkspace(path: string): Promise<void>;
export async function pickAndAddFolder(): Promise<void>;
export function removeFromWorkspace(root: string): void;
export async function restoreWorkspace(): Promise<void>;     // 'rustpilot.workspace.v2' (daftar) dengan migrasi dari v1
```

Aturan:
- Menambah folder yang sudah ada = tidak berubah. Menghapus project membuang listing/expand miliknya dan memanggil `gitStore.removeProject`.
- Project panel: tiap project adalah node akar (nama + path samar), bisa dilipat; menu klik-kanan akar: *Remove from Workspace*. Menu utama: *Add Folder to Workspace…*.
- Settings workspace (`loadSettings`) tetap memakai project pertama (dicatat untuk plan settings).

- [ ] **Step 1: Tes gagal**: tambah/hapus/duplikat, simpan & pulihkan, migrasi v1 → v2, project yang foldernya sudah tidak ada saat pulih dibuang dengan aman, `primaryRoot`.
- [ ] **Step 2–4:** gagal → implementasi → lulus; `tsc` (perbarui semua pemakai `workspace.root`).
- [ ] **Step 5:** Coba di `make dev`: tambah dua folder, lipat, hapus satu, restart.
- [ ] **Step 6: Commit** — `feat: multi-project workspace`

---

### Task 4: Watcher metadata `.git`

**Files:**
- Modify: `src-tauri/Cargo.toml` (`notify`), `src-tauri/src/domain/ports.rs`, `src-tauri/src/presentation/commands.rs`, `src-tauri/src/lib.rs`
- Create: `src-tauri/src/application/git_watch.rs` (debounce, murni), `src-tauri/src/infrastructure/git_watch.rs` (notify)
- Test: `src-tauri/tests/git_watch.rs`

**Interfaces:**

```rust
pub trait GitWatcher: Send + Sync {
    /// Watch the Git metadata of `root`; `on_change` is called (debounced) with the repository root.
    fn watch(&self, root: &Path, on_change: Box<dyn Fn() + Send + Sync>) -> Result<WatchHandle, AppError>;
}
pub struct Debouncer { /* murni: kumpulkan event, keluarkan satu sinyal setelah 300 ms sepi */ }
pub fn is_relevant(path_in_git_dir: &Path) -> bool; // HEAD, index, refs/**, packed-refs, MERGE_HEAD, REBASE_*, CHERRY_PICK_HEAD; bukan objects/**, *.lock, logs/**

#[tauri::command] fn git_watch(root: String, on_change: Channel<()>) -> Result<(), AppError>;
#[tauri::command] fn git_unwatch(root: String);
```

Aturan:
- Untuk worktree/submodule, yang diawasi adalah git dir sebenarnya (dibaca dari `git rev-parse --git-dir --git-common-dir`), termasuk `refs` di common dir.
- Satu watcher per repository; `git_watch` dua kali untuk root yang sama mengganti yang lama; keluar aplikasi / `git_unwatch` menghentikannya.

- [ ] **Step 1: Tes gagal**: `is_relevant` (daftar positif/negatif), `Debouncer` dengan jam palsu (banyak event → satu sinyal; event terlambat → sinyal kedua), integrasi: commit di repo temp memicu satu callback ≤ 1 detik, `git status` saja tidak memicu, unwatch menghentikan callback.
- [ ] **Step 2–4:** gagal → implementasi → lulus.
- [ ] **Step 5: Commit** — `feat: watch Git metadata for changes`

---

### Task 5: Registry repository di gitStore

**Files:**
- Modify: `src/application/gitStore.ts`, `src/application/ports.ts` (`GitPort.repositories` → `RepositoryInfo[]`, `version`, `watch`, `unwatch`), `src/infrastructure/tauri/git.ts`, `tests/helpers/ports.ts`
- Test: `tests/application/gitStore.test.ts` (ditulis ulang), `tests/infrastructure/tauri/git.test.ts` (tambah)

**Interfaces:**

```ts
export interface RepositoryState extends RepositoryInfo {
  status: GitStatus; loading: boolean; busy: boolean; error: string | null;
}
export interface GitState {
  available: boolean | null;   // null = belum dicek
  problem: string | null;      // Git tidak ada / terlalu lama
  repositories: Record<string, RepositoryState>; // kunci = normalizePath(root)
  order: string[];             // urutan tampil: per project, lalu path
}
export async function checkGit(): Promise<void>;
export async function loadProject(project: Project): Promise<void>;   // temukan repo, status paralel, mulai watch
export function removeProject(root: string): void;                    // hentikan watch, buang repo
export async function refreshRepository(repoKey: string): Promise<void>;
export async function refreshAll(): Promise<void>;
export async function refreshForPath(path: string): Promise<void>;     // dipanggil setelah simpan file
export const repositoryOfPath: (path: string) => RepositoryState | null;
export const activeRepository: () => RepositoryState | null;           // dari tab aktif
export const totalChanges: () => number;
export function stagePaths(paths: string[]): Promise<void>;            // dikelompokkan per repository pemilik
export function unstagePaths(paths: string[]): Promise<void>;
```

Aturan:
- Status tiap repository diambil paralel; setiap repository punya nomor permintaan sendiri sehingga respons lama tidak menimpa yang baru.
- `stagePaths` dengan path dari beberapa repository memanggil `stage` sekali per repository dengan path relatif masing-masing.
- Error satu repository hanya menandai repository itu.
- Event watcher → `refreshRepository`; event saat repository sedang `busy` ditunda sampai selesai.
- `checkGit` sekali: bila gagal, `available = false` dan semua aksi Git tidak dijalankan.

- [ ] **Step 1: Tes gagal** untuk tiap aturan (pakai fake port), termasuk dua project, repo bersarang, respons terbalik, error per repo, stage lintas repo, watcher memicu refresh, `removeProject` memanggil `unwatch`.
- [ ] **Step 2–4:** gagal → implementasi → lulus; `tsc`.
- [ ] **Step 5: Commit** — `feat: per-repository Git state across projects`

---

### Task 6: Pemicu refresh

**Files:**
- Modify: `src/application/editorStore.ts` (setelah simpan → `refreshForPath`), `src/presentation/App.tsx` (fokus jendela → `refreshAll`), `src/application/workspaceStore.ts` (buka/tambah project → `loadProject`)
- Test: `tests/application/editorStore.test.ts`, `tests/application/workspaceStore.test.ts` (tambah)

- [ ] **Step 1: Tes gagal:** simpan file memicu refresh repository pemiliknya saja; tambah project memanggil `loadProject`; hapus project memanggil `removeProject`.
- [ ] **Step 2–4:** gagal → implementasi → lulus.
- [ ] **Step 5: Commit** — `feat: refresh Git status after saves, focus and project changes`

---

### Task 7: UI: widget repository, panel Commit per repository, dekorasi

**Files:**
- Modify: `src/presentation/layout/TitleBar.tsx`, `src/presentation/git/CommitPanel.tsx`, `src/presentation/workspace/FileTree.tsx`, `src/presentation/layout/toolWindows.tsx` (badge `totalChanges`)
- Create: `src/presentation/git/RepositoryPopup.tsx`

Isi:
- **Title bar:** `repo-name / branch` untuk repository aktif (nama repo disembunyikan bila hanya ada satu repository); ikon dan tooltip menunjukkan upstream dan ahead/behind (`↑2 ↓1`). Klik → `RepositoryPopup`: daftar semua repository (dikelompokkan per project) dengan branch dan jumlah perubahan; memilih satu menjadikannya repository aktif sampai tab aktif berganti. (Checkout dan aksi branch menyusul di G5.)
- **Panel Commit:** seksi per repository (judul `project / repo`, branch, jumlah perubahan, bisa dilipat); di dalamnya grup yang sudah ada (Staged / Changes) memakai state per repository; seksi repository bersih disembunyikan kecuali tidak ada perubahan sama sekali (tampil "No changes"). Pesan "Git is not installed…" bila `available === false`.
- **Dekorasi file:** warna dan huruf status memakai `repositoryOfPath`, berlaku di semua project dan repo bersarang; folder menurunkan status terkuat anaknya.
- Badge tool window Commit = `totalChanges()`.

- [ ] **Step 1:** Implementasikan; `tsc`, `pnpm vitest run`.
- [ ] **Step 2:** Coba di `make dev` dengan workspace berisi `d:\rustpilot` + satu folder lain yang punya repo bersarang: dekorasi benar, stage file di repo dalam, commit di terminal → panel ter-update sendiri, branch di title bar berganti saat pindah tab antar repo.
- [ ] **Step 3: Commit** — `feat: repository switcher and per-repository commit panel`

---

### Task 8: Verifikasi tahap

- [ ] `make test` dan `make check` hijau.
- [ ] Review Focus 1–6 dicek satu per satu; ukur skenario 5 × 1.000 perubahan (skrip pembuat repo uji di scratchpad, tidak di-commit).
- [ ] JS awal gzip ≤ 250 KB.
- [ ] Centang G1 di spec; tulis plan G2 (Commit workflow) sebelum memulainya.
