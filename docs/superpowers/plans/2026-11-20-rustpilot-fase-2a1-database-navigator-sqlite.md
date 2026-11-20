# RustPilot Fase 2A.1 (Database Navigator + SQLite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool window Database berisi navigator koneksi sungguhan untuk SQLite: tambah/ubah/hapus koneksi, pohon schema lazy, query console `.sql` dengan `Ctrl+Enter`, grid hasil read-only, dan Stop. Ini tahap pertama dari alur kerja mirip Navicat yang dibangun di atas islands UI.

**Architecture:** Backend memegang sesi koneksi di `DataSourceSessions` (use case murni) yang bicara ke engine lewat port `DataSourceDriver` dan `SqlExecutor`. Adapter pertama `SqlxSqliteDriver`. Frontend hanya melihat `DataNode` generik untuk pohon dan `SqlResult` untuk grid, sehingga tahap 2A.2 (PostgreSQL/MySQL/MariaDB) dan 2A.3 (SQL Server) cukup menambah adapter.

**Tech Stack:** `sqlx` 0.8 (`sqlite`, `runtime-tokio`), `async-trait`, `futures` (untuk `Abortable`), `@codemirror/lang-sql` (sudah ada).

**Spec:** `docs/superpowers/specs/2026-11-20-rustpilot-fase-2-database-design.md`

## Global Constraints

- Aturan di `CLAUDE.md` berlaku: clean architecture, tes di `tests/` dan `src-tauri/tests/`, tes gagal ditulis dulu, semua kode dan teks UI bahasa Inggris, commit satu baris bahasa Inggris tanpa atribusi, `docs/` tidak di-commit.
- `invoke` hanya di `src/infrastructure/tauri/`. `sqlx` hanya di `src-tauri/src/infrastructure/`. `application/` Rust tidak mengimpor Tauri maupun `sqlx`.
- Komponen di `src/presentation/database/` dimuat dengan `lazy()`; tidak masuk bundle awal.
- Field JSON lintas IPC camelCase.
- Hanya SQLite di tahap ini. Tipe `EngineKind` sudah berisi semua engine supaya data koneksi tidak perlu dimigrasi, tetapi dialog hanya menawarkan SQLite dan backend menolak engine lain dengan `ErrorKind::InvalidConfig` "not supported yet".
- Tidak ada secret di tahap ini (SQLite tanpa password); `SecretStore` ditambahkan di 2A.2.
- Batas: 500 baris per eksekusi, sel teks 10.000 karakter.

## Review Focus

1. **Statement di kursor** benar untuk titik koma di dalam string, identifier berkutip, komentar baris/blok, dan kursor tepat di titik koma atau di baris kosong antar statement. (Task 5)
2. **Stop** benar-benar membatalkan query lambat (`WITH RECURSIVE` yang panjang) dan tidak meninggalkan eksekusi yatim di `DataSourceSessions`. (Task 2, Task 3)
3. **Hasil besar** (`SELECT` dari tabel 100.000 baris) berhenti di 500 baris, `truncated: true`, memori stabil, grid tetap lancar. (Task 3, Task 10)
4. **Hasil basi:** menjalankan dua query cepat berturut-turut tidak membuat hasil yang lama menimpa yang baru. (Task 8)
5. **Koneksi yatim:** disconnect, hapus koneksi, dan keluar aplikasi menutup pool. (Task 2, Task 4)
6. **Bundle awal** tidak membesar: panel database, grid, dan dialog hanya dimuat saat tool window dibuka. (Task 9, Task 11)

---

### Task 1: Domain data source dan SQL (Rust)

**Files:**
- Create: `src-tauri/src/domain/data_source.rs`, `src-tauri/src/domain/sql.rs`
- Modify: `src-tauri/src/domain/mod.rs`, `src-tauri/src/domain/error.rs`
- Test: `src-tauri/tests/data_source_domain.rs`

**Interfaces:**

```rust
// domain/data_source.rs
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum EngineKind { Sqlite, Postgres, Mysql, Mariadb, Mssql, Redis, Kafka, Rabbitmq }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceConfig {
    pub id: String,
    pub name: String,
    pub engine: EngineKind,
    /// SQLite only.
    pub file_path: Option<String>,
    pub read_only: bool,
}

impl DataSourceConfig { pub fn validate(&self) -> Result<(), AppError>; }

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind { Schema, Folder, Table, View, Column }

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DataNode {
    /// Path segments from the connection root, e.g. ["main", "tables", "users"].
    pub path: Vec<String>,
    pub label: String,
    pub kind: NodeKind,
    /// Extra text shown greyed after the label, e.g. "INTEGER, PK".
    pub detail: Option<String>,
    pub has_children: bool,
}

// domain/sql.rs
pub const MAX_ROWS: usize = 500;
pub const MAX_CELL_CHARS: usize = 10_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum CellValue { Null, Bool(bool), Number(f64), Text(String) }

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SqlColumn { pub name: String, pub type_name: String }

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SqlResult {
    pub columns: Vec<SqlColumn>,
    pub rows: Vec<Vec<CellValue>>,
    pub truncated: bool,
    pub rows_affected: Option<u64>,
    pub elapsed_ms: u64,
}

pub fn clip_text(text: String) -> CellValue;          // potong di MAX_CELL_CHARS + "…"
pub fn integer_cell(value: i64) -> CellValue;         // di luar ±2^53-1 → Text
```

- `ErrorKind` ditambah `Connection`, `Query`, `Cancelled`, `InvalidConfig`.

- [ ] **Step 1: Tulis tes yang gagal** — `data_source_domain.rs`:
  - `sqlite_config_needs_a_file_path`, `name_must_not_be_blank`, `unsupported_engine_is_rejected_for_now` (Postgres → `InvalidConfig`, pesan berisi "not supported yet").
  - `config_round_trips_as_camel_case_json` (`filePath`, `readOnly`, `"engine":"sqlite"`).
  - `cell_values_serialize_as_plain_json` (`null`, `true`, `1.5`, `"x"`).
  - `large_integers_become_text` (`2^53` → `"9007199254740992"`, `42` → `42`).
  - `long_text_is_clipped` (10.001 karakter → 10.000 + `…`; multi-byte tidak terpotong di tengah karakter).
  - `data_node_serializes_has_children_in_camel_case`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `cargo test --test data_source_domain`.
- [ ] **Step 3: Implementasikan.**
- [ ] **Step 4: Jalankan, pastikan lulus.**
- [ ] **Step 5: Commit** — `feat: data source and SQL result domain types`

---

### Task 2: Port dan sesi data source (Rust)

**Files:**
- Modify: `src-tauri/src/domain/ports.rs`, `src-tauri/src/application/mod.rs`, `src-tauri/Cargo.toml` (`async-trait`, `futures`)
- Create: `src-tauri/src/application/data_source.rs`
- Test: `src-tauri/tests/data_source_sessions.rs`

**Interfaces:**

```rust
// domain/ports.rs
#[async_trait]
pub trait DataSourceDriver: Send + Sync {
    /// Opens a live connection. Fails within 10 seconds.
    async fn connect(&self, config: &DataSourceConfig) -> Result<Box<dyn DataSourceConnection>, AppError>;
}

#[async_trait]
pub trait DataSourceConnection: Send + Sync {
    async fn children(&self, path: &[String]) -> Result<Vec<DataNode>, AppError>;
    async fn execute(&self, sql: &str) -> Result<SqlResult, AppError>;
    async fn close(&self);
}

// application/data_source.rs
pub struct DataSourceSessions { /* Mutex<HashMap<String, Arc<dyn DataSourceConnection>>>,
                                   Mutex<HashMap<u64, AbortHandle>> */ }
impl DataSourceSessions {
    pub fn new() -> Self;
    pub async fn test(&self, driver: &dyn DataSourceDriver, config: &DataSourceConfig) -> Result<(), AppError>;
    pub async fn connect(&self, driver: &dyn DataSourceDriver, config: DataSourceConfig) -> Result<(), AppError>;
    pub async fn disconnect(&self, id: &str);
    pub async fn children(&self, id: &str, path: &[String]) -> Result<Vec<DataNode>, AppError>;
    pub async fn execute(&self, id: &str, execution_id: u64, sql: &str) -> Result<SqlResult, AppError>;
    pub fn cancel(&self, execution_id: u64);
    pub async fn close_all(&self);
}
```

Aturan perilaku:
- `test` = validate + connect + close; tidak menyimpan sesi.
- `connect` untuk id yang sudah terhubung menutup koneksi lama dulu.
- `children`/`execute` pada id yang tidak terhubung → `Connection` "Not connected".
- `execute` membungkus future dengan `Abortable`; `cancel` → hasilnya `Cancelled`. Handle eksekusi selalu dihapus dari map setelah selesai, sukses maupun gagal.
- `cancel` untuk id yang tidak dikenal tidak melakukan apa-apa.

- [ ] **Step 1: Tulis tes yang gagal** dengan `FakeDriver`/`FakeConnection` (mencatat panggilan `close`, `execute` bisa ditahan dengan `tokio::sync::Notify`):
  - `test_does_not_keep_a_session`, `invalid_config_fails_before_connecting`.
  - `connecting_twice_closes_the_previous_connection`.
  - `children_and_execute_need_a_connection`.
  - `cancel_stops_a_running_execution` (hasil `Cancelled`, map eksekusi kosong).
  - `failed_execution_is_forgotten` (map eksekusi kosong setelah error).
  - `disconnect_closes_the_connection`, `close_all_closes_every_connection`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `cargo test --test data_source_sessions`.
- [ ] **Step 3: Implementasikan.**
- [ ] **Step 4: Jalankan, pastikan lulus.**
- [ ] **Step 5: Commit** — `feat: data source sessions with cancellable execution`

---

### Task 3: Adapter SQLite dengan sqlx

**Files:**
- Modify: `src-tauri/Cargo.toml` (`sqlx = { version = "0.8", default-features = false, features = ["runtime-tokio", "sqlite"] }`), `src-tauri/src/infrastructure/mod.rs`
- Create: `src-tauri/src/infrastructure/sqlx_driver.rs`
- Test: `src-tauri/tests/sqlite_driver.rs`

Aturan perilaku:
- Pool maksimal 2 koneksi, idle timeout 5 menit, connect timeout 10 detik. `read_only` → `SqliteConnectOptions::read_only(true)`. File yang tidak ada → `NotFound` (tidak membuat file baru).
- Pohon:
  - `[]` → satu node per database dari `PRAGMA database_list` (`main`, dan yang di-`ATTACH`), kind `Schema`.
  - `[schema]` → folder `Tables` dan `Views` (path `[schema, "tables"]`, `[schema, "views"]`).
  - `[schema, "tables"]` → tabel dari `sqlite_master` (tanpa `sqlite_%`), urut nama; `views` serupa.
  - `[schema, folder, name]` → kolom dari `pragma_table_info`, `detail` = `"<TYPE>[, PK][, NOT NULL]"`, `has_children: false`.
  - Nama di query selalu sebagai parameter atau identifier yang di-quote; nama berisi `"` tetap benar.
- `execute`: `fetch` streaming, berhenti setelah 501 baris (→ 500 + `truncated: true`). Statement tanpa kolom → `rows_affected`. Konversi: `NULL` → `Null`, `INTEGER` → `integer_cell`, `REAL` → `Number`, `TEXT` → `clip_text`, `BLOB` → `Text("<binary N bytes>")`. Error SQLite → `Query` dengan pesan engine.
- `elapsed_ms` diukur di adapter.

- [ ] **Step 1: Tulis tes yang gagal** (memakai `tempfile`, `#[tokio::test]`):
  - `lists_main_schema_then_folders_then_tables_then_columns`.
  - `table_names_with_quotes_are_handled` (tabel `we"ird`).
  - `select_returns_columns_and_typed_cells` (NULL, integer besar, real, text, blob).
  - `select_stops_at_500_rows` (tabel 1.000 baris → 500, `truncated`).
  - `insert_reports_rows_affected`.
  - `syntax_error_is_a_query_error`.
  - `missing_file_is_not_found_and_not_created`.
  - `read_only_connection_rejects_writes`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `cargo test --test sqlite_driver`.
- [ ] **Step 3: Implementasikan.**
- [ ] **Step 4: Jalankan, pastikan lulus.** Catat kenaikan ukuran installer setelah `make build` di Task 11.
- [ ] **Step 5: Commit** — `feat: SQLite data source driver`

---

### Task 4: Perintah Tauri dan wiring

**Files:**
- Modify: `src-tauri/src/presentation/commands.rs`, `src-tauri/src/lib.rs`

**Interfaces:**

```rust
pub struct DataSourceState {
    pub sessions: DataSourceSessions,
    pub driver: Box<dyn DataSourceDriver>,
}

#[tauri::command] async fn ds_test(state, config: DataSourceConfig) -> Result<(), AppError>;
#[tauri::command] async fn ds_connect(state, config: DataSourceConfig) -> Result<(), AppError>;
#[tauri::command] async fn ds_disconnect(state, id: String) -> Result<(), AppError>;
#[tauri::command] async fn ds_children(state, id: String, path: Vec<String>) -> Result<Vec<DataNode>, AppError>;
#[tauri::command] async fn ds_console_path(app: AppHandle, id: String) -> Result<String, AppError>;
#[tauri::command] async fn sql_execute(state, id: String, execution_id: u64, sql: String) -> Result<SqlResult, AppError>;
#[tauri::command] fn sql_cancel(state, execution_id: u64);
```

- `ds_console_path` membuat `<app_data_dir>/consoles/` dan file `<id>.sql` kosong bila belum ada, lalu mengembalikan path absolutnya. `id` hanya boleh `[A-Za-z0-9-]` (cegah path traversal) → selain itu `InvalidConfig`.
- `RunEvent::Exit` memanggil `close_all` lewat `tauri::async_runtime::block_on`, di samping penutupan terminal.

- [ ] **Step 1:** Tambahkan tes `console_id_must_be_safe` untuk fungsi validasi id (taruh validasinya di `domain/data_source.rs` agar bisa dites tanpa Tauri).
- [ ] **Step 2:** Implementasikan perintah dan wiring; `make check`.
- [ ] **Step 3: Commit** — `feat: data source Tauri commands`

---

### Task 5: Domain frontend dan pemecah statement

**Files:**
- Create: `src/domain/dataSource.ts`, `src/domain/sql.ts`
- Test: `tests/domain/dataSource.test.ts`, `tests/domain/sql.test.ts`

**Interfaces:**

```ts
// domain/dataSource.ts
export type EngineKind = 'sqlite' | 'postgres' | 'mysql' | 'mariadb' | 'mssql' | 'redis' | 'kafka' | 'rabbitmq';
export const SUPPORTED_ENGINES: readonly EngineKind[] = ['sqlite'];
export interface DataSourceConfig { id: string; name: string; engine: EngineKind; filePath: string | null; readOnly: boolean }
export type NodeKind = 'schema' | 'folder' | 'table' | 'view' | 'column';
export interface DataNode { path: string[]; label: string; kind: NodeKind; detail: string | null; hasChildren: boolean }
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export function validateConfig(config: DataSourceConfig): string | null; // pesan error form atau null
export function defaultName(config: DataSourceConfig): string;           // nama file SQLite tanpa folder
export function nodeKey(path: readonly string[]): string;                  // kunci stabil untuk map pohon

// domain/sql.ts
export type CellValue = null | boolean | number | string;
export interface SqlColumn { name: string; typeName: string }
export interface SqlResult { columns: SqlColumn[]; rows: CellValue[][]; truncated: boolean; rowsAffected: number | null; elapsedMs: number }
export interface StatementRange { from: number; to: number; text: string }
export function splitStatements(text: string): StatementRange[];
export function statementAt(text: string, offset: number): StatementRange | null;
export function previewQuery(engine: EngineKind, schema: string, table: string): string;
export function quoteIdentifier(engine: EngineKind, name: string): string;
export function resultSummary(result: SqlResult): string; // "500+ rows in 12 ms" / "3 rows affected in 4 ms"
```

Aturan `splitStatements`: titik koma memisah kecuali di dalam `'…'` (dengan `''`), `"…"`, `` `…` ``, `[…]`, `-- …\n`, `/* … */`, `$tag$…$tag$`. Rentang di-trim; statement kosong dibuang. `statementAt`: statement yang memuat `offset`; bila `offset` di spasi antar statement, ambil statement sebelumnya pada baris yang sama, selain itu yang berikutnya; teks tanpa statement → `null`.

- [ ] **Step 1: Tulis tes yang gagal** — termasuk: titik koma dalam string/komentar/identifier/dollar-quote, `''` di string, kursor di akhir statement tepat setelah `;`, kursor di baris kosong, teks hanya komentar → `null`, `quoteIdentifier('sqlite', 'we"ird') === '"we""ird"'`, `previewQuery('sqlite','main','users')`, validasi (`filePath` kosong, engine belum didukung).
- [ ] **Step 2: Jalankan, pastikan gagal** — `pnpm test tests/domain`.
- [ ] **Step 3: Implementasikan.**
- [ ] **Step 4: Jalankan, pastikan lulus.**
- [ ] **Step 5: Commit** — `feat: data source domain and SQL statement splitting`

---

### Task 6: Port dan adapter Tauri (frontend)

**Files:**
- Modify: `src/application/ports.ts`, `src/index.tsx`, `tests/helpers/ports.ts`
- Create: `src/infrastructure/tauri/dataSource.ts`
- Test: `tests/infrastructure/tauri/dataSource.test.ts`

**Interfaces:**

```ts
/** Live data source connections on the backend. Every method rejects with an `AppError`. */
export interface DataSourcePort {
  test(config: DataSourceConfig): Promise<void>;
  connect(config: DataSourceConfig): Promise<void>;
  disconnect(id: string): Promise<void>;
  children(id: string, path: string[]): Promise<DataNode[]>;
  consolePath(id: string): Promise<string>;
  execute(id: string, executionId: number, sql: string): Promise<SqlResult>;
  cancel(executionId: number): Promise<void>;
}
```

- `DialogPort` ditambah `pickFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>` dan `confirm(message: string): Promise<boolean>` bila belum ada; adapter `tauri/dialog.ts` ikut.
- Fake di `tests/helpers/ports.ts`: `FakeDataSourcePort` dengan hasil yang bisa diatur dan eksekusi yang bisa ditahan (promise manual).

- [ ] **Step 1: Tulis tes adapter yang gagal** mengikuti pola `tests/infrastructure/tauri/git.test.ts`: nama perintah dan argumen camelCase (`executionId`, `path`).
- [ ] **Step 2–4:** Implementasikan, wiring di `configurePorts`, tes lulus.
- [ ] **Step 5: Commit** — `feat: Tauri data source adapter`

---

### Task 7: Store data source (navigator)

**Files:**
- Create: `src/application/dataSourceStore.ts`
- Test: `tests/application/dataSourceStore.test.ts`

**Interfaces:**

```ts
export interface DataSourceStoreState {
  sources: DataSourceConfig[];
  status: Record<string, ConnectionStatus>;
  errors: Record<string, string>;
  /** Children per connection, keyed by `nodeKey(path)`. */
  children: Record<string, Record<string, DataNode[]>>;
  expanded: Record<string, Record<string, boolean>>;
  loading: Record<string, Record<string, boolean>>;
  selected: { id: string; path: string[] } | null;
}
export const dataSources: DataSourceStoreState;
export function loadSources(): void;                        // dari StoragePort 'rustpilot.dataSources'
export function saveSource(config: DataSourceConfig): void; // tambah atau ganti, lalu persist
export async function removeSource(id: string): Promise<void>; // disconnect dulu bila terhubung
export async function connectSource(id: string): Promise<void>;
export async function disconnectSource(id: string): Promise<void>;
export async function toggleNode(id: string, path: string[]): Promise<void>; // root = []
export async function refreshSource(id: string): Promise<void>;
export function selectNode(id: string, path: string[]): void;
export function tablesOf(id: string): Record<string, string[]>; // untuk autocomplete: "schema.table" → kolom
```

Aturan: memperluas koneksi yang belum terhubung menghubungkannya dulu; gagal connect → status `error` + pesan, tidak ada anak; anak yang sudah dimuat tidak dimuat ulang saat dilipat-dibuka lagi; `refreshSource` membuang cache anak lalu memuat ulang node yang sedang terbuka; data storage rusak → daftar kosong, tidak crash.

- [ ] **Step 1: Tulis tes yang gagal** untuk tiap aturan di atas.
- [ ] **Step 2–4:** Implementasikan, tes lulus.
- [ ] **Step 5: Commit** — `feat: data source navigator store`

---

### Task 8: Store console SQL

**Files:**
- Create: `src/application/sqlConsoleStore.ts`
- Test: `tests/application/sqlConsoleStore.test.ts`

**Interfaces:**

```ts
export interface SqlConsoleState {
  /** File path → data source id for consoles and attached `.sql` files. */
  attached: Record<string, string>;
  running: { path: string; executionId: number; sql: string } | null;
  results: Record<string, { result: SqlResult | null; error: string | null; sql: string }>;
}
export async function openConsole(sourceId: string): Promise<void>;          // consolePath → openFile → attach
export function attach(path: string, sourceId: string | null): void;          // persist di StoragePort
export async function runAtCursor(path: string, text: string, from: number, to: number): Promise<void>;
export async function runAll(path: string, text: string): Promise<void>;
export async function stop(): Promise<void>;
export async function openTablePreview(sourceId: string, schema: string, table: string): Promise<void>;
```

Aturan: seleksi kosong → `statementAt`; seleksi berisi → `splitStatements` atas seleksi, jalan berurutan, berhenti di error. Satu eksekusi dalam satu waktu; menjalankan lagi saat ada yang berjalan membatalkan yang lama dulu. Hasil dari `executionId` yang sudah bukan yang terbaru dibuang. Koneksi belum tersambung → `connectSource` dulu. `openTablePreview` menambahkan `previewQuery` di akhir file console, lalu menjalankannya.

- [ ] **Step 1: Tulis tes yang gagal** — termasuk "hasil basi dibuang" dengan dua eksekusi yang diselesaikan terbalik, dan Stop memanggil `cancel` dengan id yang benar.
- [ ] **Step 2–4:** Implementasikan, tes lulus.
- [ ] **Step 5: Commit** — `feat: SQL console store`

---

### Task 9: Panel Database dan dialog koneksi

**Files:**
- Create: `src/presentation/database/DatabasePanel.tsx`, `src/presentation/database/ConnectionDialog.tsx`, `src/presentation/database/DataTree.tsx`, `src/presentation/database/dbIcons.tsx`, `src/presentation/styles/database.css`, `THIRD_PARTY_NOTICES.md` (bila belum ada)
- Modify: `src/presentation/layout/toolWindows.tsx` (panel `database` memakai `lazy(() => import('../database/DatabasePanel'))`)

Ikon (open source, kecil):
- `dbIcons.tsx` berisi komponen SVG inline, hanya yang dipakai tahap ini: dari **Lucide** (ISC) — `database`, `folder`, `table`, `eye` (view), `columns-3` (kolom), `key-round` (PK), `refresh-cw`, `play`, `square` (stop), `plug`/`unplug`, `terminal-square` (console), `plus`. Tanpa logo merek.
- `viewBox` asli, `stroke="currentColor"` (Lucide), ukuran lewat prop `size` seperti ikon di `layout/icons.tsx`.
- Ditaruh di folder `database/` supaya ikut chunk lazy, bukan bundle awal. Komentar sumber + lisensi di kepala file; entri Lucide di `THIRD_PARTY_NOTICES.md`.
- Cek: total `dbIcons.tsx` ≤ 12 KB.

Isi:
- Toolbar island: `+` (New data source → SQLite), Refresh, Disconnect, Console (buka console koneksi terpilih).
- Pohon: indikator status (titik hijau/abu/merah), spinner saat memuat, detail abu-abu di kanan label, menu konteks: Connect/Disconnect, Edit…, Open console, Refresh, Delete (konfirmasi dengan nama koneksi). Klik ganda tabel/view → `openTablePreview`. Keyboard: panah atas/bawah/kiri/kanan, Enter.
- Dialog: Name, File (Browse → `pickFile` filter `*.db, *.sqlite, *.sqlite3, *`), Read-only; tombol Test Connection (hasil inline: "Connection succeeded" / pesan error), Cancel, OK. Validasi `validateConfig` sebelum OK.
- Empty state: "No data sources yet" + tombol "Add SQLite database".

- [ ] **Step 1:** Implementasikan; `make check`.
- [ ] **Step 2:** Coba di `make dev`: tambah DB, perluas pohon, edit, hapus, error file hilang.
- [ ] **Step 3: Commit** — `feat: database tool window with SQLite navigator`

---

### Task 10: Console bar, panel hasil, dan grid

**Files:**
- Create: `src/presentation/database/ConsoleBar.tsx`, `src/presentation/database/ResultPanel.tsx`, `src/presentation/database/ResultGrid.tsx`, `src/infrastructure/codemirror/sqlSchema.ts`
- Modify: `src/presentation/editor/EditorPane.tsx`, `src/presentation/shortcuts.ts`, `src/infrastructure/codemirror/extensions.ts`

Isi:
- `ConsoleBar` di atas editor bila tab aktif `.sql`: pemilih koneksi (`(none)` + daftar), tombol Run (`Ctrl+Enter`), Run all (`Ctrl+Shift+Enter`), Stop (aktif saat berjalan).
- `ResultPanel` di bawah editor bila file punya koneksi: splitter dengan tinggi diingat (`StoragePort`), header berisi `resultSummary`, "Showing first 500 rows" bila `truncated`, pesan error berwarna error, SQL yang dijalankan (dipotong satu baris).
- `ResultGrid`: header lengket, kolom nomor baris, virtual scrolling (render hanya baris terlihat + 10 cadangan, tinggi baris tetap), resize kolom dengan seret, klik sel memilih, Shift+klik rentang, `Ctrl+C` menyalin TSV, `NULL` tampil miring abu-abu, angka rata kanan.
- `sqlSchema.ts`: `sql({ dialect: SQLite, schema: tablesOf(id) })` dipasang ulang lewat `Compartment` saat koneksi file atau schema berubah.
- `Ctrl+Enter` hanya ditangani saat fokus di editor `.sql` yang punya koneksi; selain itu perilaku editor sekarang tidak berubah.

- [ ] **Step 1:** Implementasikan; `make check`.
- [ ] **Step 2:** Coba di `make dev`: statement di kursor, seleksi multi-statement, error, 100.000 baris (truncated, scroll lancar), Stop pada `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c;`, salin sel, autocomplete tabel/kolom.
- [ ] **Step 3: Commit** — `feat: SQL console with result grid`

---

### Task 11: Verifikasi tahap

- [ ] `make test` dan `make check` hijau.
- [ ] `make build`: catat ukuran installer (target naik ≤ 4 MB dari Fase 1) dan JS awal gzip (tetap ≤ 250 KB; panel database chunk terpisah).
- [ ] Review Focus 1–6 dicek manual satu per satu; tutup aplikasi saat query berjalan → tidak ada proses/handle tertinggal.
- [ ] Centang 2A.1 di spec; tulis plan 2A.2 (PostgreSQL, MySQL, MariaDB + Credential Manager) sebelum mulai tahap berikutnya.
