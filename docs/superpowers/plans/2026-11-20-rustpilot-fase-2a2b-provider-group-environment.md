# RustPilot Fase 2A.2b (Pembeda Provider, Grup, Environment, Warna) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daftar koneksi di tool window Database mudah dibaca dan aman dipakai: tiap koneksi punya penanda provider (PostgreSQL, MySQL, MariaDB, SQLite), bisa dikelompokkan ke grup, punya environment (Local / Sandbox / Dev), dan punya warna yang terlihat di pohon, di atas editor console, dan di panel hasil, supaya jelas query sedang dijalankan ke mana.

**Architecture:** Murni frontend dan tanpa perubahan backend. Metadata organisasi (`groupId`, `environment`, `color`) ikut di `DataSourceConfig` dan disimpan lewat `StoragePort` seperti sekarang; backend mengabaikan field yang tidak dikenalnya (serde tanpa `deny_unknown_fields`). Grup disimpan terpisah (`rustpilot.dataGroups`). Aturan warna dan pengurutan adalah fungsi murni di `domain/`.

**Tech Stack:** SolidJS, `solid-js/store`, CSS variables. Tidak ada dependensi baru.

**Spec:** `docs/superpowers/specs/2026-11-20-rustpilot-fase-2-database-design.md` (tambahan pada tahap 2A)

## Global Constraints

- Aturan `CLAUDE.md` berlaku: clean architecture, tes di `tests/`, tes gagal ditulis dulu, semua kode dan teks UI bahasa Inggris, commit satu baris bahasa Inggris tanpa atribusi, `docs/` tidak di-commit.
- **Tanpa logo merek** (memori `icons-fully-open-source`): provider dibedakan dengan lencana buatan sendiri (kotak bulat berwarna + dua huruf), bukan logo PostgreSQL/MySQL/MariaDB/SQLite. Ikon glyph tetap dari Lucide.
- Warna memakai CSS variable dan harus terbaca di tema gelap (kontras teks pada lencana ≥ 4,5:1).
- Config lama (tanpa field baru) tetap terbaca; backend tidak berubah.
- Tidak ada rahasia di metadata; password tetap hanya di Credential Manager.

## Keputusan

Ditetapkan pemilik: lencana provider; grup koneksi; environment local, sandbox, dev; dukungan warna.

Keputusan penyusun (boleh dikoreksi):

- **Lencana provider:** kotak bulat 16 px, dua huruf, warna per provider (ada di `ENGINE_BADGES`). PostgreSQL `Pg` biru-indigo, MySQL `My` oranye, MariaDB `Ma` cokelat, SQLite `Sq` biru-muda; engine yang belum dibangun sudah punya entri (SQL Server `Ms`, Redis `Re`, Kafka `Kf`, RabbitMQ `Rb`). Muncul di pohon, menu Add, judul dialog, dan console bar. Nama engine selalu ada di `title`/teks di dekatnya.
- **Environment:** `local` (hijau), `sandbox` (kuning), `dev` (biru), atau tanpa environment. Daftar ini tetap (belum bisa ditambah pengguna). Tampil sebagai label kecil `LOCAL` / `SANDBOX` / `DEV` di baris pohon dan di console bar.
- **Warna koneksi:** urutan prioritas: warna pilihan koneksi → warna bawaan environment → tanpa warna. Palet 8 warna tetap (`COLOR_PALETTE`) plus pilihan "Default" dan "None". Warna tampil sebagai garis aksen 3 px di kiri baris pohon, garis atas console bar, dan penanda di header panel hasil.
- **Grup:** satu tingkat (tanpa grup di dalam grup). Grup bernama, bisa dilipat (status lipat diingat), punya ikon folder dengan warna opsional dari palet yang sama. Koneksi tanpa grup tampil setelah semua grup. Urutan grup dan koneksi: sesuai urutan dibuat; mengubah urutan lewat seret-lepas ditunda.
- **Memindah koneksi:** lewat pilihan "Group" di dialog koneksi dan menu klik-kanan "Move to group". Menghapus grup tidak menghapus koneksinya: koneksi pindah ke "tanpa grup" setelah konfirmasi.
- **Nama grup:** tidak boleh kosong; unik tanpa membedakan huruf besar-kecil; maksimal 60 karakter.

## Review Focus

1. **Tidak salah sasaran:** di console bar dan panel hasil, nama koneksi + environment + warna selalu terlihat, jadi tidak ada keraguan query dijalankan ke Local atau Dev. (Task 5)
2. **Config lama** tetap terbuka: koneksi tersimpan sebelum fitur ini muncul tanpa grup/environment/warna, tidak ada yang hilang. (Task 1, 2)
3. **Menghapus grup** tidak pernah menghapus koneksi. (Task 2, 4)
4. **Kontras:** lencana, label environment, dan garis warna terbaca di tema gelap untuk semua warna palet. (Task 3)
5. **Bundle awal** tetap ≤ 250 KB gzip (komponen baru ikut chunk lazy database). (Task 6)

---

### Task 1: Domain: environment, warna, lencana, grup

**Files:**
- Modify: `src/domain/dataSource.ts`
- Create: `src/domain/dataGroup.ts`
- Test: `tests/domain/dataSource.test.ts` (tambah), `tests/domain/dataGroup.test.ts`

**Interfaces:**

```ts
// dataSource.ts
export type Environment = 'local' | 'sandbox' | 'dev';
export const ENVIRONMENTS: readonly { id: Environment; label: string; color: string }[];
// DataSourceConfig gains:
groupId: string | null; environment: Environment | null; color: string | null; // color = a COLOR_PALETTE id
export const COLOR_PALETTE: readonly { id: string; label: string; value: string }[]; // 8 warna
export function effectiveColor(c: Pick<DataSourceConfig, 'color' | 'environment'>): string | null; // CSS color
export const ENGINE_BADGES: Record<EngineKind, { text: string; color: string }>;
// newConfig/normalizeConfig: field baru null; id warna/environment tidak dikenal -> null

// dataGroup.ts
export interface DataGroup { id: string; name: string; collapsed: boolean; color: string | null }
export function normalizeGroup(value: unknown): DataGroup | null;
export function validateGroupName(name: string, others: readonly DataGroup[], selfId?: string): string | null;
export interface SourceSection { group: DataGroup | null; sources: DataSourceConfig[] }
/** Grup berurutan, lalu bagian "tanpa grup"; koneksi dengan groupId yang tidak ada dianggap tanpa grup. */
export function arrangeSources(groups: readonly DataGroup[], sources: readonly DataSourceConfig[]): SourceSection[];
```

Aturan:
- `effectiveColor`: `color` (id palet) → nilai CSS-nya; selain itu bila `environment` ada → warna environment; selain itu `null`. Id palet yang tidak dikenal diperlakukan sebagai `null` lalu jatuh ke environment.
- `validateGroupName`: `'Enter a group name.'` bila kosong; `'A group with this name already exists.'` bila sama (tanpa membedakan huruf besar-kecil, mengabaikan `selfId`); `'Use at most 60 characters.'`.
- `arrangeSources`: bagian "tanpa grup" (`group: null`) hanya ada bila punya koneksi; grup kosong tetap ditampilkan.
- `normalizeConfig` memberi `groupId/environment/color = null` untuk config lama.

- [ ] **Step 1: Tulis tes yang gagal:** `effectiveColor` (prioritas, id tak dikenal, tanpa keduanya), `ENVIRONMENTS` berisi tepat local/sandbox/dev, `ENGINE_BADGES` punya entri untuk setiap `EngineKind` dengan teks 2 huruf, `normalizeConfig` mengisi field baru dan membuang nilai tak dikenal, `validateGroupName` (kosong, duplikat tanpa beda huruf, duplikat dirinya sendiri boleh, 61 karakter), `normalizeGroup`, `arrangeSources` (urutan grup, koneksi tanpa grup, groupId yatim, grup kosong, bagian null hanya bila ada isinya).
- [ ] **Step 2: Jalankan, pastikan gagal** — `pnpm vitest run tests/domain`.
- [ ] **Step 3: Implementasikan.** Perbarui semua literal `DataSourceConfig` di tes lama lewat `newConfig`.
- [ ] **Step 4: Jalankan, pastikan lulus**, dan `tsc`.
- [ ] **Step 5: Commit** — `feat: environments, colors and groups in the data source domain`

---

### Task 2: Store: grup dan metadata

**Files:**
- Modify: `src/application/dataSourceStore.ts`
- Test: `tests/application/dataGroups.test.ts`

**Interfaces:**

```ts
// state gains: groups: DataGroup[]
export function loadSources(): void;                       // juga memuat 'rustpilot.dataGroups'
export function createGroup(name: string): DataGroup | string; // grup baru, atau pesan error validasi
export function renameGroup(id: string, name: string): string | null;
export function setGroupColor(id: string, color: string | null): void;
export function toggleGroup(id: string): void;             // lipat/buka, diingat
export async function removeGroupConfirmed(id: string): Promise<void>; // konfirmasi; koneksi menjadi tanpa grup
export function moveSource(id: string, groupId: string | null): void;
export function sections(): SourceSection[];               // arrangeSources(groups, sources)
```

Aturan:
- Semua perubahan grup disimpan ke `rustpilot.dataGroups` dan perubahan koneksi ke `rustpilot.dataSources`.
- `saveSource` mempertahankan `groupId` bila form tidak mengubahnya; `groupId` yang menunjuk grup yang sudah tidak ada disimpan sebagai `null`.
- Data grup rusak di storage → daftar kosong; koneksi dengan `groupId` yatim tampil tanpa grup.
- `removeGroupConfirmed` memakai `DialogPort.confirm` dengan nama grup dan jumlah koneksi di pesannya; menolak = tidak ada perubahan.

- [ ] **Step 1: Tulis tes yang gagal:** buat/rename/hapus grup, validasi nama, lipat dan ingat setelah `loadSources`, pindah koneksi ke dan dari grup, hapus grup memindahkan koneksinya ke tanpa grup dan tidak menghapusnya, hapus ditolak = tidak berubah, storage rusak, config lama dimuat tanpa grup, `sections()` mengikuti urutan.
- [ ] **Step 2–4:** gagal → implementasi → lulus.
- [ ] **Step 5: Commit** — `feat: connection groups in the data source store`

---

### Task 3: Komponen visual: lencana, label environment, warna

**Files:**
- Create: `src/presentation/database/badges.tsx`
- Modify: `src/presentation/styles/database.css`

Isi:
- `ProviderBadge({ engine, size })`: kotak bulat dengan teks 2 huruf dari `ENGINE_BADGES`; warna latar dari data, teks putih atau gelap otomatis sesuai kontras; `aria-label` = nama engine.
- `EnvironmentTag({ environment })`: label kecil kapital dengan warna environment (latar transparan 18 %, teks warna penuh, border tipis).
- `ColorSwatch`/variabel CSS `--source-color` yang dipasang di elemen untuk garis aksen.
- Kelas: `.db-accent` (garis kiri 3 px memakai `--source-color`), `.db-env`, `.provider-badge`.

- [ ] **Step 1:** Implementasikan; cek kontras setiap pasangan warna ≥ 4,5:1 dengan skrip kecil sekali jalan (hasil dicatat di komentar, skrip tidak di-commit).
- [ ] **Step 2: Commit** — `feat: provider badge and environment tag components`

---

### Task 4: Pohon: grup, lencana, aksen warna

**Files:**
- Modify: `src/presentation/database/DataTree.tsx`, `src/presentation/database/DatabasePanel.tsx`

Isi:
- Pohon dirender dari `sections()`: baris grup (chevron, ikon folder berwarna, nama, jumlah koneksi) lalu koneksinya satu tingkat menjorok; bagian tanpa grup tanpa header bila tidak ada grup sama sekali, dengan header "Ungrouped" bila ada grup.
- Baris koneksi: `ProviderBadge`, nama, `EnvironmentTag`, titik status; garis aksen warna di kiri bila `effectiveColor` ada.
- Toolbar: tombol baru "New Group" (input nama inline di panel, Enter menyimpan, Esc membatalkan, pesan validasi di bawahnya).
- Menu klik-kanan koneksi: tambah "Move to group" (daftar grup + "No group"); menu klik-kanan grup: Rename (inline), Color (palet), Delete group….
- Keyboard: panah dan Enter bekerja di baris grup (buka/tutup).
- Menu Add: tiap engine diawali `ProviderBadge`.

- [ ] **Step 1:** Implementasikan; `tsc`, `pnpm vitest run`.
- [ ] **Step 2:** Coba di `make dev`: buat grup, pindah koneksi, lipat, restart aplikasi (lipatan dan grup bertahan), hapus grup berisi koneksi.
- [ ] **Step 3: Commit** — `feat: grouped connection tree with provider badges`

---

### Task 5: Dialog koneksi dan console: environment dan warna

**Files:**
- Modify: `src/presentation/database/ConnectionDialog.tsx`, `src/presentation/database/ConsoleBar.tsx`, `src/presentation/database/ResultPanel.tsx`, `src/presentation/styles/database.css`

Isi:
- Dialog: judul memakai `ProviderBadge`; field baru **Group** (pilihan grup + "No group"), **Environment** (None / Local / Sandbox / Dev), **Color** (baris 8 kotak palet + "Default" yang mengikuti environment + "None"); pratinjau kecil warna efektif. Nilai disimpan di config.
- `ConsoleBar`: garis atas 3 px berwarna `effectiveColor`, di kiri `ProviderBadge` + `EnvironmentTag` + nama koneksi yang sedang dipakai (dipertahankan sebagai pemilih koneksi; pilihan di dalamnya diawali lencana singkat lewat teks "Pg ·" bila `<option>` tidak bisa memuat elemen).
- `ResultPanel`: header memuat nama koneksi dan `EnvironmentTag`; garis atas berwarna.
- Tanpa environment dan tanpa warna, tampilan sama seperti sekarang.

- [ ] **Step 1:** Implementasikan; `tsc`, `pnpm vitest run`.
- [ ] **Step 2:** Coba di `make dev`: set environment Dev + warna ungu pada koneksi, buka console, jalankan query; garis warna, label DEV, dan nama koneksi terlihat di console bar dan panel hasil; ganti koneksi di pemilih dan tampilan ikut berubah.
- [ ] **Step 3: Commit** — `feat: environment and color on connections, console bar and results`

---

### Task 6: Verifikasi tahap

- [ ] `pnpm vitest run` dan `tsc` hijau (kecuali error di file milik sesi lain, bila masih ada).
- [ ] `pnpm exec vite build` (atau `make build`): JS awal gzip tetap ≤ 250 KB; komponen baru ada di chunk lazy.
- [ ] Review Focus 1–5 dicek satu per satu.
- [ ] Catat di spec: 2A.2b selesai; ide lanjutan: environment buatan pengguna, seret-lepas untuk urutan, konfirmasi tambahan sebelum menulis ke environment tertentu.
