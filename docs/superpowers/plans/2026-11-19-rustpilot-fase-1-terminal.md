# RustPilot Fase 1 (Terminal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel Terminal berisi terminal interaktif sungguhan dengan pilihan shell (PowerShell 7, Windows PowerShell, Command Prompt, Git Bash, WSL) dan beberapa tab.

**Architecture:** Rust menjalankan shell di PTY (ConPTY lewat `portable-pty`) dan mengalirkan keluarannya ke frontend dengan Tauri `Channel`. Frontend menampilkannya dengan `xterm.js` yang dimuat lazy. Aturan deteksi shell dan pengelolaan sesi adalah use case murni di lapisan `application`, dengan PTY dan pencarian program di balik port.

**Tech Stack:** `portable-pty` 0.9, `@xterm/xterm` 6, `@xterm/addon-fit`, Tauri `ipc::Channel`.

**Spec:** `docs/superpowers/specs/2026-11-19-rustpilot-fase-1-terminal-design.md`

## Global Constraints

- Aturan di `CLAUDE.md` berlaku: clean architecture, tes di `tests/` dan `src-tauri/tests/`, semua kode dan teks UI bahasa Inggris, commit satu baris bahasa Inggris tanpa atribusi, `docs/` tidak di-commit.
- `invoke` dan `Channel` hanya dipakai di `src/infrastructure/tauri/`. `xterm` hanya diimpor di `src/infrastructure/xterm/`.
- `xterm` dan CSS-nya dimuat dengan `import()` dinamis; tidak boleh masuk bundle awal.
- ID sesi dibuat frontend (bilangan bulat naik), dikirim ke Rust saat membuka.
- Field JSON lintas IPC camelCase.
- Ukuran awal PTY 80×24. Scrollback 5000 baris.
- Windows 11 saja.

## Review Focus

1. **Proses yatim:** tutup tab saat `ping -t` berjalan, dan tutup aplikasi saat ada shell hidup → tidak ada `cmd.exe`/`pwsh.exe`/`conhost.exe` turunan yang tersisa. (Task 3, Task 4)
2. **Byte UTF-8 terpotong di batas potongan** → tidak ada `�` pada keluaran berisi karakter non-ASCII. (Task 1)
3. **Pintasan saat fokus di terminal:** `Ctrl+W` dan `Ctrl+R` sampai ke shell; `Ctrl+W` tidak menutup tab editor; `F5` tidak me-reload. (Task 7)
4. **Resize sebelum sesi siap:** ukuran panel yang berubah sebelum `terminal_open` selesai tetap sampai ke PTY. (Task 5)
5. **Shell gagal dijalankan** (program hilang, folder kerja tidak ada) → pesan error, tidak ada tab mati tertinggal. (Task 4, Task 5)
6. **Keluaran deras** (`dir /s C:\Windows`) → jendela tetap responsif, tidak membeku. (Task 4, Task 6)

---

### Task 1: Domain terminal dan deteksi shell (Rust)

**Files:**
- Create: `src-tauri/src/domain/terminal.rs`, `src-tauri/src/application/terminal.rs`
- Modify: `src-tauri/src/domain/mod.rs`, `src-tauri/src/domain/ports.rs`, `src-tauri/src/application/mod.rs`
- Test: `src-tauri/tests/terminal_shells.rs`, `src-tauri/tests/utf8_stream.rs`

**Interfaces:**
- Produces:

```rust
// domain/terminal.rs
#[derive(Serialize, Clone, Debug, PartialEq)] #[serde(rename_all = "camelCase")]
pub struct ShellProfile { pub id: String, pub name: String, pub program: String, pub args: Vec<String> }

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct TerminalSize { pub cols: u16, pub rows: u16 }

#[derive(Serialize, Clone, Debug, PartialEq)] #[serde(rename_all = "camelCase", tag = "type")]
pub enum TerminalEvent { Output { data: String }, Exit { code: u32 } }

#[derive(Default)]
pub struct Utf8Stream { /* byte tertahan */ }
impl Utf8Stream { pub fn push(&mut self, bytes: &[u8]) -> String; }

// domain/ports.rs
pub trait ProgramLocator {
    fn find_in_path(&self, exe: &str) -> Option<PathBuf>;
    fn exists(&self, path: &Path) -> bool;
    fn env(&self, name: &str) -> Option<String>;
}

// application/terminal.rs
pub fn available_shells(locator: &dyn ProgramLocator) -> Vec<ShellProfile>;
```

Aturan perilaku:
- `available_shells` mengembalikan, berurutan dan hanya bila ditemukan: `pwsh` ("PowerShell", `pwsh.exe` di PATH, args `-NoLogo`), `powershell` ("Windows PowerShell", `powershell.exe` di PATH, args `-NoLogo`), `cmd` ("Command Prompt", `cmd.exe` di PATH), `git-bash` ("Git Bash", args `--login -i`), `wsl` ("WSL", `wsl.exe` di PATH).
- Git Bash dicari sebagai `bin\bash.exe` di bawah `%ProgramFiles%\Git`, `%ProgramFiles(x86)%\Git`, `%LocalAppData%\Programs\Git`, berurutan; tidak pernah lewat PATH.
- `program` berisi path absolut hasil pencarian.
- `Utf8Stream::push` mengembalikan teks dari byte yang sudah lengkap dan menahan awalan urutan multi-byte yang belum lengkap di ujung; byte yang memang tidak valid menjadi `U+FFFD`.

- [ ] **Step 1: Tulis tes yang gagal**

`terminal_shells.rs` memakai `FakeLocator { path: HashMap, files: HashSet, env: HashMap }`:

```rust
#[test] fn lists_shells_in_preference_order() { /* semua ada → ids == ["pwsh","powershell","cmd","git-bash","wsl"] */ }
#[test] fn skips_shells_that_are_not_installed() { /* hanya cmd.exe → ids == ["cmd"] */ }
#[test] fn git_bash_is_found_in_program_files_not_on_path() {
    // PATH punya bash.exe (WSL) tapi tidak ada Git → tidak ada "git-bash"
    // %ProgramFiles%\Git\bin\bash.exe ada → program == path itu, args == ["--login","-i"]
}
#[test] fn git_bash_falls_back_to_per_user_install() { /* hanya %LocalAppData%\Programs\Git */ }
#[test] fn no_shells_gives_an_empty_list() {}
#[test] fn powershell_profiles_start_without_the_logo() { /* args == ["-NoLogo"] */ }
```

`utf8_stream.rs`:

```rust
#[test] fn ascii_passes_through() { /* push(b"hello") == "hello" */ }
#[test] fn a_split_two_byte_character_is_held_until_complete() { /* "é" = C3 A9: push([C3]) == "", push([A9]) == "é" */ }
#[test] fn a_split_four_byte_character_is_held_until_complete() { /* "😀" dibagi 1+3, 2+2, 3+1 */ }
#[test] fn text_before_a_split_character_is_returned_at_once() { /* push(b"ab\xC3") == "ab" */ }
#[test] fn an_invalid_byte_becomes_the_replacement_character() { /* push([0x41, 0xFF, 0x42]) == "A\u{FFFD}B" */ }
#[test] fn a_stray_continuation_byte_is_not_held_forever() { /* push([0x80]) == "\u{FFFD}" */ }
```

- [ ] **Step 2: Jalankan, pastikan gagal** — `cargo test --test terminal_shells --test utf8_stream` → gagal kompilasi.
- [ ] **Step 3: Implementasikan** `domain/terminal.rs`, port `ProgramLocator`, dan `application/terminal.rs::available_shells`.
- [ ] **Step 4: Jalankan, pastikan lulus** — Expected: 12 passed.
- [ ] **Step 5: Commit** — `feat: shell detection and UTF-8 stream decoding`

---

### Task 2: Daftar sesi terminal (Rust)

**Files:**
- Modify: `src-tauri/src/domain/ports.rs`, `src-tauri/src/application/terminal.rs`
- Test: `src-tauri/tests/terminal_sessions.rs`

**Interfaces:**
- Consumes: `ShellProfile`, `TerminalSize`, `TerminalEvent`, `Utf8Stream` (Task 1).
- Produces:

```rust
// domain/ports.rs
pub type EventSink = Box<dyn Fn(TerminalEvent) + Send + Sync>;

pub trait PtySession: Send {
    fn write(&mut self, data: &[u8]) -> Result<(), AppError>;
    fn resize(&mut self, size: TerminalSize) -> Result<(), AppError>;
    fn kill(&mut self);
}
pub trait PtySpawner: Send + Sync {
    fn spawn(&self, profile: &ShellProfile, cwd: &Path, size: TerminalSize, events: EventSink)
        -> Result<Box<dyn PtySession>, AppError>;
}

// application/terminal.rs
pub struct TerminalSessions { /* Mutex<HashMap<u32, Box<dyn PtySession>>> */ }
impl TerminalSessions {
    pub fn new() -> Self;
    pub fn open(&self, spawner: &dyn PtySpawner, id: u32, profile: &ShellProfile, cwd: &Path,
                size: TerminalSize, events: EventSink) -> Result<(), AppError>;
    pub fn write(&self, id: u32, data: &str) -> Result<(), AppError>;
    pub fn resize(&self, id: u32, size: TerminalSize) -> Result<(), AppError>;
    pub fn close(&self, id: u32);      // kill + buang; id tak dikenal diabaikan
    pub fn close_all(&self);
    pub fn len(&self) -> usize;
}
```

Aturan perilaku: `open` dengan `id` yang sudah dipakai → `AppError` kind `Io`; `write`/`resize` ke `id` tak dikenal → `AppError` kind `NotFound`; `close` selalu memanggil `kill` tepat sekali; `close_all` mematikan semuanya; `Drop` untuk `TerminalSessions` memanggil `close_all`. Ukuran dengan `cols` atau `rows` nol dijepit ke 1.

- [ ] **Step 1: Tulis tes yang gagal** — `FakeSpawner` mencatat pemanggilan dan mengembalikan `FakeSession` yang mencatat `write`/`resize`/`kill` ke `Arc<Mutex<Vec<String>>>`:

```rust
#[test] fn open_spawns_with_profile_cwd_and_size() {}
#[test] fn open_rejects_a_duplicate_id() {}
#[test] fn a_failed_spawn_leaves_no_session() { /* spawner Err → len() == 0, error diteruskan */ }
#[test] fn write_and_resize_reach_the_right_session() { /* dua sesi, hanya yang dituju menerima */ }
#[test] fn write_to_an_unknown_id_is_not_found() {}
#[test] fn close_kills_and_forgets_the_session() { /* kill 1x, len() berkurang, close kedua tidak kill lagi */ }
#[test] fn close_all_kills_every_session() {}
#[test] fn dropping_the_registry_kills_every_session() {}
#[test] fn a_zero_size_is_clamped_to_one() {}
```

- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasikan `TerminalSessions`.**
- [ ] **Step 4: Jalankan, pastikan lulus** — Expected: 9 passed.
- [ ] **Step 5: Commit** — `feat: terminal session registry`

---

### Task 3: Adapter PTY dan pencari program (Rust)

**Files:**
- Create: `src-tauri/src/infrastructure/pty.rs`, `src-tauri/src/infrastructure/program_locator.rs`
- Modify: `src-tauri/src/infrastructure/mod.rs`, `src-tauri/Cargo.toml` (`portable-pty`)
- Test: `src-tauri/tests/pty_integration.rs`, `src-tauri/tests/program_locator.rs`

**Interfaces:**
- Consumes: port `PtySpawner`, `PtySession`, `ProgramLocator`, `EventSink`.
- Produces: `pub struct PortablePtySpawner;` (impl `PtySpawner`) dan `pub struct SystemProgramLocator;` (impl `ProgramLocator`).

Aturan perilaku `PortablePtySpawner::spawn`:
- Buka PTY ukuran `size`, jalankan `profile.program` dengan `profile.args` di `cwd`, set `TERM=xterm-256color`.
- Satu thread membaca keluaran, melewatkannya ke `Utf8Stream`, dan mengirim `TerminalEvent::Output` untuk tiap potongan tak kosong.
- Satu thread menunggu proses selesai dan mengirim `TerminalEvent::Exit { code }` tepat sekali.
- `kill` mematikan proses anak dan melepas PTY; aman dipanggil dua kali.
- `cwd` yang tidak ada atau program yang tidak bisa dijalankan → `Err(AppError)`, tanpa thread tertinggal.

`SystemProgramLocator::find_in_path` mencari nama persis di tiap folder `PATH` (tanpa menebak ekstensi).

- [ ] **Step 1: Tulis tes yang gagal**

`pty_integration.rs` (memakai `cmd.exe` asli dari `%ComSpec%`, mengumpulkan event ke `mpsc::channel`, batas tunggu 10 detik):

```rust
#[test] fn runs_a_command_and_streams_its_output() { /* cmd /C echo rp_marker → Output memuat "rp_marker", lalu Exit { code: 0 } */ }
#[test] fn reports_the_exit_code() { /* cmd /C exit 3 → Exit { code: 3 } */ }
#[test] fn input_written_to_the_session_reaches_the_shell() { /* cmd interaktif; write "echo rp_%OS%\r\n" → Output memuat "rp_Windows_NT" */ }
#[test] fn starts_in_the_requested_directory() { /* cwd = tempdir; write "cd\r\n" → Output memuat nama tempdir */ }
#[test] fn kill_ends_a_running_shell() { /* cmd interaktif; kill() → Exit diterima dalam batas waktu */ }
#[test] fn a_missing_program_is_an_error() { /* program "C:\\no\\such.exe" → Err */ }
#[test] fn a_missing_working_directory_is_an_error() {}
#[test] fn non_ascii_output_is_not_mangled() { /* cmd /C "chcp 65001>nul & echo héllo" → Output memuat "héllo", tanpa U+FFFD */ }
```

`program_locator.rs`:

```rust
#[test] fn finds_cmd_on_the_real_path() { /* find_in_path("cmd.exe") adalah Some dan file-nya ada */ }
#[test] fn a_missing_program_is_none() {}
#[test] fn exists_and_env_reflect_the_system() {}
```

- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Tambahkan `portable-pty`; implementasikan kedua adapter.** Periksa API crate di sumbernya (`~/.cargo/registry/src/*/portable-pty-0.9.0/src/lib.rs`): `native_pty_system`, `PtySize`, `CommandBuilder`, `MasterPty::{try_clone_reader, take_writer, resize}`, `Child::{wait, clone_killer}`.
- [ ] **Step 4: Jalankan, pastikan lulus** — Expected: 11 passed. Jalankan tiga kali berturut-turut untuk memastikan tidak goyah.
- [ ] **Step 5: Periksa proses yatim** — setelah `cargo test --test pty_integration`, `Get-Process cmd, conhost` tidak menunjukkan proses baru yang tersisa dari tes.
- [ ] **Step 6: Commit** — `feat: ConPTY adapter and program locator`

---

### Task 4: Perintah Tauri dan streaming

**Files:**
- Modify: `src-tauri/src/presentation/commands.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `available_shells`, `TerminalSessions`, `PortablePtySpawner`, `SystemProgramLocator`.
- Produces (perintah Tauri, nama persis):

```
terminal_shells() -> Vec<ShellProfile>
terminal_open(id: u32, profile_id: String, cwd: Option<String>, cols: u16, rows: u16, on_event: Channel<TerminalEvent>) -> Result<(), AppError>
terminal_write(id: u32, data: String) -> Result<(), AppError>
terminal_resize(id: u32, cols: u16, rows: u16) -> Result<(), AppError>
terminal_close(id: u32)
```

Aturan perilaku: `terminal_open` mencari profil menurut `profile_id` di antara `available_shells` (tak dikenal → `NotFound`); `cwd` `None` → folder home (`%USERPROFILE%`). State `TerminalState { sessions, spawner: Box<dyn PtySpawner>, locator: Box<dyn ProgramLocator + Send + Sync> }` dipasang di `lib.rs` (composition root); `commands.rs` tidak menyebut adapter konkret. Saat aplikasi keluar (`RunEvent::Exit`), `close_all` dipanggil.

- [ ] **Step 1: Implementasikan perintah dan state; daftarkan di `generate_handler!`.**
- [ ] **Step 2:** `cargo build` → sukses tanpa warning. `cargo test` → seluruh tes Rust lulus.
- [ ] **Step 3: Commit** — `feat: terminal commands with streamed output`

---

### Task 5: Store terminal dan port (frontend)

**Files:**
- Create: `src/domain/terminal.ts`, `src/application/terminalStore.ts`
- Modify: `src/application/ports.ts`, `tests/helpers/ports.ts`
- Test: `tests/domain/terminal.test.ts`, `tests/application/terminalStore.test.ts`

**Interfaces:**
- Produces:

```ts
// domain/terminal.ts
export interface ShellProfile { id: string; name: string; program: string; args: string[] }
export interface TerminalTab { id: number; title: string; profileId: string; exited: boolean }
export interface TerminalSize { cols: number; rows: number }
export const INITIAL_TERMINAL_SIZE: TerminalSize; // { cols: 80, rows: 24 }
export function tabTitle(profileName: string, existing: readonly string[]): string; // "PowerShell", "PowerShell (2)", …
export function exitNotice(code: number): string; // baris abu-abu "[Process exited with code N]"

// application/ports.ts
export interface PtyPort {
  listShells(): Promise<ShellProfile[]>;
  open(id: number, profileId: string, cwd: string | null, size: TerminalSize,
       onOutput: (data: string) => void, onExit: (code: number) => void): Promise<void>;
  write(id: number, data: string): Promise<void>;
  resize(id: number, size: TerminalSize): Promise<void>;
  close(id: number): Promise<void>;
}
export interface TerminalScreenPort {
  create(id: number, handlers: { onInput(data: string): void; onResize(size: TerminalSize): void }): void;
  write(id: number, data: string): void;
  dispose(id: number): void;
}
// Ports mendapat `pty: PtyPort` dan `screens: TerminalScreenPort`.

// application/terminalStore.ts
export interface TerminalState { shells: ShellProfile[]; tabs: TerminalTab[]; activeId: number | null }
export const terminals: TerminalState;
export function loadShells(): Promise<void>;                  // sekali; pemanggilan berikutnya tidak memanggil backend lagi
export function openTerminal(profileId?: string): Promise<void>;
export function ensureTerminal(): Promise<void>;              // buka default hanya bila belum ada tab
export function activateTerminal(id: number): void;
export function closeTerminal(id: number): Promise<void>;
```

Aturan perilaku:
- `openTerminal` tanpa argumen memakai shell pertama; bila daftar shell kosong → `showError("No shell was found on this computer.")`, tanpa tab.
- Urutan: buat layar (`screens.create`) → tambah tab dan aktifkan → `pty.open(id, profileId, workspace.root, INITIAL_TERMINAL_SIZE, …)`.
- Keluaran PTY diteruskan ke `screens.write(id, …)`. Masukan layar diteruskan ke `pty.write(id, …)`.
- Resize dari layar dicatat; diteruskan ke `pty.resize` bila sesi sudah terbuka. Setelah `pty.open` selesai, ukuran terakhir yang tercatat dikirim sekali bila berbeda dari ukuran awal.
- Proses selesai → tab `exited: true`, `screens.write(id, exitNotice(code))`; masukan sesudahnya tidak diteruskan.
- `pty.open` gagal → `showError(message)`, layar dibuang, tab dihapus.
- `closeTerminal` → `pty.close` (tidak dipanggil bila sudah `exited`), `screens.dispose`, hapus tab; tab aktif berpindah ke kanan, lalu kiri, lalu `null` (sama dengan aturan tab editor).
- Kegagalan `pty.write`/`pty.resize` diabaikan diam-diam.

- [ ] **Step 1: Tulis tes yang gagal** (`installFakePorts` diperluas dengan `pty` dan `screens` berbasis `vi.fn`, plus pembantu untuk memicu `onOutput`/`onExit`/`onInput`/`onResize` yang tertangkap):

```ts
test('tabTitle numbers repeated shells');                     // domain
test('exitNotice names the exit code');                       // domain
test('loadShells stores the profiles and asks the backend only once');
test('openTerminal opens the default shell in the workspace root at 80x24');
test('openTerminal with a profile id opens that shell');
test('openTerminal with no shells shows an error and adds no tab');
test('a new terminal becomes the active tab');
test('output from the shell is written to that terminal screen only');
test('typing on the screen is sent to the shell');
test('a resize after opening is sent to the shell');
test('a resize that arrives while the shell is still opening is sent once it is open');
test('when the shell exits the tab is marked exited and a notice is written');
test('typing after exit is not sent anywhere');
test('a shell that fails to start shows the error and leaves no tab or screen');
test('closeTerminal closes the shell, disposes the screen and removes the tab');
test('closing an exited terminal does not ask the backend to close it again');
test('closing the active terminal activates its right neighbour, else the left one');
test('ensureTerminal opens one terminal only when there are none');
test('two terminals get different ids and numbered titles');
```

- [ ] **Step 2: Jalankan, pastikan gagal** — `pnpm test tests/application/terminalStore tests/domain/terminal`.
- [ ] **Step 3: Implementasikan `domain/terminal.ts`, port, dan `terminalStore.ts`.**
- [ ] **Step 4: Jalankan, pastikan lulus** — `pnpm test` → semua lulus; `pnpm exec tsc --noEmit` bersih.
- [ ] **Step 5: Commit** — `feat: terminal store and ports`

---

### Task 6: Adapter Tauri PTY dan layar xterm

**Files:**
- Create: `src/infrastructure/tauri/pty.ts`, `src/infrastructure/xterm/screens.ts`, `src/infrastructure/xterm/theme.ts`
- Modify: `src/index.tsx`, `package.json` (`@xterm/xterm`, `@xterm/addon-fit`)
- Test: `tests/infrastructure/tauri/pty.test.ts`

**Interfaces:**
- Consumes: `PtyPort`, `TerminalScreenPort` (Task 5); perintah Tauri (Task 4).
- Produces:

```ts
// infrastructure/tauri/pty.ts
export const tauriPty: PtyPort;

// infrastructure/xterm/screens.ts
export interface XtermScreens extends TerminalScreenPort {
  attach(id: number | null, host: HTMLElement): void; // tampilkan layar `id` di `host`, sembunyikan yang lain
  fit(): void;                                        // sesuaikan layar yang tampil dengan ukuran host
  focus(): void;
}
export function createXtermScreens(): XtermScreens;
```

Aturan perilaku:
- `tauriPty.open` membuat `Channel`, memetakan `{ type: 'output', data }` → `onOutput` dan `{ type: 'exit', code }` → `onExit`, lalu `invoke('terminal_open', { id, profileId, cwd, cols, rows, onEvent })`. Semua penolakan menjadi `AppError`.
- `createXtermScreens` memuat `@xterm/xterm`, `@xterm/addon-fit`, dan CSS-nya lewat `import()` pada `create` pertama. `write` sebelum pustaka siap diantrekan dan ditulis berurutan sesudahnya.
- Tiap terminal punya elemen sendiri; `attach` memindahkannya ke `host` dan memanggil `fit`.
- Opsi: `fontFamily` dari `--font-mono`, `scrollback: 5000`, `cursorBlink: true`, tema dari `theme.ts`.
- Penangan tombol kustom: `Ctrl+C` dengan seleksi → salin, tidak dikirim ke shell; `Ctrl+Shift+C` → salin; `Ctrl+V` dan `Ctrl+Shift+V` → biarkan tempel bawaan browser.

- [ ] **Step 1: Tulis tes yang gagal** (`pty.test.ts`, memakai `mockIPC`):

```ts
test('listShells returns the profiles from the backend');
test('open sends id, profileId, cwd and size with camelCase names');
test('events on the channel reach onOutput and onExit');
test('write, resize and close call the matching commands');
test('a backend error becomes an AppError');
```

- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Pasang paket; implementasikan kedua adapter; daftarkan di `configurePorts` (`src/index.tsx`).**
- [ ] **Step 4:** `pnpm test` lulus; `pnpm exec tsc --noEmit` bersih; `pnpm exec vite build` → `xterm` berada di chunk terpisah dan JS awal gzip tetap ≤ 250 KB.
- [ ] **Step 5: Commit** — `feat: xterm screens and Tauri PTY adapter`

---

### Task 7: Panel Terminal dan pintasan

**Files:**
- Create: `src/presentation/terminal/TerminalPanel.tsx`, `src/presentation/styles/terminal.css`
- Modify: `src/presentation/layout/Shell.tsx`, `src/presentation/layout/ToolWindow.tsx`, `src/presentation/App.tsx`, `src/presentation/shortcuts.ts`, `src/presentation/reloadGuard.ts`, `src/index.tsx`
- Test: `tests/presentation/shortcuts.test.ts`, `tests/presentation/reloadGuard.test.ts`

**Interfaces:**
- Consumes: `terminals`, `openTerminal`, `ensureTerminal`, `activateTerminal`, `closeTerminal` (Task 5); `XtermScreens` (Task 6).
- Produces:

```ts
// shortcuts.ts
export interface ShortcutOptions {
  /** Abaikan pintasan ini sepenuhnya bila fokus berada di dalam selector ini. */
  exceptIn?: string;
  /** Cegah aksi bawaan browser, tapi biarkan tombolnya tetap sampai ke elemen yang fokus. */
  passThrough?: boolean;
}
export function registerShortcut(combo: string, handler: () => void, options?: ShortcutOptions): () => void;

// TerminalPanel.tsx
export interface TerminalSurface { attach(id: number | null, host: HTMLElement): void; fit(): void; focus(): void }
export function TerminalTabs(): JSX.Element;                               // untuk header tool window
export function TerminalPanel(props: { surface: TerminalSurface }): JSX.Element;
```

Aturan perilaku:
- `Ctrl+S`, `Ctrl+W`, `Ctrl+F4` didaftarkan dengan `exceptIn: '.terminal-host'`.
- Penjaga reload mendaftarkan `F5`, `Ctrl+F5`, `Ctrl+R`, `Ctrl+Shift+R` dengan `passThrough: true`.
- `ToolWindow` menerima `headerExtra` opsional, ditaruh setelah judul. Untuk Terminal isinya `TerminalTabs`: tab (judul, tombol tutup, redup bila `exited`), tombol `+` (terminal default), dan tombol panah yang membuka menu daftar shell.
- Saat panel Terminal tampil: `loadShells()` lalu `ensureTerminal()`.
- `TerminalPanel` memanggil `surface.attach(activeId, host)` saat tab aktif berganti, `surface.fit()` lewat `ResizeObserver`, dan `surface.focus()` setelah attach.
- Menu shell tertutup saat memilih, klik di luar, atau `Escape`.
- Tanpa tab (semua ditutup): empty state dengan tombol "New Terminal".

- [ ] **Step 1: Tulis tes yang gagal**

```ts
// shortcuts.test.ts
test('a shortcut with exceptIn is ignored while focus is inside that element');   // handler tidak dipanggil, default tidak dicegah
test('a shortcut with exceptIn still fires elsewhere');
test('a passThrough shortcut prevents the default but lets the key reach its target'); // listener di target tetap menerima event
// reloadGuard.test.ts
test('a reload key pressed in the terminal is still delivered to the terminal');
```

- [ ] **Step 2: Jalankan, pastikan gagal.**
- [ ] **Step 3: Implementasikan opsi pintasan, lalu panel, tab, menu, dan gaya.**
- [ ] **Step 4:** `pnpm test` lulus; `pnpm exec tsc --noEmit` bersih.
- [ ] **Step 5: Commit** — `feat: terminal panel with shell picker and tabs`

---

### Task 8: Verifikasi end-to-end dan angka

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Build** — `pnpm tauri build` sukses.
- [ ] **Step 2: Skenario terminal pada exe release** (lewat port debug WebView2, seperti skenario Fase 0), untuk tiap shell yang terpasang:
  - (a) `Alt+F12` membuka panel dan prompt tampil.
  - (b) perintah sederhana memberi keluaran yang benar: `echo rp_%OS%` di cmd, `Write-Output ('rp' + 'ps')` di PowerShell, `echo $((6*7))` di Git Bash.
  - (c) terminal dibuka di folder workspace.
  - (d) mengubah tinggi panel mengubah jumlah baris yang dilaporkan shell (`mode con` / `$Host.UI.RawUI.WindowSize` / `tput lines`).
  - (e) `exit` menampilkan `[Process exited with code 0]`.
  - (f) dua tab menyimpan isi masing-masing saat berpindah.
  - (g) `Ctrl+W` di Git Bash menghapus kata, tab editor tidak tertutup; `Ctrl+R` membuka pencarian riwayat; `F5` tidak me-reload.
  - (h) keluaran berisi `héllo 日本` tampil tanpa `�`.
  - (i) `dir /s C:\Windows\System32` berjalan dan jendela tetap menanggapi klik.
- [ ] **Step 3: Proses yatim** — catat turunan `rustpilot.exe`; tutup satu tab saat `ping -t 127.0.0.1` berjalan → proses `ping` hilang; tutup aplikasi dengan dua shell hidup → tidak ada turunan tersisa.
- [ ] **Step 4: Skenario Fase 0 (41 pemeriksaan) dijalankan ulang** → tetap lulus.
- [ ] **Step 5: Ukur dan catat di README** — JS awal gzip (tanpa membuka terminal), waktu dari `Alt+F12` sampai prompt tampil, ukuran installer; tambahkan bagian "Terminal" (shell yang didukung, pintasan salin/tempel).
- [ ] **Step 6: Commit** — `feat: terminal verified end to end with baseline numbers`
