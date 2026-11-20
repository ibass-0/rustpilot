# RustPilot Fase 2A.2 (PostgreSQL, MySQL, MariaDB + Credential Manager) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Navigator dan query console yang sudah jalan untuk SQLite sekarang juga bisa menyambung ke PostgreSQL, MySQL, dan MariaDB, dengan password di Windows Credential Manager dan Stop yang benar-benar membatalkan query di server.

**Architecture:** Tidak ada lapisan baru. `SqlxDriver` memilih adapter per engine; adapter server (`ServerSource`) dan SQLite sama-sama mengimplementasikan `DataSourceConnection`, jadi `DataSourceSessions`, store, pohon, console, dan grid tidak berubah. Yang baru: field koneksi server di config, port `SecretStore` (Credential Manager), dan pembatalan query lewat koneksi kontrol kedua.

**Tech Stack:** `sqlx` 0.8 (tambah `postgres`, `mysql`, `tls-rustls`), `keyring` untuk Credential Manager.

**Spec:** `docs/superpowers/specs/2026-11-20-rustpilot-fase-2-database-design.md` (tahap 2A.2)

## Global Constraints

- Aturan `CLAUDE.md` berlaku: clean architecture, tes di `tests/` dan `src-tauri/tests/`, tes gagal ditulis dulu, semua kode dan teks UI bahasa Inggris, commit satu baris bahasa Inggris tanpa atribusi, `docs/` tidak di-commit.
- `sqlx` dan `keyring` hanya di `src-tauri/src/infrastructure/`.
- **Password tidak pernah** disimpan di `StoragePort`/`localStorage`, dicetak di log, masuk pesan error, atau dikirim balik ke frontend. Frontend hanya tahu `savePassword: boolean`. `Debug` untuk tipe yang memegang password disamarkan.
- Ikon: tetap Lucide saja, tanpa logo merek (lihat memori `icons-fully-open-source`).
- Field JSON lintas IPC camelCase. Windows 11 saja.
- Batas hasil dan perilaku sel mengikuti spec: 500 baris, sel 10.000 karakter, bilangan di luar rentang aman JS dan `numeric` jadi string.
- Connect timeout 10 detik.
- Tes yang butuh server nyata dijalankan terhadap container Docker dan **dilewati (bukan gagal)** bila env var-nya tidak diset, supaya `make test` tetap hijau tanpa Docker.

## Keputusan Teknis

- **Protokol teks untuk hasil.** Query dijalankan lewat `sqlx::raw_sql` (simple query di PostgreSQL, `COM_QUERY` di MySQL), sehingga setiap nilai datang sebagai teks. Konversi ke `CellValue` ditentukan nama tipe kolom: integer/serial → angka (via `integer_cell`), float → angka, `bool` → boolean, `bytea`/`BLOB` → `<binary N bytes>`, lainnya → teks. Ini membuat `numeric`, tanggal/waktu, UUID, JSON, array, enum, dan tipe ekstensi tampil benar tanpa fitur `sqlx` tambahan.
- **Satu koneksi eksekusi + satu koneksi kontrol.** Seperti SQLite (satu koneksi per sumber), tetapi untuk server pembatalan butuh koneksi kedua: PostgreSQL `SELECT pg_cancel_backend(<pid>)`, MySQL/MariaDB `KILL QUERY <connection_id>`. Pid/id diambil saat connect (`pg_backend_pid()` / `CONNECTION_ID()`). Koneksi kontrol dibuka saat `interrupt` dan ditutup sesudahnya; `interrupt` itu sinkron, jadi ia men-spawn pekerjaan itu di `tokio::runtime::Handle` yang disimpan saat connect.
- **SSL:** `disable` / `prefer` (bawaan) / `require`, lewat `tls-rustls`. Tanpa verifikasi CA kustom di tahap ini.
- **Identitas engine:** MariaDB memakai adapter MySQL; bedanya hanya label, port bawaan, dan dialek autocomplete (`MariaSQL`).
- **Pohon:** `[]` → daftar schema (PostgreSQL: semua kecuali `pg_*` dan `information_schema`; MySQL/MariaDB: database, kecuali `information_schema`, `performance_schema`, `mysql`, `sys`), `[schema]` → folder Tables/Views, dan seterusnya sama dengan SQLite. Detail kolom: `TIPE, PK` / `TIPE, NOT NULL`.
- **Secret:** `SecretStore` (get/set/delete, kunci `rustpilot/dataSource/<id>`) di Credential Manager. Password dikirim frontend hanya pada `ds_test`, `ds_connect`, dan `ds_save_secret`. Bila `savePassword` aktif dan tidak ada password di panggilan, backend membacanya dari store. Bila tidak disimpan, frontend menanyakannya saat connect dan password hanya hidup di memori backend selama terhubung.
- **`keyring`:** versi 4 memecah backend ke crate terpisah; periksa API-nya saat implementasi. Bila tidak praktis, pakai `keyring` 3.6 dengan fitur `windows-native`. Apa pun pilihannya, tersembunyi di balik port `SecretStore`.

## Review Focus

1. **Password bocor:** cari di `localStorage` (DevTools), log, pesan error, dan hasil `ds_*` — tidak ada. `Debug`/`Display` tidak mencetaknya. (Task 1, 4, 7)
2. **Stop** membatalkan `SELECT pg_sleep(60)` / `SELECT SLEEP(60)` di server (cek `pg_stat_activity` / `SHOW PROCESSLIST`), dan koneksi eksekusi masih bisa dipakai sesudahnya. (Task 3)
3. **Tipe data:** `numeric`, `bigint` besar, `timestamptz`, `uuid`, `jsonb`, `bytea`, array, `NULL` tampil benar di grid. (Task 3)
4. **Koneksi yatim:** disconnect, hapus koneksi, dan keluar aplikasi menutup koneksi eksekusi dan kontrol; tidak ada sesi tersisa di `pg_stat_activity`. (Task 3, 4)
5. **Password tak tersimpan:** koneksi dengan "Save password" mati menanyakan password setiap connect dan tidak menulis apa pun ke Credential Manager. Menghapus koneksi menghapus entri Credential Manager-nya. (Task 5, 7, 8)
6. **Salah password / host mati / port salah** memberi pesan jelas dalam ≤ 10 detik, tanpa membekukan UI. (Task 3, 8)
7. **Bundle awal** tetap ≤ 250 KB gzip; installer naik ≤ 4 MB dari 2,81 MB. (Task 9)

## Menyiapkan server tes (sekali, di luar repo)

```text
docker run -d --name rp-pg    -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16
docker run -d --name rp-mysql -e MYSQL_ROOT_PASSWORD=pw -p 53306:3306 mysql:8
docker run -d --name rp-maria -e MARIADB_ROOT_PASSWORD=pw -p 53307:3306 mariadb:11
```

Env var untuk tes: `RUSTPILOT_TEST_PG=postgres://postgres:pw@127.0.0.1:55432/postgres`, `RUSTPILOT_TEST_MYSQL=mysql://root:pw@127.0.0.1:53306/mysql`, `RUSTPILOT_TEST_MARIADB=mysql://root:pw@127.0.0.1:53307/mysql`. Tes membaca URL ini dan memecahnya jadi `DataSourceConfig` + password.

---

### Task 1: Domain koneksi server dan secret (Rust)

**Files:**
- Modify: `src-tauri/src/domain/data_source.rs`, `src-tauri/src/domain/ports.rs`, `src-tauri/src/domain/error.rs`
- Test: `src-tauri/tests/data_source_domain.rs` (tambah), `src-tauri/tests/connection_options.rs`

**Interfaces:**

```rust
// DataSourceConfig bertambah (semua opsional, camelCase di JSON):
pub host: Option<String>,
pub port: Option<u16>,
pub database: Option<String>,
pub user: Option<String>,
pub ssl_mode: SslMode,          // #[serde(default)] = Prefer
pub save_password: bool,        // #[serde(default)]

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SslMode { Disable, #[default] Prefer, Require }

pub const fn default_port(engine: EngineKind) -> Option<u16>; // pg 5432, mysql/mariadb 3306

/// A password that never prints.
pub struct Secret(String);
impl Secret { pub fn new(v: impl Into<String>) -> Self; pub fn expose(&self) -> &str; }
// Debug => "Secret(***)"; no Serialize.

// ports.rs
pub trait SecretStore: Send + Sync {
    fn get(&self, id: &str) -> Result<Option<Secret>, AppError>;
    fn set(&self, id: &str, secret: &Secret) -> Result<(), AppError>;
    fn delete(&self, id: &str) -> Result<(), AppError>;
}
// DataSourceDriver::connect gains `password: Option<&Secret>`.
```

Aturan perilaku:
- `validate`: Postgres/MySQL/MariaDB butuh `host` tidak kosong dan `user` tidak kosong; `port` bila ada harus 1–65535 (0 ditolak); SQLite tetap seperti sekarang. Engine Mssql/Redis/Kafka/Rabbitmq masih "not supported yet".
- Config lama (tanpa field baru) tetap bisa dibaca: field baru `#[serde(default)]`.
- `Secret` tidak punya `Serialize`; `Debug` mencetak `Secret(***)`.
- Pesan error dari adapter tidak boleh memuat password (lihat Task 3).

- [ ] **Step 1: Tulis tes yang gagal:** validasi tiap engine (host/user kosong, port 0, SQLite tidak berubah), `default_port`, JSON config lama masih terbaca dengan bawaan `sslMode = prefer` dan `savePassword = false`, round-trip camelCase (`sslMode`, `savePassword`), `Debug` Secret tidak berisi nilainya.
- [ ] **Step 2: Jalankan, pastikan gagal** — `cargo test --test data_source_domain`.
- [ ] **Step 3: Implementasikan.** Sesuaikan semua pemanggil `DataSourceDriver::connect` dan fake di `data_source_sessions.rs` (parameter `password`).
- [ ] **Step 4: Jalankan, pastikan lulus**, termasuk tes lama.
- [ ] **Step 5: Commit** — `feat: server connection settings and secret type`

---

### Task 2: Sesi memakai password dan SecretStore (Rust)

**Files:**
- Modify: `src-tauri/src/application/data_source.rs`
- Test: `src-tauri/tests/data_source_sessions.rs` (tambah)

**Interfaces:**

```rust
impl DataSourceSessions {
    pub async fn test(&self, driver, config, password: Option<Secret>) -> Result<(), AppError>;
    pub async fn connect(&self, driver, secrets: &dyn SecretStore, config, password: Option<Secret>) -> Result<(), AppError>;
}
pub fn save_secret(secrets: &dyn SecretStore, id: &str, secret: Secret) -> Result<(), AppError>;
pub fn forget_secret(secrets: &dyn SecretStore, id: &str) -> Result<(), AppError>;
```

Aturan perilaku:
- `connect`: pakai `password` bila diberikan; selain itu, bila `config.save_password`, baca dari `SecretStore`; bila tetap tidak ada → `ErrorKind::Auth` "A password is required." untuk engine server (SQLite tidak perlu).
- `connect` tidak pernah menulis ke `SecretStore`; hanya `save_secret` yang menulis.
- `ErrorKind` ditambah `Auth` (frontend `'auth'`).

- [ ] **Step 1: Tes gagal** dengan `FakeSecretStore` (HashMap): password eksplisit menang atas yang tersimpan; tersimpan dipakai bila `save_password`; tanpa keduanya → `Auth`; `connect` tidak menulis ke store; `save_secret`/`forget_secret` menulis/menghapus; SQLite tidak meminta password.
- [ ] **Step 2–4:** gagal → implementasi → lulus.
- [ ] **Step 5: Commit** — `feat: sessions resolve passwords from the secret store`

---

### Task 3: Adapter PostgreSQL, MySQL, MariaDB

**Files:**
- Modify: `src-tauri/Cargo.toml` (`sqlx` tambah `postgres`, `mysql`, `tls-rustls`), `src-tauri/src/infrastructure/sqlx_driver.rs` (dispatch), `src-tauri/src/infrastructure/mod.rs`
- Create: `src-tauri/src/infrastructure/server_source.rs`, `src-tauri/src/infrastructure/sql_values.rs`
- Test: `src-tauri/tests/sql_values.rs` (unit, tanpa server), `src-tauri/tests/server_sources.rs` (butuh Docker; dilewati tanpa env var)

Aturan perilaku:
- `sql_values.rs` (murni, bisa dites tanpa server): `fn cell_from_text(type_name: &str, text: Option<&[u8]>) -> CellValue` — `None` → `Null`; tipe integer (`int2/4/8`, `smallint/int/bigint`, `tinyint`, `serial*`) → `integer_cell`; float (`float4/8`, `real`, `double`, `float`) → `Number` (nilai `NaN`/`Infinity` → teks); `bool`/`boolean` → `Bool` (`t`/`true`/`1` benar); `bytea`/`blob*`/`binary`/`varbinary` → `<binary N bytes>`; selain itu `clip_text`. Teks bukan UTF-8 valid → `String::from_utf8_lossy`.
- Opsi koneksi dibangun dari config tanpa membentuk string URL (hindari karakter spesial di password): `PgConnectOptions::new().host().port().username().password().database().ssl_mode()`, `MySqlConnectOptions` serupa. `application_name`/`program_name` = `RustPilot`.
- `connect`: timeout 10 detik; simpan `tokio::runtime::Handle::current()`; ambil pid / `CONNECTION_ID()`; `read_only` → PostgreSQL `SET default_transaction_read_only = on`, MySQL `SET SESSION TRANSACTION READ ONLY`.
- Pesan error tidak memuat password: error koneksi dipetakan dari `sqlx::Error` ke pesan mesin (`password authentication failed for user "x"`), bukan `Display` penuh dari opsi koneksi. `Auth` untuk kegagalan autentikasi (SQLSTATE `28P01`/`28000`, MySQL 1045), `Connection` untuk host/port/timeout/TLS, `Query` untuk error SQL.
- `execute`: `raw_sql(sql).fetch_many`, berhenti di 501 baris (500 + `truncated`), `rows_affected` untuk statement tanpa kolom, kolom dari `column.type_info().name()`; query kosong → kolom dari `describe` tidak perlu (server mengirim header kolom bahkan tanpa baris).
- `interrupt`: spawn di `Handle` → buka koneksi kontrol sementara dan kirim `pg_cancel_backend(pid)` / `KILL QUERY id`; kegagalan diabaikan; koneksi kontrol ditutup.
- `close`: `interrupt()`, kunci, ambil koneksi, `close()`.
- `children`: pohon seperti di keputusan teknis, semua nilai lewat parameter terikat; nama schema/tabel apa pun (termasuk berisi `"` atau `` ` ``) tetap benar.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `sql_values.rs`: tiap kategori tipe di atas, `NULL`, `bigint` di luar ±2^53, `NaN`, teks > 10.000 karakter, byte tidak valid, `t`/`f`.
  - `server_sources.rs` (untuk tiap engine yang env var-nya ada; helper `fn server(env: &str) -> Option<(DataSourceConfig, Secret)>` dan tiap tes `return` bila `None`): terhubung dan `children([])` memuat schema bawaan; membuat tabel dengan beragam tipe lalu `SELECT` mengembalikan sel bertipe benar (`numeric`, `bigint`, `timestamptz`/`datetime`, `uuid`/`json`, `bytea`/`blob`, `NULL`); `select_stops_at_500_rows`; `insert_reports_rows_affected`; error sintaks → `Query`; password salah → `Auth` dan pesan tidak memuat password itu; host mati (port tertutup) → `Connection` dalam ≤ 10 detik; `interrupt` membatalkan `pg_sleep(60)`/`SLEEP(60)` dalam < 5 detik dan koneksi masih bisa `SELECT 1`; `close` mengakhiri sesi di server (cek `pg_stat_activity` / `PROCESSLIST` tidak lagi memuat `application_name`/koneksi itu); nama tabel berisi tanda kutip tampil benar di pohon.
- [ ] **Step 2: Jalankan, pastikan gagal** — `cargo test --test sql_values --test server_sources`.
- [ ] **Step 3: Implementasikan.** Jalankan container Docker dan set env var untuk Step 4.
- [ ] **Step 4: Jalankan, pastikan lulus** (unit murni selalu; `server_sources` dengan ketiga env var terisi). Catat bahwa tanpa env var tes server lulus dengan dilewati.
- [ ] **Step 5: Commit** — `feat: PostgreSQL, MySQL and MariaDB data source adapter`

---

### Task 4: Credential Manager dan perintah Tauri

**Files:**
- Modify: `src-tauri/Cargo.toml` (`keyring`), `src-tauri/src/infrastructure/mod.rs`, `src-tauri/src/presentation/commands.rs`, `src-tauri/src/lib.rs`
- Create: `src-tauri/src/infrastructure/keyring_secrets.rs`
- Test: `src-tauri/tests/keyring_secrets.rs`

**Interfaces:**

```rust
pub struct KeyringSecretStore;                       // implements SecretStore, service "RustPilot"
// DataSourceState gains: pub secrets: Box<dyn SecretStore>,

#[tauri::command] async fn ds_test(state, config: DataSourceConfig, password: Option<String>) -> Result<(), AppError>;
#[tauri::command] async fn ds_connect(state, config: DataSourceConfig, password: Option<String>) -> Result<(), AppError>;
#[tauri::command] fn ds_save_secret(state, id: String, password: String) -> Result<(), AppError>;
#[tauri::command] fn ds_forget_secret(state, id: String) -> Result<(), AppError>;
```

- Target entri: `rustpilot/dataSource/<id>`; `id` divalidasi `is_safe_id`.
- `ds_forget_secret` pada entri yang tidak ada berhasil tanpa error.
- Password dari frontend dibungkus `Secret` segera di perbatasan perintah.

- [ ] **Step 1: Tes gagal** `keyring_secrets.rs` terhadap Credential Manager nyata dengan id uji unik (`rp-test-<uuid>`) dan pembersihan di akhir: set → get mengembalikan nilai; get id tak dikenal → `None`; set dua kali menimpa; delete lalu get → `None`; delete id tak dikenal tidak error; id tidak aman ditolak. Tes dilewati (return) bila Credential Manager tidak tersedia (mis. CI tanpa sesi).
- [ ] **Step 2–4:** gagal → implementasi + wiring `lib.rs` + perintah → lulus; `cargo check`.
- [ ] **Step 5: Commit** — `feat: Credential Manager secret store and data source commands`

---

### Task 5: Domain frontend dan port

**Files:**
- Modify: `src/domain/dataSource.ts`, `src/domain/fs.ts` (`'auth'`), `src/application/ports.ts`, `src/infrastructure/tauri/dataSource.ts`, `tests/helpers/ports.ts`
- Test: `tests/domain/dataSource.test.ts`, `tests/infrastructure/tauri/dataSource.test.ts` (tambah)

**Interfaces:**

```ts
export type SslMode = 'disable' | 'prefer' | 'require';
// DataSourceConfig gains:
host: string | null; port: number | null; database: string | null; user: string | null;
sslMode: SslMode; savePassword: boolean;

export const SUPPORTED_ENGINES: readonly EngineKind[] = ['sqlite', 'postgres', 'mysql', 'mariadb'];
export const SERVER_ENGINES: readonly EngineKind[] = ['postgres', 'mysql', 'mariadb'];
export const isServerEngine = (e: EngineKind) => SERVER_ENGINES.includes(e);
export function defaultPort(engine: EngineKind): number | null;
export function newConfig(engine: EngineKind, id: string): DataSourceConfig; // field bawaan per engine
export function describeTarget(c: DataSourceConfig): string; // "user@host:port/db" atau path SQLite, tanpa password
export function sqlDialect(engine: EngineKind): 'sqlite' | 'postgres' | 'mysql' | 'mariadb';

// DataSourcePort
test(config, password?: string): Promise<void>;
connect(config, password?: string): Promise<void>;
saveSecret(id: string, password: string): Promise<void>;
forgetSecret(id: string): Promise<void>;
// BufferPort.setSqlSchema(path, schema, engine: EngineKind)
```

Aturan:
- `validateConfig`: server butuh host dan user; port 1–65535 bila diisi; pesan: `Enter a host.`, `Enter a user.`, `Enter a port between 1 and 65535.`; SQLite seperti sekarang.
- Config tersimpan lama (tanpa field baru) dimigrasi saat dibaca di `loadSources`: field baru diisi `null`/`prefer`/`false`.
- `describeTarget` tidak pernah memuat password.

- [ ] **Step 1: Tes gagal** untuk validasi, `defaultPort`, `newConfig` per engine, `describeTarget`, migrasi config lama (di `tests/application/dataSourceStore.test.ts`), dan adapter (`password` ikut sebagai argumen; `saveSecret`/`forgetSecret` memanggil `ds_save_secret`/`ds_forget_secret`).
- [ ] **Step 2–4:** gagal → implementasi → lulus; `tsc` (perbarui semua pemanggil `setSqlSchema` dan literal `DataSourceConfig` di tes).
- [ ] **Step 5: Commit** — `feat: server data source config and secret ports in the frontend`

---

### Task 6: Store: password saat connect

**Files:**
- Modify: `src/application/dataSourceStore.ts`
- Test: `tests/application/dataSourceStore.test.ts` (tambah)

**Interfaces:**

```ts
// state gains:
passwordRequest: { id: string; name: string } | null;

export function answerPassword(password: string | null): void;       // null = cancelled
export async function saveSource(config: DataSourceConfig, password?: string): Promise<void>;
export async function testSource(config, password?: string): Promise<{ ok: boolean; message: string }>;
```

Aturan perilaku:
- `connectSource`: untuk engine server dengan `savePassword === false`, buka `passwordRequest` dan tunggu `answerPassword`; `null` → batal tanpa error (status kembali `disconnected`); selain itu kirim `connect(config, password)`. Dengan `savePassword === true` kirim tanpa password (backend membaca dari Credential Manager).
- Kegagalan `auth` pada koneksi yang password-nya tersimpan: status `error` dengan pesan; di dialog Edit pengguna bisa memasukkan password baru.
- `saveSource` dengan `password` dan `savePassword` → `saveSecret(id, password)`; `savePassword` dimatikan pada koneksi yang tadinya menyimpan → `forgetSecret(id)`.
- `removeSource` memanggil `forgetSecret(id)` (kegagalan diabaikan).
- Password hanya ada sebagai argumen; tidak pernah masuk `state`, `localStorage`, atau pesan error.
- Hanya satu `passwordRequest` aktif per waktu; permintaan kedua untuk id yang sama menunggu yang pertama.

- [ ] **Step 1: Tes gagal:** alur tanya password (disimpan vs tidak), batal, `answerPassword` dengan teks → `connect` menerima password itu, `saveSource` menyimpan/melupakan secret, `removeSource` melupakan secret, password tidak muncul di `JSON.stringify(dataSources)` maupun isi storage fake.
- [ ] **Step 2–4:** gagal → implementasi → lulus.
- [ ] **Step 5: Commit** — `feat: data source store asks for passwords and manages saved secrets`

---

### Task 7: Dialog koneksi server dan prompt password

**Files:**
- Modify: `src/presentation/database/ConnectionDialog.tsx`, `src/presentation/database/DatabasePanel.tsx`, `src/presentation/database/ConsoleBar.tsx`, `src/infrastructure/codemirror/buffers.ts` (dialek), `src/presentation/styles/database.css`
- Create: `src/presentation/database/PasswordPrompt.tsx`

Isi:
- Tombol `+` jadi menu kecil: SQLite, PostgreSQL, MySQL, MariaDB (teks saja; ikon database Lucide yang sama).
- Dialog: pemilih engine saat baru (terkunci saat edit); field per engine — SQLite (file, read-only) seperti sekarang; server: Host, Port (placeholder port bawaan), User, Password (`type="password"`, `autocomplete="off"`, kosong saat edit; placeholder "••••••• (saved)" bila `savePassword`), Database (opsional), SSL mode (Disable / Prefer / Require), Read-only, centang **Save password**. Test Connection memakai password yang sedang diketik, atau yang tersimpan bila kolom kosong dan `savePassword`.
- `PasswordPrompt`: dialog kecil "Password for <name>" (input password, OK/Cancel, Enter/Esc), terikat ke `dataSources.passwordRequest`; dirender di `DatabasePanel` dan di komponen yang selalu terpasang (karena connect bisa dipicu dari console bar saat panel tertutup, render juga dari `App.tsx` lewat lazy yang sama).
- Tooltip baris sumber memakai `describeTarget`.
- Autocomplete: `setSqlSchema(path, schema, engine)` memakai dialek `PostgreSQL` / `MySQL` / `MariaSQL` / `SQLite`.
- `autofocus` ke field pertama; Esc menutup.

- [ ] **Step 1:** Implementasikan; `tsc`, `pnpm vitest run`.
- [ ] **Step 2:** Coba di `make dev` terhadap ketiga container: tambah koneksi, Test Connection (sukses, password salah, host mati), connect dengan dan tanpa Save password, buka console, jalankan query, Stop `pg_sleep(60)` / `SELECT SLEEP(60)`, edit koneksi, hapus koneksi, cek `localStorage` tanpa password dan Credential Manager (`cmdkey /list:RustPilot*` atau sejenisnya) menyimpan/menghapus entri.
- [ ] **Step 3: Commit** — `feat: server connection dialog and password prompt`

---

### Task 8: Verifikasi tahap

- [ ] `make test` dan `make check` hijau (tes server dengan env var terisi, dan sekali tanpa env var untuk memastikan dilewati, bukan gagal).
- [ ] `make build` (tutup `make dev` dulu agar pembersihan cache tidak terkunci): catat ukuran installer (target ≤ 2,81 MB + 4 MB) dan JS awal gzip (≤ 250 KB).
- [ ] Review Focus 1–7 dicek satu per satu; setelah menutup aplikasi, `pg_stat_activity` / `SHOW PROCESSLIST` tidak menyisakan sesi RustPilot.
- [ ] Centang 2A.2 di spec; tulis plan 2A.3 (SQL Server) sebelum memulainya.
