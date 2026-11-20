# RustPilot — Desain Fase 0 (Fondasi)

Tanggal: 2026-11-19

## Maksud

RustPilot adalah code editor desktop dengan AI agent coding, dibangun sendiri untuk dipakai sendiri oleh pemiliknya. Dua hal yang diminta pemilik: tampilan mirip JetBrains, dan seringan mungkin.

Fase 0 menghasilkan kerangka yang sudah bisa dipakai sebagai editor sederhana, tanpa AI. Tujuannya memastikan fondasi (layout, akses file, editor, jalur frontend–Rust) benar dan ringan sebelum agent ditambahkan di atasnya.

## Tujuan Fase 0

- Aplikasi Tauri 2 jalan di Windows 11 lewat `pnpm tauri dev` dan bisa di-build jadi installer.
- Shell layout ala JetBrains: stripe tool window di kiri dan kanan, panel kiri/kanan/bawah yang bisa dibuka-tutup dan diubah ukurannya, area tab editor di tengah, status bar di bawah.
- Buka folder, lihat file tree, buka file ke tab, edit, simpan.
- Lapisan perintah Rust yang terpisah dari Tauri, supaya nanti dipakai ulang oleh tool agent.
- Angka dasar keringanan terukur dan tercatat.

## Bukan tujuan Fase 0

Agent AI, terminal, LSP/autocomplete semantik, git, pencarian lintas file, pengaturan/preferences, tema terang, plugin, multi-window, auto-update, macOS/Linux. Panel "AI Agent" dan "Terminal" hanya ada sebagai panel kosong.

## Anti-tujuan

- Terasa berat: start lambat, memori besar saat idle, atau bundle membengkak karena dependensi yang tidak dipakai.
- Kehilangan isi file: simpan yang merusak line ending, atau tab ditutup tanpa peringatan saat ada perubahan belum tersimpan.

## Pendekatan

| | Frontend + editor | Agent (fase nanti) | Trade-off |
|---|---|---|---|
| **A (dipilih)** | SolidJS + CodeMirror 6 | Rust, di dalam proses Tauri | Paling ringan, satu binary. Agent loop dan tool ditulis sendiri. |
| B | React + Monaco | Rust | Fitur editor banyak siap pakai, tetapi bundle dan memori jauh lebih besar; tampilan condong ke VS Code. |
| C | SolidJS + CodeMirror 6 | Sidecar Node dengan SDK agent | Agent cepat jadi, tetapi membawa runtime Node dan dua bahasa backend. |

Pemilik memilih A. Alasannya: syarat "seringan mungkin" menggugurkan B dan C.

## Keputusan

Ditetapkan pemilik:

- Tauri 2.
- UI mirip JetBrains.
- Seringan mungkin.
- Pendekatan A.

Keputusan penyusun (boleh dikoreksi):

- **Bahasa/alat**: TypeScript, Vite, pnpm. Tes: Vitest (frontend), `cargo test` (Rust).
- **Styling**: CSS biasa dengan CSS variables. Tanpa Tailwind dan tanpa pustaka komponen.
- **Tema**: gelap saja, warna buatan sendiri bernuansa Darcula.
- **Font**: tidak di-bundle. Stack: `"JetBrains Mono", "Cascadia Code", Consolas, monospace`.
- **Title bar**: dekorasi jendela bawaan Windows. Title bar kustom ditunda.
- **Tool window**: `project` (kiri, berfungsi), `agent` (kanan, kosong), `terminal` (bawah, kosong). Satu tool window per sisi.
- **Pintasan**: `Alt+1` Project, `Alt+2` AI Agent, `Alt+F12` Terminal, `Ctrl+S` simpan, `Ctrl+W` dan `Ctrl+F4` tutup tab.
- **File tree**: dimuat per folder saat dibuka (tidak rekursif). Folder dulu, lalu file, urut nama tanpa membedakan huruf besar-kecil. Semua entri ditampilkan, termasuk yang diawali titik.
- **Batas file**: hanya teks UTF-8, maksimum 10 MB. Di luar itu ditolak dengan pesan yang jelas.
- **Line ending**: dideteksi saat buka (`crlf` bila file mengandung `\r\n`, selain itu `lf`), dipertahankan saat simpan. File dengan ending campuran diseragamkan ke hasil deteksi.
- **Simpan**: tulis langsung ke file (bukan lewat file sementara).
- **Buffer editor**: satu `EditorView` CodeMirror; tiap tab menyimpan `EditorState` sendiri sehingga undo dan posisi kursor bertahan saat pindah tab.
- **Bahasa di editor**: JS/TS, Rust, JSON, HTML, CSS, Markdown, Python; paket bahasa dimuat lewat dynamic import saat file jenis itu pertama dibuka.
- **Persistensi**: `localStorage` untuk layout (`rustpilot.layout.v1`) dan folder terakhir (`rustpilot.workspace.v1`). Tanpa plugin store.
- **Akses file**: perintah Rust menerima path absolut dan tidak dibatasi ke folder workspace. Pembatasan untuk agent dirancang di fase agent.
- **Streaming Rust → frontend** (Tauri `Channel`) tidak dibuat di Fase 0; dibuat bersama pemakai pertamanya (terminal). Fase 0 hanya menyiapkan pembungkus `invoke` bertipe dan bentuk error yang seragam.

## Tata letak

```
┌──┬───────────────┬──────────────────────────────┬───────────────┬──┐
│P │ Project       │ main.rs × │ lib.rs ● │       │ AI Agent      │ A│
│  │ ▾ src         ├──────────────────────────────┤ (kosong)      │  │
│  │    main.rs    │  1  fn main() {              │               │  │
│  │    lib.rs     │  2      run();               │               │  │
│  │ ▸ src-tauri   │  3  }                        │               │  │
│  │   Cargo.toml  │                              │               │  │
│T │               ├──────────────────────────────┴───────────────┤  │
│  │               │ Terminal (kosong)                            │  │
├──┴───────────────┴──────────────────────────────────────────────┴──┤
│ d:\proyek\contoh          main.rs      Ln 2, Col 5    CRLF   UTF-8 │
└────────────────────────────────────────────────────────────────────┘
```

Stripe kiri memuat tombol Project (atas) dan Terminal (bawah); stripe kanan memuat AI Agent. `●` pada tab berarti ada perubahan belum tersimpan. Panel bawah membentang di bawah editor dan panel kanan, tidak di bawah panel kiri.

## Arsitektur

**Rust (`src-tauri/src`)**

- `error.rs` — `AppError { kind, message }`, satu bentuk error untuk semua perintah.
- `fs/core.rs` — fungsi murni tanpa Tauri: `list_dir`, `read_text_file`, `write_text_file`. Ini yang nanti dipanggil tool agent.
- `fs/commands.rs` — pembungkus `#[tauri::command]` tipis di atas `core`.
- `lib.rs` — builder, registrasi perintah dan plugin dialog.

**Frontend (`src`)**

- `ipc/` — tipe dan pembungkus `invoke`; satu-satunya tempat yang memanggil `invoke`.
- `layout/` — shell, stripe, tool window, splitter, status bar, `layoutStore`.
- `workspace/` — `workspaceStore`, `FileTree`.
- `editor/` — `editorStore`, buffer, `EditorPane`, `EditorTabs`, tema, pemuat bahasa.
- `styles/tokens.css` — warna dan ukuran.

## Target keringanan

Target, diukur pada build release di akhir Fase 0 dan dicatat di README sebagai angka dasar:

| Ukuran | Target |
|---|---|
| Installer NSIS | ≤ 10 MB |
| JS awal (gzip, tanpa paket bahasa) | ≤ 250 KB |
| Jendela tampil sejak proses mulai | ≤ 1 detik |
| Memori idle, satu folder dan satu file terbuka (semua proses, termasuk WebView2) | ≤ 200 MB |

Bila satu target meleset, angkanya tetap dicatat bersama penyebabnya; Fase 0 tidak diblokir oleh itu.

## Diserahkan ke pembangun

Nama kelas CSS, nilai warna persisnya, struktur internal komponen, ikon (SVG inline sederhana), dan teks empty state.

## Peta fase berikutnya (garis besar, belum dirancang)

1. **Fase 1 — Terminal dan streaming**: PTY di Rust, `Channel` Rust → frontend, panel Terminal.
2. **Fase 2 — Agent inti**: klien model dengan streaming, agent loop, tool baca/tulis/cari/jalankan perintah, panel chat.
3. **Fase 3 — Kontrol perubahan**: tampilan diff, terima/tolak edit agent, batas akses folder.
4. **Fase 4 — Kecerdasan editor**: LSP, pencarian lintas file, go to definition.
5. **Fase 5 — Git dan kenyamanan**: status git, pengaturan, title bar kustom.
