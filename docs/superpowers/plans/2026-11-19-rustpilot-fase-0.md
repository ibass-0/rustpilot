# RustPilot Fase 0 (Fondasi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kerangka RustPilot yang jalan sebagai editor sederhana ala JetBrains (buka folder, file tree, tab, edit, simpan) di atas Tauri 2, tanpa AI.

**Architecture:** Backend Rust memegang semua akses file lewat fungsi murni di `fs/core.rs` yang dibungkus perintah Tauri tipis. Frontend SolidJS memanggilnya hanya lewat `src/ipc/`, dengan tiga store (`layoutStore`, `workspaceStore`, `editorStore`) dan satu `EditorView` CodeMirror 6 yang berganti `EditorState` per tab.

**Tech Stack:** Tauri 2, Rust stable, SolidJS, TypeScript, Vite, pnpm, CodeMirror 6, Vitest, `tauri-plugin-dialog`.

**Spec:** `docs/superpowers/specs/2026-11-19-rustpilot-fase-0-design.md`

## Global Constraints

- Platform: Windows 11 saja. Shell perintah: PowerShell.
- Package manager: pnpm. Jangan pakai npm/yarn.
- Tanpa Tailwind, tanpa pustaka komponen UI, tanpa font yang di-bundle, tanpa plugin store.
- Font stack: `"JetBrains Mono", "Cascadia Code", Consolas, monospace`.
- Tema gelap saja. Dekorasi jendela bawaan.
- `invoke` hanya boleh dipanggil dari `src/ipc/`.
- File teks UTF-8 saja, maksimum `10 * 1024 * 1024` byte.
- Kunci localStorage: `rustpilot.layout.v1`, `rustpilot.workspace.v1`.
- Semua field JSON lintas IPC memakai camelCase.
- Pakai versi stabil terbaru dari tiap dependensi saat scaffold; jangan menurunkan ke Tauri 1.

## Review Focus

1. **File bukan UTF-8 atau biner dibuka** → pesan "tidak bisa ditampilkan", tidak ada tab rusak. (Task 2, Task 6)
2. **File CRLF disimpan** → tetap CRLF di disk, tidak berubah jadi LF. (Task 2)
3. **Tab atau jendela ditutup saat ada perubahan belum tersimpan** → muncul konfirmasi; batal berarti tidak ada yang hilang. (Task 6)
4. **Simpan gagal (file terkunci/read-only/terhapus)** → pesan error tampil, tab tetap bertanda belum tersimpan, isi buffer utuh. (Task 6)
5. **localStorage rusak atau folder terakhir sudah tidak ada** → aplikasi tetap terbuka dengan layout default dan empty state. (Task 4, Task 5)

---

### Task 1: Prasyarat dan scaffold

**Files:**
- Create: seluruh hasil scaffold (`package.json`, `vite.config.ts`, `index.html`, `src/`, `src-tauri/`)
- Create: `vitest.config.ts`, `src/smoke.test.ts`, `.gitignore`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/App.tsx`

**Interfaces:**
- Produces: perintah `pnpm tauri dev`, `pnpm test` (Vitest, sekali jalan), `cargo test` di `src-tauri/`.

- [ ] **Step 1: Pasang Rust**

Rust belum ada di mesin ini. Pasang `rustup` (toolchain `stable-x86_64-pc-windows-msvc`) dan pastikan "Desktop development with C++" dari Visual Studio Build Tools terpasang.

Run: `rustc --version; cargo --version`
Expected: dua baris versi, tanpa error. (WebView2, Node 22, pnpm dan git sudah terpasang.)

- [ ] **Step 2: Scaffold**

Folder `d:\rustpilot` sudah berisi `docs/`, jadi scaffold ke subfolder sementara lalu pindahkan isinya ke root. Cek dulu flag yang tersedia dengan `pnpm create tauri-app --help`, lalu buat proyek dengan template `solid-ts`, manager `pnpm`, identifier `id.rustpilot.app`, nama `rustpilot`. Jalankan `pnpm install` di root.

- [ ] **Step 3: Bersihkan template dan atur jendela**

Hapus demo `greet` (perintah Rust, UI, aset logo). `src/App.tsx` hanya merender `<div>RustPilot</div>`. Di `tauri.conf.json`: judul `RustPilot`, ukuran `1280x800`, minimum `800x500`.

- [ ] **Step 4: Profil release**

Tambahkan ke `src-tauri/Cargo.toml`:

```toml
[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

- [ ] **Step 5: Siapkan Vitest**

Pasang `vitest` dan `jsdom` sebagai devDependency. `vitest.config.ts` memakai plugin `vite-plugin-solid`, `environment: 'jsdom'`, dan `resolve.conditions: ['development', 'browser']` (agar reaktivitas Solid aktif di tes). Script `"test": "vitest run"`. Tulis `src/smoke.test.ts`:

```ts
import { createSignal } from 'solid-js';
import { expect, test } from 'vitest';

test('solid reactivity works in tests', () => {
  const [n, setN] = createSignal(1);
  setN(2);
  expect(n()).toBe(2);
});
```

- [ ] **Step 6: Verifikasi**

Run: `pnpm test` → Expected: 1 passed.
Run: `cargo test` di `src-tauri/` → Expected: kompilasi sukses, 0 failed.
Run: `pnpm tauri dev` → Expected: jendela berjudul "RustPilot" tampil dengan teks "RustPilot".

- [ ] **Step 7: Commit**

`git init`, pastikan `.gitignore` memuat `node_modules`, `dist`, `src-tauri/target`, lalu:

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + SolidJS"
```

---

### Task 2: Akses file di Rust

**Files:**
- Create: `src-tauri/src/error.rs`, `src-tauri/src/fs/mod.rs`, `src-tauri/src/fs/core.rs`, `src-tauri/src/fs/commands.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` (dev-dependency `tempfile`)
- Test: modul `#[cfg(test)]` di `src-tauri/src/fs/core.rs`

**Interfaces:**
- Produces (Rust, `fs::core`):

```rust
pub const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct DirEntry { pub name: String, pub path: String, pub is_dir: bool }

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)] #[serde(rename_all = "lowercase")]
pub enum LineEnding { Lf, Crlf }

#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct FileContent { pub text: String, pub line_ending: LineEnding }

pub fn list_dir(path: &Path) -> Result<Vec<DirEntry>, AppError>;
pub fn read_text_file(path: &Path) -> Result<FileContent, AppError>;
pub fn write_text_file(path: &Path, text: &str, line_ending: LineEnding) -> Result<(), AppError>;
```

- Produces (Rust, `error`):

```rust
#[derive(Serialize, Debug, PartialEq)] #[serde(rename_all = "camelCase")]
pub enum ErrorKind { NotFound, PermissionDenied, NotUtf8, TooLarge, Io }

#[derive(Serialize, Debug)]
pub struct AppError { pub kind: ErrorKind, pub message: String }
impl From<std::io::Error> for AppError
```

- Produces (perintah Tauri, nama persis): `list_dir(path: String)`, `read_text_file(path: String)`, `write_text_file(path: String, text: String, line_ending: LineEnding)`; ketiganya mengembalikan `Result<_, AppError>`.

Aturan perilaku:
- `list_dir`: satu tingkat saja; folder dulu lalu file; urut `name` tanpa membedakan huruf besar-kecil; semua entri disertakan; `path` absolut.
- `read_text_file`: ukuran > `MAX_FILE_BYTES` → `TooLarge` (cek metadata sebelum membaca); bukan UTF-8 → `NotUtf8`; `line_ending` = `Crlf` bila teks mengandung `\r\n`, selain itu `Lf`; `text` dikembalikan apa adanya.
- `write_text_file`: normalkan `text` ke `\n` dulu (`\r\n` → `\n`), lalu ubah ke `\r\n` bila `Crlf`; tulis langsung dengan `std::fs::write`.
- `From<io::Error>`: `NotFound` → `NotFound`, `PermissionDenied` → `PermissionDenied`, lainnya → `Io`.

- [ ] **Step 1: Tulis tes yang gagal**

Di `fs/core.rs`, memakai `tempfile::tempdir()`:

```rust
#[test] fn list_dir_sorts_dirs_first_case_insensitive() {
    // buat: file "b.txt", file "A.txt", dir "zeta", dir "Alpha", file ".env"
    // names == ["Alpha", "zeta", ".env", "A.txt", "b.txt"]; is_dir == [true, true, false, false, false]
}
#[test] fn list_dir_is_not_recursive() {
    // dir "sub" berisi "inner.txt" → hasil hanya 1 entri bernama "sub"
}
#[test] fn list_dir_missing_path_is_not_found() { /* err.kind == ErrorKind::NotFound */ }
#[test] fn read_detects_crlf() { /* tulis b"a\r\nb\r\n" → line_ending == Crlf, text == "a\r\nb\r\n" */ }
#[test] fn read_detects_lf() { /* tulis b"a\nb\n" → line_ending == Lf */ }
#[test] fn read_empty_file_is_lf() { /* text == "", line_ending == Lf */ }
#[test] fn read_rejects_non_utf8() { /* tulis [0xff, 0xfe, 0x00] → err.kind == NotUtf8 */ }
#[test] fn read_rejects_too_large() { /* file MAX_FILE_BYTES + 1 byte (set_len) → err.kind == TooLarge */ }
#[test] fn write_preserves_crlf() { /* write("a\nb\n", Crlf) → bytes di disk == b"a\r\nb\r\n" */ }
#[test] fn write_does_not_double_cr() { /* write("a\r\nb", Crlf) → b"a\r\nb" */ }
#[test] fn write_lf_strips_cr() { /* write("a\r\nb", Lf) → b"a\nb" */ }
#[test] fn write_to_missing_dir_is_not_found() { /* err.kind == NotFound */ }
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cargo test fs::` di `src-tauri/`
Expected: gagal kompilasi karena fungsi belum ada.

- [ ] **Step 3: Implementasikan `error.rs` dan `fs/core.rs`** sesuai blok Interfaces dan aturan perilaku.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `cargo test fs::`
Expected: 12 passed.

- [ ] **Step 5: Tambahkan `fs/commands.rs` dan daftarkan di `lib.rs`**

Tiga `#[tauri::command]` yang hanya mengubah `String` ke `Path` dan memanggil `core`. Daftarkan lewat `tauri::generate_handler!`.

Run: `cargo build` di `src-tauri/` → Expected: sukses tanpa warning baru.

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "feat: file access core and commands"
```

---

### Task 3: Lapisan IPC frontend

**Files:**
- Create: `src/ipc/types.ts`, `src/ipc/fs.ts`, `src/ipc/dialog.ts`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `package.json` (plugin dialog)
- Test: `src/ipc/fs.test.ts`

**Interfaces:**
- Consumes: perintah Tauri dari Task 2.
- Produces:

```ts
// types.ts
export type LineEnding = 'lf' | 'crlf';
export interface DirEntry { name: string; path: string; isDir: boolean }
export interface FileContent { text: string; lineEnding: LineEnding }
export type ErrorKind = 'notFound' | 'permissionDenied' | 'notUtf8' | 'tooLarge' | 'io';
export class IpcError extends Error { kind: ErrorKind }

// fs.ts
export function listDir(path: string): Promise<DirEntry[]>;
export function readTextFile(path: string): Promise<FileContent>;
export function writeTextFile(path: string, text: string, lineEnding: LineEnding): Promise<void>;

// dialog.ts
export function pickFolder(): Promise<string | null>;              // open({ directory: true })
export function confirmDiscard(fileName: string): Promise<boolean>; // ask(), true = buang perubahan
export function showError(message: string): Promise<void>;          // message(), kind 'error'
```

Semua fungsi di `fs.ts` menangkap penolakan `invoke` dan melempar `IpcError`; bila bentuk error tidak dikenal, `kind` = `'io'` dan `message` = `String(err)`.

- [ ] **Step 1: Tulis tes yang gagal** (`src/ipc/fs.test.ts`, memakai `mockIPC` dan `clearMocks` dari `@tauri-apps/api/mocks`)

```ts
test('listDir passes path and returns entries', async () => {
  mockIPC((cmd, args) => {
    expect(cmd).toBe('list_dir');
    expect(args).toEqual({ path: 'C:\\x' });
    return [{ name: 'a', path: 'C:\\x\\a', isDir: true }];
  });
  expect(await listDir('C:\\x')).toEqual([{ name: 'a', path: 'C:\\x\\a', isDir: true }]);
});

test('writeTextFile sends lineEnding as camelCase arg', async () => {
  let seen: unknown;
  mockIPC((_cmd, args) => { seen = args; });
  await writeTextFile('C:\\x\\a.txt', 'hi', 'crlf');
  expect(seen).toEqual({ path: 'C:\\x\\a.txt', text: 'hi', lineEnding: 'crlf' });
});

test('backend error becomes IpcError with kind', async () => {
  mockIPC(() => { throw { kind: 'notUtf8', message: 'bukan UTF-8' }; });
  await expect(readTextFile('C:\\x\\b.bin')).rejects.toMatchObject({ kind: 'notUtf8', message: 'bukan UTF-8' });
});

test('unknown error shape becomes IpcError io', async () => {
  mockIPC(() => { throw 'boom'; });
  await expect(readTextFile('C:\\x')).rejects.toMatchObject({ kind: 'io', message: 'boom' });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm test src/ipc` → Expected: FAIL, modul `./fs` tidak ditemukan.

- [ ] **Step 3: Implementasikan `types.ts` dan `fs.ts`.**

- [ ] **Step 4: Pasang plugin dialog dan tulis `dialog.ts`**

Tambahkan `tauri-plugin-dialog` (crate + `@tauri-apps/plugin-dialog`), daftarkan di `lib.rs`, tambahkan izin `dialog:default` di `capabilities/default.json`.

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `pnpm test` → Expected: semua lulus. Run: `cargo build` → Expected: sukses.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: typed IPC layer and dialog plugin"
```

---

### Task 4: Shell layout ala JetBrains

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/layout/layoutStore.ts`, `src/layout/Shell.tsx`, `src/layout/Stripe.tsx`, `src/layout/ToolWindow.tsx`, `src/layout/Splitter.tsx`, `src/layout/StatusBar.tsx`, `src/layout/shortcuts.ts`
- Modify: `src/App.tsx`, `src/index.tsx`
- Test: `src/layout/layoutStore.test.ts`

**Interfaces:**
- Produces:

```ts
// layoutStore.ts
export type Side = 'left' | 'right' | 'bottom';
export type ToolWindowId = 'project' | 'agent' | 'terminal';
export const TOOL_WINDOW_SIDE: Record<ToolWindowId, Side>; // project→left, agent→right, terminal→bottom
export const MIN_PANEL_PX = 160;
export const DEFAULT_LAYOUT: LayoutState;
// { open: { left: 'project', right: null, bottom: null }, size: { left: 280, right: 360, bottom: 240 } }
export interface LayoutState {
  open: Record<Side, ToolWindowId | null>;
  size: Record<Side, number>;
}
export const layout: LayoutState;                     // store Solid, read-only
export function toggleToolWindow(id: ToolWindowId): void;
export function setPanelSize(side: Side, px: number, maxPx: number): void; // dijepit ke [MIN_PANEL_PX, maxPx]
export function loadLayout(): void;                   // baca localStorage; data tidak valid → DEFAULT_LAYOUT
// setiap perubahan disimpan ke localStorage 'rustpilot.layout.v1'

// Shell.tsx
export function Shell(props: { project: JSX.Element; editor: JSX.Element; status: JSX.Element }): JSX.Element;

// shortcuts.ts
export function registerShortcut(combo: string, handler: () => void): () => void; // contoh combo: 'alt+1', 'ctrl+s', 'alt+f12'
```

Tata letak mengikuti sketsa di spec: stripe kiri (tombol Project di atas, Terminal di bawah), stripe kanan (AI Agent), panel bawah membentang di bawah editor dan panel kanan tetapi tidak di bawah panel kiri, status bar selebar jendela. `maxPx` untuk splitter = 60% dari lebar (kiri/kanan) atau tinggi (bawah) jendela. Panel `agent` dan `terminal` menampilkan empty state. Pintasan: `alt+1` project, `alt+2` agent, `alt+f12` terminal.

- [ ] **Step 1: Tulis tes yang gagal** (`layoutStore.test.ts`; `beforeEach`: `localStorage.clear()` lalu `loadLayout()`)

```ts
test('defaults: project open on the left', () => {
  expect(layout.open).toEqual({ left: 'project', right: null, bottom: null });
  expect(layout.size).toEqual({ left: 280, right: 360, bottom: 240 });
});
test('toggle closes an open tool window and reopens it', () => {
  toggleToolWindow('project'); expect(layout.open.left).toBeNull();
  toggleToolWindow('project'); expect(layout.open.left).toBe('project');
});
test('toggle opens agent on the right without touching other sides', () => {
  toggleToolWindow('agent');
  expect(layout.open).toEqual({ left: 'project', right: 'agent', bottom: null });
});
test('setPanelSize clamps to min and max', () => {
  setPanelSize('left', 10, 700);   expect(layout.size.left).toBe(160);
  setPanelSize('left', 9999, 700); expect(layout.size.left).toBe(700);
});
test('layout persists and reloads', () => {
  toggleToolWindow('terminal'); setPanelSize('bottom', 300, 600);
  loadLayout();
  expect(layout.open.bottom).toBe('terminal'); expect(layout.size.bottom).toBe(300);
});
test('corrupt storage falls back to defaults', () => {
  localStorage.setItem('rustpilot.layout.v1', '{not json');
  loadLayout(); expect(layout).toEqual(DEFAULT_LAYOUT);
});
test('wrong-shape storage falls back to defaults', () => {
  localStorage.setItem('rustpilot.layout.v1', JSON.stringify({ open: { left: 'nope' }, size: { left: 'x' } }));
  loadLayout(); expect(layout).toEqual(DEFAULT_LAYOUT);
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm test src/layout` → Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 3: Implementasikan `layoutStore.ts`.**

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm test src/layout` → Expected: 7 passed.

- [ ] **Step 5: Bangun komponen shell, token warna, dan pintasan**

`tokens.css` mendefinisikan warna tema gelap dan ukuran (stripe 40px, status bar 24px, tinggi tab 32px) sebagai CSS variables. `App.tsx` memanggil `loadLayout()` dan merender `Shell` dengan placeholder untuk `project`, `editor`, `status`. `Splitter` memakai pointer events dan memanggil `setPanelSize`.

- [ ] **Step 6: Verifikasi manual**

Run: `pnpm tauri dev`
Expected: (a) layout sesuai sketsa; (b) klik tombol stripe dan `Alt+1`/`Alt+2`/`Alt+F12` membuka-tutup panel masing-masing; (c) menyeret splitter mengubah ukuran dan berhenti di 160px; (d) tutup lalu buka aplikasi, panel dan ukurannya sama seperti terakhir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: JetBrains-style layout shell"
```

---

### Task 5: Workspace dan file tree

**Files:**
- Create: `src/workspace/workspaceStore.ts`, `src/workspace/FileTree.tsx`, `src/workspace/ProjectPanel.tsx`
- Modify: `src/App.tsx`
- Test: `src/workspace/workspaceStore.test.ts`

**Interfaces:**
- Consumes: `listDir`, `pickFolder`, `showError`, `DirEntry`, `IpcError` (Task 3); slot `project` dari `Shell` (Task 4).
- Produces:

```ts
// workspaceStore.ts
export interface WorkspaceState {
  root: string | null;
  children: Record<string, DirEntry[]>; // kunci: path folder yang sudah dimuat
  expanded: Record<string, boolean>;
}
export const workspace: WorkspaceState;
export function openWorkspace(path: string): Promise<void>;   // set root, kosongkan cache, muat root, simpan ke 'rustpilot.workspace.v1'
export function toggleDir(path: string): Promise<void>;       // muat anak saat pertama kali dibuka
export function refreshDir(path: string): Promise<void>;
export function restoreWorkspace(): Promise<void>;            // buka folder terakhir; gagal → root null dan kunci dihapus
export function pickAndOpenWorkspace(): Promise<void>;

// FileTree.tsx
export function FileTree(props: { onOpenFile: (path: string) => void }): JSX.Element;
// ProjectPanel.tsx
export function ProjectPanel(props: { onOpenFile: (path: string) => void }): JSX.Element;
```

`ProjectPanel` menampilkan tombol "Buka Folder" bila `root` null, selain itu nama folder root dan `FileTree`. Klik folder → `toggleDir`; klik file → `onOpenFile`. Bila `toggleDir` gagal (mis. `permissionDenied`), folder tetap tertutup dan `showError` dipanggil.

- [ ] **Step 1: Tulis tes yang gagal** (mock `../ipc/fs` dan `../ipc/dialog` dengan `vi.mock`)

```ts
test('openWorkspace loads root children and persists path', async () => {
  listDir.mockResolvedValue([{ name: 'src', path: 'C:\\p\\src', isDir: true }]);
  await openWorkspace('C:\\p');
  expect(workspace.root).toBe('C:\\p');
  expect(workspace.children['C:\\p']).toHaveLength(1);
  expect(localStorage.getItem('rustpilot.workspace.v1')).toBe('C:\\p');
});
test('toggleDir loads children once, then only flips expanded', async () => {
  await openWorkspace('C:\\p'); listDir.mockClear();
  listDir.mockResolvedValue([{ name: 'a.ts', path: 'C:\\p\\src\\a.ts', isDir: false }]);
  await toggleDir('C:\\p\\src'); await toggleDir('C:\\p\\src'); await toggleDir('C:\\p\\src');
  expect(listDir).toHaveBeenCalledTimes(1);
  expect(workspace.expanded['C:\\p\\src']).toBe(true);
});
test('toggleDir failure keeps dir collapsed and shows error', async () => {
  await openWorkspace('C:\\p');
  listDir.mockRejectedValue(new IpcError('permissionDenied', 'ditolak'));
  await toggleDir('C:\\p\\secret');
  expect(workspace.expanded['C:\\p\\secret']).toBeFalsy();
  expect(showError).toHaveBeenCalledWith('ditolak');
});
test('openWorkspace clears previous cache', async () => {
  await openWorkspace('C:\\p'); await toggleDir('C:\\p\\src');
  await openWorkspace('C:\\q');
  expect(Object.keys(workspace.children)).toEqual(['C:\\q']);
  expect(workspace.expanded).toEqual({});
});
test('restoreWorkspace with missing folder resets to empty state', async () => {
  localStorage.setItem('rustpilot.workspace.v1', 'C:\\gone');
  listDir.mockRejectedValue(new IpcError('notFound', 'tidak ada'));
  await restoreWorkspace();
  expect(workspace.root).toBeNull();
  expect(localStorage.getItem('rustpilot.workspace.v1')).toBeNull();
});
test('pickAndOpenWorkspace does nothing when dialog is cancelled', async () => {
  pickFolder.mockResolvedValue(null);
  await pickAndOpenWorkspace();
  expect(workspace.root).toBeNull();
});
```

`IpcError` di tes dibuat dengan konstruktor `new IpcError(kind, message)`; pastikan konstruktor di `types.ts` berbentuk itu.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm test src/workspace` → Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 3: Implementasikan `workspaceStore.ts`.**

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm test src/workspace` → Expected: 6 passed.

- [ ] **Step 5: Bangun `FileTree` dan `ProjectPanel`, pasang di `App.tsx`**

`App.tsx` memanggil `restoreWorkspace()` saat start. `onOpenFile` sementara hanya `console.log(path)`. Indentasi tree 16px per tingkat; baris tree 22px.

- [ ] **Step 6: Verifikasi manual**

Run: `pnpm tauri dev`
Expected: (a) "Buka Folder" membuka dialog; setelah memilih, isi folder tampil, folder dulu; (b) folder besar seperti `node_modules` terbuka tanpa jeda terasa; (c) tutup-buka aplikasi, folder yang sama terbuka lagi; (d) ganti nama folder itu di Explorer lalu buka aplikasi → empty state, tanpa error.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: workspace and lazy file tree"
```

---

### Task 6: Editor, tab, dan simpan

**Files:**
- Create: `src/editor/editorStore.ts`, `src/editor/buffers.ts`, `src/editor/EditorPane.tsx`, `src/editor/EditorTabs.tsx`, `src/editor/theme.ts`, `src/editor/languages.ts`, `src/editor/extensions.ts`
- Modify: `src/App.tsx`, `src/layout/StatusBar.tsx`, `package.json` (paket CodeMirror)
- Test: `src/editor/editorStore.test.ts`, `src/editor/languages.test.ts`

**Interfaces:**
- Consumes: `readTextFile`, `writeTextFile`, `confirmDiscard`, `showError`, `LineEnding` (Task 3); `registerShortcut` (Task 4); `onOpenFile` dari `ProjectPanel` (Task 5).
- Produces:

```ts
// editorStore.ts
export interface Tab { path: string; name: string; lineEnding: LineEnding; dirty: boolean }
export interface EditorStoreState { tabs: Tab[]; activePath: string | null; cursor: { line: number; col: number } }
export const editor: EditorStoreState;
export function openFile(path: string): Promise<void>;     // sudah terbuka → hanya aktifkan; gagal baca → showError, tanpa tab baru
export function activateTab(path: string): void;
export function markDirty(path: string): void;
export function saveTab(path: string): Promise<boolean>;   // sukses → dirty false; gagal → showError, dirty tetap true, return false
export function closeTab(path: string): Promise<boolean>;  // dirty → confirmDiscard(name); ditolak → return false
export function hasDirtyTabs(): boolean;
export function setCursor(line: number, col: number): void;

// buffers.ts — non-reaktif
export function setBuffer(path: string, state: EditorState): void;
export function getBuffer(path: string): EditorState | undefined;
export function dropBuffer(path: string): void;
export function bufferText(path: string): string;           // isi dokumen dengan pemisah '\n'

// languages.ts
export function languageFor(fileName: string): Promise<Extension | null>;
// extensions.ts
export function baseExtensions(onDocChanged: () => void, onCursor: (line: number, col: number) => void): Extension[];
```

Aturan perilaku:
- `openFile` membuat `EditorState` dari `text` lalu `setBuffer`; `name` = segmen terakhir path (pemisah `\` atau `/`). Tab baru ditambahkan di akhir dan diaktifkan.
- `closeTab` tab aktif → aktifkan tab di kanannya, kalau tidak ada yang di kirinya, kalau tidak ada `null`. Selalu `dropBuffer`.
- Pesan `showError` untuk `notUtf8`: `"<name> bukan file teks UTF-8 dan tidak bisa ditampilkan."`; untuk `tooLarge`: `"<name> lebih besar dari 10 MB."`; lainnya memakai `message` dari error.
- `languageFor` memetakan ekstensi (tanpa membedakan huruf besar-kecil) ke dynamic import: `js jsx mjs cjs ts tsx` → `@codemirror/lang-javascript` (dengan opsi `typescript`/`jsx` yang sesuai), `rs` → `lang-rust`, `json` → `lang-json`, `html htm` → `lang-html`, `css` → `lang-css`, `md` → `lang-markdown`, `py` → `lang-python`; lainnya → `null`.
- `EditorPane` memegang satu `EditorView`; saat `activePath` berubah, simpan `view.state` ke buffer tab lama lalu `view.setState(getBuffer(baru))`. `activePath` null → empty state.
- `baseExtensions`: nomor baris, history, bracket matching, highlight baris aktif, pencarian (`Ctrl+F`), indentasi dengan Tab, tema dari `theme.ts`.
- Pintasan: `ctrl+s` → `saveTab(activePath)`; `ctrl+w` dan `ctrl+f4` → `closeTab(activePath)`.
- Tutup jendela: `getCurrentWindow().onCloseRequested`; bila `hasDirtyTabs()` → `confirmDiscard('beberapa file')`; ditolak → `event.preventDefault()`.
- Status bar: path root, nama file aktif, `Ln X, Col Y`, `LF`/`CRLF`, `UTF-8`.

- [ ] **Step 1: Tulis tes yang gagal**

`editorStore.test.ts` (mock `../ipc/fs` dan `../ipc/dialog`; reset store di `beforeEach`):

```ts
const A = 'C:\\p\\a.ts', B = 'C:\\p\\b.ts', C = 'C:\\p\\c.ts';

test('openFile adds a tab, activates it, keeps line ending', async () => {
  readTextFile.mockResolvedValue({ text: 'x\r\ny', lineEnding: 'crlf' });
  await openFile(A);
  expect(editor.tabs).toEqual([{ path: A, name: 'a.ts', lineEnding: 'crlf', dirty: false }]);
  expect(editor.activePath).toBe(A);
  expect(bufferText(A)).toBe('x\ny');
});
test('openFile twice does not duplicate or re-read', async () => {
  await openFile(A); await openFile(B); await openFile(A);
  expect(editor.tabs.map(t => t.path)).toEqual([A, B]);
  expect(editor.activePath).toBe(A);
  expect(readTextFile).toHaveBeenCalledTimes(2);
});
test('openFile on non-UTF-8 shows message and adds no tab', async () => {
  readTextFile.mockRejectedValue(new IpcError('notUtf8', 'x'));
  await openFile('C:\\p\\img.png');
  expect(editor.tabs).toEqual([]);
  expect(showError).toHaveBeenCalledWith('img.png bukan file teks UTF-8 dan tidak bisa ditampilkan.');
});
test('openFile on too-large file shows size message', async () => {
  readTextFile.mockRejectedValue(new IpcError('tooLarge', 'x'));
  await openFile('C:\\p\\big.log');
  expect(showError).toHaveBeenCalledWith('big.log lebih besar dari 10 MB.');
});
test('saveTab writes buffer with tab line ending and clears dirty', async () => {
  readTextFile.mockResolvedValue({ text: 'x\r\ny', lineEnding: 'crlf' });
  await openFile(A); markDirty(A);
  expect(await saveTab(A)).toBe(true);
  expect(writeTextFile).toHaveBeenCalledWith(A, 'x\ny', 'crlf');
  expect(editor.tabs[0].dirty).toBe(false);
});
test('saveTab failure keeps dirty and buffer, shows error', async () => {
  await openFile(A); markDirty(A);
  writeTextFile.mockRejectedValue(new IpcError('permissionDenied', 'file terkunci'));
  expect(await saveTab(A)).toBe(false);
  expect(editor.tabs[0].dirty).toBe(true);
  expect(getBuffer(A)).toBeDefined();
  expect(showError).toHaveBeenCalledWith('file terkunci');
});
test('closeTab on clean tab closes without asking', async () => {
  await openFile(A);
  expect(await closeTab(A)).toBe(true);
  expect(confirmDiscard).not.toHaveBeenCalled();
  expect(editor.tabs).toEqual([]); expect(editor.activePath).toBeNull();
  expect(getBuffer(A)).toBeUndefined();
});
test('closeTab on dirty tab, user cancels: nothing changes', async () => {
  await openFile(A); markDirty(A);
  confirmDiscard.mockResolvedValue(false);
  expect(await closeTab(A)).toBe(false);
  expect(editor.tabs).toHaveLength(1); expect(getBuffer(A)).toBeDefined();
});
test('closeTab on dirty tab, user confirms: tab closes', async () => {
  await openFile(A); markDirty(A);
  confirmDiscard.mockResolvedValue(true);
  expect(await closeTab(A)).toBe(true);
  expect(confirmDiscard).toHaveBeenCalledWith('a.ts');
  expect(editor.tabs).toEqual([]);
});
test('closing active tab activates right neighbour, else left', async () => {
  await openFile(A); await openFile(B); await openFile(C);
  activateTab(B); await closeTab(B); expect(editor.activePath).toBe(C);
  await closeTab(C); expect(editor.activePath).toBe(A);
});
test('closing an inactive tab keeps the active one', async () => {
  await openFile(A); await openFile(B);
  await closeTab(A); expect(editor.activePath).toBe(B);
});
test('hasDirtyTabs reflects dirty state', async () => {
  await openFile(A); expect(hasDirtyTabs()).toBe(false);
  markDirty(A); expect(hasDirtyTabs()).toBe(true);
});
```

`languages.test.ts`:

```ts
test.each(['a.ts', 'a.TSX', 'a.rs', 'a.json', 'a.html', 'a.css', 'a.md', 'a.py'])('%s has a language', async (f) => {
  expect(await languageFor(f)).not.toBeNull();
});
test.each(['a.xyz', 'Makefile', '.gitignore'])('%s has no language', async (f) => {
  expect(await languageFor(f)).toBeNull();
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm test src/editor` → Expected: FAIL, modul tidak ditemukan.

- [ ] **Step 3: Pasang CodeMirror dan implementasikan `buffers.ts`, `editorStore.ts`, `languages.ts`**

Paket: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/search`, dan tujuh paket `@codemirror/lang-*` di atas. Jangan pakai meta-paket `codemirror` (menarik autocomplete dan lint yang belum dipakai).

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm test` → Expected: semua lulus (12 tes store + 11 tes bahasa di `src/editor`).

- [ ] **Step 5: Bangun `extensions.ts`, `theme.ts`, `EditorPane`, `EditorTabs`, status bar, pintasan, dan penjaga tutup jendela; sambungkan `onOpenFile` ke `openFile`**

`docChanged` → `markDirty(activePath)`. Tab menampilkan `●` saat `dirty`, tombol `×` untuk tutup, klik tengah juga menutup.

- [ ] **Step 6: Verifikasi manual**

Run: `pnpm tauri dev`
Expected:
(a) klik file di tree → tab baru dengan highlight sintaks; klik lagi → tab yang sama aktif.
(b) ketik → `●` muncul; `Ctrl+S` → `●` hilang dan isi di disk berubah.
(c) buka file CRLF, edit, simpan → `git diff` hanya menunjukkan baris yang diedit, bukan seluruh file.
(d) pindah tab lalu kembali → `Ctrl+Z` masih membatalkan edit sebelumnya.
(e) klik file `.png` → dialog "…bukan file teks UTF-8…", tanpa tab.
(f) set file jadi read-only di Explorer, edit, `Ctrl+S` → dialog error, `●` tetap ada.
(g) tutup jendela saat ada `●` → konfirmasi; "tidak" membiarkan jendela terbuka.
(h) status bar menampilkan `Ln, Col` yang ikut bergerak dan `CRLF`/`LF` yang benar.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: CodeMirror editor with tabs, save and unsaved-change guards"
```

---

### Task 7: Build release dan angka dasar keringanan

**Files:**
- Create: `README.md`
- Modify: `src-tauri/tauri.conf.json` (target bundle `nsis`)

**Interfaces:**
- Consumes: seluruh aplikasi dari Task 1–6.
- Produces: installer NSIS dan tabel angka dasar di `README.md`.

- [ ] **Step 1: Build**

Run: `pnpm tauri build`
Expected: sukses; installer ada di `src-tauri/target/release/bundle/nsis/`.

- [ ] **Step 2: Ukur**

- Ukuran installer (`Get-Item … | Select Length`).
- JS awal ter-gzip: jumlahkan chunk di `dist/assets` yang direferensikan `dist/index.html` (bukan chunk bahasa yang lazy).
- Waktu sampai jendela tampil: jalankan exe release tiga kali, ambil median.
- Memori idle: buka satu folder dan satu file, tunggu 30 detik, jumlahkan working set proses `rustpilot` dan seluruh proses `msedgewebview2` turunannya.

- [ ] **Step 3: Catat di `README.md`**

Isi README: satu paragraf tentang RustPilot, cara menjalankan (`pnpm install`, `pnpm tauri dev`, `pnpm test`, `cargo test`), dan tabel "Angka dasar Fase 0" dengan kolom Ukuran / Target / Hasil. Target dari spec: installer ≤ 10 MB, JS awal gzip ≤ 250 KB, jendela tampil ≤ 1 detik, memori idle ≤ 200 MB. Untuk target yang meleset, tambahkan satu baris penyebab.

- [ ] **Step 4: Uji asap installer**

Pasang dari installer, jalankan, ulangi verifikasi (a), (b), (g) dari Task 6 Step 6.
Expected: sama seperti di mode dev.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: release build and Phase 0 baseline numbers"
```
