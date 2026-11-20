# Editor: Bahasa dan Ikon — Catatan Plan (sudah dieksekusi)

> Plan ini ditulis **setelah** pekerjaannya dikerjakan, karena saya langsung mengeksekusi tanpa menulis plan dulu. Isinya mencatat apa yang dibangun dan bagaimana diverifikasi, supaya riwayatnya lengkap. Commit: `d1678e7`.

**Goal:** Editor menyorot sintaks untuk bahasa-bahasa umum, dan file tree serta tab menampilkan ikon per jenis file dan per jenis folder.

**Architecture:** Aturan "nama file → bahasa" dan "nama file/folder → ikon" adalah fungsi murni di `src/domain/`. Pemuat paket bahasa CodeMirror ada di `src/infrastructure/codemirror/languages.ts`, satu chunk lazy per paket. Ikon digambar sebagai SVG inline di `src/presentation/icons/FileTypeIcon.tsx`.

**Tech Stack:** `@codemirror/lang-*` (cpp, java, php, sql, xml, yaml, go, sass, less, vue) dan `@codemirror/legacy-modes` untuk bahasa tanpa paket resmi.

## Yang dibangun

- [x] **Bahasa (40):** JS, JSX, TS, TSX, HTML, CSS, SCSS, Sass, Less, Vue, JSON, Markdown, Rust, Go, C/C++, Java, Kotlin, C#, PHP, Ruby, Python, Swift, Dart, Scala, Lua, Perl, R, Groovy, Protobuf, SQL, XML, YAML, TOML, properties/ini, diff, shell, PowerShell, Dockerfile, CMake, nginx.
- [x] **Pencocokan nama utuh** selain ekstensi: `Dockerfile`, `Cargo.lock`, `Gemfile`, `CMakeLists.txt`, `nginx.conf`, `.env*`, `.editorconfig`, `.bashrc`, dan sejenisnya.
- [x] **Ikon file:** lencana berhuruf (`TS`, `JS`, `RS`, `{}`, `<>`, `#`, `M`, …) dan piktogram (gambar, gembok untuk lock file, gir untuk konfigurasi, git, terminal, database, arsip, teks).
- [x] **Ikon folder:** warna menurut isi yang lazim (`src` biru, `tests` hijau, `dist`/`target` oranye, `.git` merah, `docs` toska, `assets` ungu, `node_modules` redup), digambar terbuka saat folder dibuka.
- [x] Ikon yang sama dipakai di tab editor dan status bar.

## Verifikasi

- `tests/domain/language.test.ts`, `tests/domain/fileIcons.test.ts`, `tests/infrastructure/codemirror/languages.test.ts`: ditulis dulu dan gagal, lalu lulus. Total suite 266 tes; setiap dari 40 paket bahasa benar-benar dimuat dalam tes.
- Typecheck bersih. JS awal 131 KB gzip (target ≤ 250 KB); paket bahasa tetap chunk terpisah.
- Dilihat langsung di build release dengan repo RustPilot sebagai folder kerja: ikon folder/file tampil, highlight aktif pada `index.tsx`.

## Yang tidak dikerjakan

- Blok kode di dalam Markdown belum disorot menurut bahasanya.
- `Makefile`, `.gitignore`, dan file `.bat` belum punya highlight (belum ada mode yang cocok).
- Skenario E2E penuh (41 pemeriksaan) tidak dijalankan ulang setelah perubahan ini; hanya pemeriksaan visual di atas.
