# RustPilot — Desain Fase 2 (Database & Data Sources)

Tanggal: 2026-11-20

## Maksud

Tool window Database sekarang hanya kerangka: ikon di stripe kanan dan teks "Coming in a later phase." Fase 2 mengisinya dengan klien data source sungguhan, supaya pemilik bisa memeriksa dan mengubah data proyek tanpa membuka DataGrip, RedisInsight, Kafka UI, atau RabbitMQ Management di jendela lain.

## Sumber data yang didukung (ditetapkan pemilik)

| Keluarga | Engine |
|---|---|
| RDBMS | MySQL, MariaDB, PostgreSQL, SQL Server, SQLite |
| Key-value | Redis |
| Stream | Kafka |
| Message broker | RabbitMQ |

## Acuan fitur: mirip Navicat, di atas UI RustPilot

Fitur mengikuti alur kerja Navicat, tetapi tampilannya memakai islands UI yang sudah ada — tidak meniru tampilan Navicat:

| Navicat | Di RustPilot |
|---|---|
| Connection navigator (kiri) | Tool window **Database** di stripe kanan (sisi diatur `TOOL_WINDOW_SIDE`, bisa dipindah nanti) |
| Tab "Objects" (daftar tabel + info) | Tab khusus di area editor, seperti diff viewer |
| Query editor + result | Tab editor `.sql` biasa + panel hasil di bawahnya |
| Table viewer (grid, filter, sort, edit) | Tab khusus "Table data" di area editor |
| Table designer | Tab khusus "Design table" di area editor |
| Dialog koneksi, konfirmasi | Dialog island yang sama dengan About/Recovery |
| Status koneksi, waktu query | Status bar yang sudah ada |

## Status

- [x] 2A.1 Navigator + SQLite (2026-11-20). Deviasi: SQLite memakai satu koneksi per sumber, bukan pool 2, supaya `sqlite3_interrupt` (tombol Stop) aman dipakai; query lain pada sumber yang sama menunggu sampai query yang berjalan selesai atau di-Stop. Pool kembali dipakai untuk engine server di 2A.2.
- [ ] 2A.2 PostgreSQL, MySQL, MariaDB
- [ ] 2A.3 SQL Server
- [ ] 2B sampai 2H

## Tahapan

Satu fase terlalu besar untuk satu kali jalan. Dikerjakan bertahap; tiap tahap bisa dipakai sendiri, punya plan sendiri, dan di-commit sendiri. Arsitektur juga tumbuh bertahap: tiap tahap hanya menambah port, use case, dan adapter yang dibutuhkannya, tidak menyiapkan lapisan untuk tahap berikutnya lebih awal.

| Tahap | Isi | Fondasi arsitektur yang ditambahkan |
|---|---|---|
| **2A.1 Navigator + SQLite** | Daftar koneksi, dialog koneksi, pohon lazy, query console, grid hasil read-only, Stop. Hanya SQLite. | `DataSourceDriver`, `SqlExecutor`, `DataSourceSessions`, `DataNode`, grid virtual |
| **2A.2 PostgreSQL, MySQL, MariaDB** | Engine server + Credential Manager + SSL. | `SecretStore`, `sqlx` untuk tiga engine |
| **2A.3 SQL Server** | Engine `tiberius`, batch `GO`, Windows auth. | `mssql_driver` |
| **2B Table viewer & editor** | Buka tabel di tab: paging, sort per kolom, filter builder (`WHERE`), edit sel, tambah/hapus/duplikat baris, "Apply" dengan pratinjau SQL dalam satu transaksi, Discard. Hanya untuk tabel dengan primary key. | `TableDataPort`, generator `UPDATE/INSERT/DELETE` di domain |
| **2C Object designer** | Table designer (kolom, index, foreign key) yang menghasilkan `CREATE`/`ALTER` dengan pratinjau DDL; lihat DDL view/tabel; rename, truncate, drop dengan konfirmasi; tab Objects. | Generator DDL per dialek di domain |
| **2D Redis** | Browser key (SCAN), viewer per tipe, edit/hapus key, TTL, console perintah. | `RedisCommands` |
| **2E Kafka** | Broker, topic, partisi; membaca pesan; mengirim pesan; buat/hapus topic. | `KafkaClient` |
| **2F RabbitMQ** | Vhost, exchange, queue, binding; peek; publish; purge. | `RabbitClient` |
| **2G Export, import, riwayat** | Export hasil/tabel ke CSV, JSON, SQL `INSERT`; import CSV ke tabel; dump struktur+data SQL; riwayat query dan query tersimpan per koneksi. | `ExportWriter` |
| **2H ER diagram & transfer** | ER diagram read-only dari foreign key; transfer data antar koneksi; bandingkan struktur dua schema. | — |

Urutan bisa ditukar pemilik (misalnya Redis sebelum table editor). Spec bagian "Tujuan" di bawah merinci 2A–2F; 2G dan 2H dirinci saat tiba gilirannya.

## Tujuan

**Bersama (2A)**

- Menyimpan daftar koneksi dari kedelapan engine; dialog koneksi dengan **Test Connection**; field form menyesuaikan engine.
- Pohon di panel kanan yang generik: koneksi → node anak yang ditentukan driver, dimuat lazy per node.
- Connect / disconnect / refresh per koneksi; status (terhubung, sedang menghubungkan, error) terlihat di pohon.
- Password dan secret lain tidak pernah tersimpan teks polos.

**RDBMS (2A)**

- Pohon: koneksi → database/schema → Tables / Views → tabel → kolom (tipe, nullable, primary key).
- Query console per koneksi: file `.sql` yang dibuka sebagai tab editor; `Ctrl+Enter` menjalankan statement di kursor atau teks terpilih; `Ctrl+Shift+Enter` seluruh file.
- Grid hasil di bawah editor: kolom, baris, jumlah baris, waktu eksekusi, "N rows affected".
- Stop query yang sedang berjalan.
- Klik ganda tabel → console dengan `SELECT` 500 baris pertama (sintaks sesuai engine: `LIMIT 500` atau `SELECT TOP 500`) dan langsung dijalankan.
- Autocomplete tabel dan kolom dari schema yang sudah dimuat, dialek sesuai engine (`@codemirror/lang-sql` sudah ada: `PostgreSQL`, `MySQL`, `MariaSQL`, `MSSQL`, `SQLite`).

**Table viewer & editor (2B)**

- Klik ganda tabel → tab "Table data": 200 baris per halaman, navigasi halaman, jumlah total baris (bila murah: `COUNT(*)` dengan timeout 2 detik, selain itu "?").
- Sort dengan klik header; filter builder (kolom, operator, nilai) yang menjadi `WHERE` terparametrisasi, plus mode teks `WHERE` bebas.
- Edit sel inline (teks, angka, boolean, `NULL`), tambah baris, duplikat baris, hapus baris. Perubahan ditandai warna sampai di-Apply.
- Apply: tampilkan SQL yang akan dijalankan, jalankan dalam satu transaksi, rollback semua bila satu gagal. Discard membuang perubahan.
- Tabel tanpa primary key dibuka read-only dengan penjelasan.

**Object designer (2C)**

- Tab "Design table": daftar kolom (nama, tipe sesuai dialek, panjang, nullable, default, primary key, komentar), index, foreign key.
- Simpan → pratinjau `CREATE TABLE` atau `ALTER TABLE` yang dihasilkan → jalankan.
- Tab "Objects" per schema: daftar tabel dengan jumlah baris perkiraan, ukuran, komentar.
- Lihat DDL tabel/view (read-only, bisa disalin ke console).
- Aksi di pohon: New table, Rename, Truncate, Drop (konfirmasi dengan nama objek).

**Redis (2D)**

- Pohon: koneksi → DB 0–15 (hanya yang berisi key, plus DB 0) → key, dikelompokkan per prefix `:`.
- Daftar key memakai `SCAN` dengan pola dan batch 500; tombol "Load more". `KEYS` tidak pernah dipakai.
- Viewer per tipe: string (teks/JSON terformat), hash, list, set, sorted set, stream; menampilkan TTL dan ukuran.
- Edit nilai string, tambah/hapus field hash dan anggota set, ubah TTL, hapus key (dengan konfirmasi).
- Console Redis: satu perintah per baris, argumen dengan kutip, hasil ditampilkan seperti `redis-cli`.

**Kafka (2E)**

- Pohon: koneksi → Brokers, Topics → topic → partisi (leader, offset awal/akhir).
- Membaca pesan dari satu topic: N pesan terakhir per partisi, atau mulai dari offset tertentu; tampil di grid (partisi, offset, timestamp, key, value, headers), value JSON terformat.
- Mengirim pesan: topic, partisi (opsional), key, value, headers.
- Membuat dan menghapus topic (hapus dengan konfirmasi).

**RabbitMQ (2F)**

- Pohon: koneksi → vhost → Exchanges / Queues → binding.
- Detail queue: jumlah pesan ready/unacked, consumer.
- Mengintip pesan dari queue tanpa menghilangkannya (`ackmode=reject_requeue_true`).
- Publish pesan ke exchange dengan routing key, properties, dan headers.
- Purge queue (dengan konfirmasi).

## Bukan tujuan

Untuk seluruh Fase 2: SSH/HTTP tunnel, Oracle/MongoDB/Cassandra/Elasticsearch, explain plan visual, transaksi manual di console (auto-commit saja; transaksi hanya dipakai Apply di 2B), format SQL, backup terjadwal, model/diagram yang bisa diedit, manajemen user/role database, Redis Cluster/Sentinel, Redis Pub/Sub live, consumer group Kafka (lihat maupun commit offset), Schema Registry/Avro/Protobuf, Kafka Connect, konfigurasi topic, mengelola user/permission RabbitMQ, consume RabbitMQ terus-menerus, macOS/Linux.

## Anti-tujuan

- **Secret bocor:** password tersimpan teks polos di `localStorage`, tercetak di log, ikut pesan error, atau dikirim balik ke frontend.
- **Jendela membeku:** query lambat, tabel jutaan baris, Redis dengan jutaan key, atau topic Kafka besar membuat UI tidak responsif atau memori melonjak.
- **Statement salah dijalankan:** `Ctrl+Enter` menjalankan statement di sebelahnya, atau memecah statement di titik koma dalam string/komentar/dollar-quote, atau memecah batch SQL Server di tengah.
- **Aksi merusak tanpa sengaja:** hapus key, hapus topic, purge queue, atau mengintip pesan RabbitMQ yang ternyata mengonsumsinya.
- **Server produksi terbebani:** `KEYS *`, `FLUSHDB`, atau membaca seluruh topic dari awal secara default.
- **Koneksi yatim:** pool/klien tetap terbuka setelah disconnect atau aplikasi keluar.
- **Start jadi berat:** kode database ikut bundle awal padahal panel belum dibuka.

## Pendekatan

| Keluarga | Pilihan | Alasan |
|---|---|---|
| MySQL, MariaDB, PostgreSQL, SQLite | `sqlx` (`mysql`, `postgres`, `sqlite`, `runtime-tokio`, `tls-rustls`), SQLite dibundel | Satu API, async, cancel = drop future. MariaDB memakai protokol MySQL. |
| SQL Server | `tiberius` (`rustls`, `tds73`) + `tokio-util` compat | `sqlx` sudah membuang dukungan MSSQL; `tiberius` murni Rust. |
| Redis | `redis` (`tokio-comp`, `tokio-rustls-comp`) | Klien standar, mendukung TLS dan perintah mentah. |
| Kafka | `rskafka` (`transport-tls`) | Murni Rust. `rdkafka` butuh librdkafka + CMake untuk build di Windows dan menambah ukuran besar. Konsekuensi: tidak ada consumer group, yang memang bukan tujuan. |
| RabbitMQ | HTTP Management API lewat `reqwest` (`rustls-tls`, `json`) | AMQP tidak bisa mendaftar queue/exchange; Management API bisa daftar, peek, dan publish sekaligus. Syarat: plugin `rabbitmq_management` aktif (default di image `rabbitmq:management`). |

Alternatif yang ditolak: memanggil CLI (`psql`, `redis-cli`, `kafka-console-consumer`) — bergantung program yang belum tentu terpasang dan parsing teks rapuh; satu crate berat per engine (`rdkafka`, `lapin`) — ukuran dan build Windows.

## Keputusan

Ditetapkan pemilik:

- Database dikerjakan sebagai fitur berikutnya.
- Engine: MySQL, PostgreSQL, MariaDB, SQL Server, SQLite, Redis, Kafka, RabbitMQ.

Keputusan penyusun (boleh dikoreksi):

- **Urutan tahap:** 2A.1 → 2A.2 → 2A.3 → 2B → 2C → 2D → 2E → 2F → 2G → 2H. RDBMS didalami dulu (seperti Navicat) sebelum Redis/Kafka/RabbitMQ. Plan implementasi ditulis per tahap, tepat sebelum tahap itu dikerjakan; plan 2A.1 ditulis sekarang.
- **Batas tahap:** tiap tahap selesai dengan `make test` dan `make check` hijau, dicoba di aplikasi, dan di-commit sebelum tahap berikut dimulai.
- **Driver generik:** backend punya satu port `DataSourceDriver` per keluarga engine (`connect`, `test`, `children(nodePath)`), plus port khusus per keluarga untuk aksinya (`SqlExecutor`, `RedisCommands`, `KafkaClient`, `RabbitClient`). Pohon di frontend tidak tahu engine; ia hanya menampilkan `DataNode` dari backend.
- **Penyimpanan koneksi:** konfigurasi tanpa secret disimpan global lewat `StoragePort` (key `rustpilot.dataSources`). Secret (password, SASL password, token) di Windows Credential Manager lewat crate `keyring`, target `rustpilot/dataSource/<id>`. Opsi "Save password"; bila tidak dicentang, password ditanya saat connect dan hanya hidup di memori backend selama terhubung.
- **Frontend hanya tahu `hasSavedSecret: boolean`.**
- **Field per engine:**
  - SQLite: path file (tombol Browse), opsi read-only.
  - PostgreSQL/MySQL/MariaDB: host, port (default 5432/3306/3306), database (opsional), user, password, SSL mode (`disable`/`prefer`/`require`).
  - SQL Server: host, port 1433, database, autentikasi SQL Server (user/password) atau Windows Integrated, opsi `trustServerCertificate`.
  - Redis: host, port 6379, username (ACL, opsional), password, DB awal, TLS.
  - Kafka: bootstrap servers (dipisah koma), TLS, SASL PLAIN (user/password) opsional.
  - RabbitMQ: URL Management (`http://localhost:15672`), user, password.
- **Pool/klien:** satu pool per koneksi aktif (SQL maks 2 koneksi, idle timeout 5 menit); Redis satu `ConnectionManager`; Kafka satu `Client`; RabbitMQ satu `reqwest::Client`. Disconnect dan keluar aplikasi menutup semuanya.
- **Connect timeout** 10 detik untuk semua engine.
- **Batas hasil SQL:** 500 baris per eksekusi; lebih dari itu ditandai `truncated`, grid menulis "Showing first 500 rows". Sel teks dipotong di 10.000 karakter; biner tampil `<binary N bytes>`.
- **Nilai sel** lintas IPC: `null`, `boolean`, `number`, atau `string`. `i64` di luar rentang aman JS, `numeric`/`decimal`/`money` dikirim string. Tanggal/waktu string ISO 8601. UUID string. JSON/JSONB string.
- **Pemecahan statement** dilakukan di frontend (`domain/sql.ts`) karena posisi kursor ada di editor. Titik koma di luar string `'…'`, identifier `"…"`/`` `…` ``/`[…]`, komentar `--`/`#` (MySQL)/`/* */`, dan dollar-quote PostgreSQL `$tag$…$tag$`. Untuk SQL Server, baris berisi `GO` saja juga memisah batch.
- **Satu statement per eksekusi.** Teks terpilih berisi banyak statement dijalankan berurutan; hasil yang ditampilkan milik statement terakhir yang mengembalikan baris, error menghentikan sisanya.
- **Console SQL** adalah file `%AppData%\rustpilot\consoles\<dataSourceId>.sql`, dibuka sebagai tab editor biasa (autosave, recovery, tab ikut berfungsi). File `.sql` lain di proyek bisa ditempeli koneksi lewat pemilih koneksi di atas editor.
- **Redis:** `SCAN` batch 500 dengan `COUNT 500`; perintah berbahaya di console (`FLUSHALL`, `FLUSHDB`, `KEYS`, `SHUTDOWN`, `DEBUG`, `CONFIG SET`) minta konfirmasi dulu. Nilai > 1 MB tidak dimuat penuh; viewer menampilkan 1 MB pertama.
- **Kafka:** bawaan membaca 50 pesan terakhir per partisi, maksimal 500 pesan total; tidak pernah membaca dari offset paling awal tanpa diminta.
- **RabbitMQ:** peek selalu `ackmode=reject_requeue_true`, maksimal 50 pesan; tidak ada mode yang mengonsumsi pesan.
- **Aksi merusak** (hapus key/topic, purge, DROP/DELETE/TRUNCATE tidak diperiksa — SQL dijalankan apa adanya) memakai `DialogPort` dengan nama objek di pesannya.
- **Grid** buatan sendiri dengan virtual scrolling (tanpa library), kolom bisa diubah lebarnya, `Ctrl+C` menyalin sel terpilih sebagai TSV. Dipakai ulang oleh SQL, Kafka, dan Redis (hash/zset).
- **Panel hasil** muncul di bawah editor hanya bila tab aktif adalah console/`.sql` yang punya koneksi; tingginya bisa diubah dan diingat.
- **Ikon (ditetapkan pemilik: open source dan kecil):**
  - Glyph UI pohon dan toolbar (schema, folder, tabel, view, kolom, primary key, index, foreign key, refresh, run, stop, connect, disconnect, filter): **Lucide** (lisensi ISC). Hanya `path` SVG ikon yang dipakai yang disalin ke `presentation/layout/icons.tsx` sebagai komponen Solid inline, stroke `currentColor` agar ikut tema. Tidak menambah dependensi `lucide`.
  - Logo merek (MySQL, PostgreSQL, Redis, dll.) **tidak dipakai**: itu merek dagang, bukan open source. Semua engine memakai glyph database Lucide; nama engine di sampingnya yang membedakan.
  - Ikon file `.sql` dan `.db` tetap dari `material-icon-theme` yang sudah ada.
  - Anggaran: tiap ikon ≤ 1 KB SVG, seluruh ikon database ≤ 12 KB sebelum gzip, ikut chunk lazy panel database (bukan bundle awal).
  - Lisensi dicatat: komentar sumber + lisensi di atas blok ikon, dan entri di `THIRD_PARTY_NOTICES.md` (dibuat bila belum ada).
- **Viewer Redis/Kafka/RabbitMQ** dibuka di area editor sebagai tab khusus (seperti diff viewer sekarang), bukan file.

## Arsitektur

**Rust (`src-tauri/src`)**

- `domain/data_source.rs` — `EngineKind`, `DataSourceConfig` (tanpa secret, `Serialize`), `Secret` (tidak `Serialize`, `Debug` disamarkan), `DataNode`, `NodePath`, validasi config.
- `domain/sql.rs` — `ColumnInfo`, `CellValue`, `SqlResult`, batas hasil.
- `domain/redis.rs`, `domain/kafka.rs`, `domain/rabbit.rs` — tipe per keluarga (sub-fase masing-masing).
- `domain/error.rs` — `ErrorKind` ditambah `Connection`, `Auth`, `Query`, `Cancelled`, `Timeout`, `InvalidConfig`.
- `domain/ports.rs` — `SecretStore`, `DataSourceDriver`, `SqlExecutor`, nanti `RedisCommands`, `KafkaClient`, `RabbitClient`.
- `application/data_source.rs` — `DataSourceSessions` (sesi hidup per id, eksekusi yang bisa dibatalkan per `executionId`), `test_connection`, `connect` (ambil secret dari store bila tidak diberi), `children`, `close_all`.
- `application/sql.rs` — `execute` dengan batas baris; `preview_query(engine, table)`.
- `infrastructure/sqlx_driver.rs` (SQLite, PostgreSQL, MySQL, MariaDB), `infrastructure/mssql_driver.rs` (tiberius), `infrastructure/keyring_secrets.rs`; nanti `redis_driver.rs`, `kafka_driver.rs`, `rabbit_http.rs`.
- `presentation/commands.rs` — `ds_test`, `ds_connect`, `ds_disconnect`, `ds_children`, `ds_save_secret`, `ds_forget_secret`, `ds_console_path`, `sql_execute`, `sql_cancel`; nanti `redis_*`, `kafka_*`, `rabbit_*`.

**Frontend (`src`)**

- `domain/dataSource.ts` — `EngineKind`, `DataSourceConfig`, field form per engine, default port, validasi.
- `domain/sql.ts` — `splitStatements(text, engine)`, `statementAt(text, offset, engine)`, `previewQuery(engine, table)`.
- `application/ports.ts` — tambah `DataSourcePort`, `SqlPort`; nanti `RedisPort`, `KafkaPort`, `RabbitPort`.
- `application/dataSourceStore.ts` — daftar koneksi, status, pohon lazy.
- `application/sqlConsoleStore.ts` — koneksi per file console, eksekusi berjalan, hasil terakhir.
- `infrastructure/tauri/dataSource.ts`, `infrastructure/tauri/sql.ts`.
- `infrastructure/codemirror/sqlSchema.ts` — dialek dan schema untuk autocomplete.
- `presentation/database/` — `DatabasePanel.tsx`, `ConnectionDialog.tsx`, `ConsoleBar.tsx`, `ResultGrid.tsx`, `ResultPanel.tsx`; dimuat lazy. Nanti `redis/`, `kafka/`, `rabbit/`.
- `presentation/styles/database.css`.

## Target

| Ukuran | Target |
|---|---|
| JS awal (gzip), tanpa membuka panel Database | tetap ≤ 250 KB |
| Installer | 2A naik ≤ 4 MB; seluruh Fase 2 naik ≤ 8 MB dari ukuran Fase 1 |
| `SELECT` 500 baris × 20 kolom sampai grid tergambar | ≤ 300 ms (SQLite lokal) |
| Scroll grid 500 baris | hanya baris terlihat yang dirender |
| Redis 1 juta key | batch pertama tampil ≤ 1 detik, UI tetap responsif |

## Diserahkan ke pembangun

Nama kelas CSS, pilihan ikon Lucide persisnya per node, tata letak dialog, teks empty state, warna nilai `NULL`.
