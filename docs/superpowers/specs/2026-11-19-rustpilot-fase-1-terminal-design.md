# RustPilot — Desain Fase 1 (Terminal)

Tanggal: 2026-11-19

## Maksud

Panel Terminal di RustPilot sekarang kosong. Fase 1 mengisinya dengan terminal sungguhan, supaya pemilik bisa menjalankan perintah (`make dev`, `git`, `cargo`) tanpa pindah jendela. Ini juga pemakai pertama jalur streaming Rust → frontend, yang nanti dipakai agent.

## Tujuan

- Terminal interaktif di panel bawah: mengetik, program interaktif (`vim`, `python`, `git log`), warna, resize.
- Pilihan shell: PowerShell 7, Windows PowerShell, Command Prompt, Git Bash, WSL. Hanya yang terpasang yang muncul.
- Beberapa terminal sekaligus dalam tab.
- Terminal dibuka di folder workspace yang sedang terbuka.

## Bukan tujuan

Split pane di dalam panel terminal, memulihkan sesi setelah aplikasi ditutup, profil shell buatan pengguna, pengaturan font/warna terminal, tautan yang bisa diklik, pencarian di scrollback, integrasi shell (penanda perintah), macOS/Linux.

## Anti-tujuan

- **Proses yatim:** shell atau anak prosesnya tetap hidup setelah tab atau aplikasi ditutup.
- **Start jadi berat:** emulator terminal ikut dimuat saat aplikasi dibuka padahal panel belum dipakai.
- **Pintasan editor merusak terminal:** `Ctrl+W` menutup tab editor alih-alih menghapus kata di bash, atau `Ctrl+R` ditelan penjaga reload alih-alih mencari riwayat.
- **Teks rusak:** karakter non-ASCII terpotong di batas potongan data dan tampil sebagai `�`.

## Pendekatan

| | Backend | Frontend | Trade-off |
|---|---|---|---|
| **A (dipilih)** | `portable-pty` (ConPTY) di proses Tauri | `xterm.js`, dimuat lazy | Terminal penuh; menambah satu crate dan ±75 KB gzip yang baru dimuat saat panel dibuka. |
| B | `std::process` dengan pipa | `<pre>` sederhana | Paling ringan, tapi bukan terminal: tidak ada program interaktif, warna, atau resize. |
| C | `tauri-plugin-shell` | `xterm.js` | Tanpa PTY, jadi `vim`/`python` interaktif tidak jalan; menambah plugin. |

A dipilih karena B dan C tidak menghasilkan terminal yang bisa dipakai sehari-hari.

## Keputusan

Ditetapkan pemilik:

- Terminal dikerjakan sebagai fitur berikutnya.
- Mendukung Command Prompt, Bash, PowerShell, dan sejenisnya.

Keputusan penyusun (boleh dikoreksi):

- **Shell dan urutannya:** PowerShell 7 (`pwsh.exe`), Windows PowerShell (`powershell.exe`), Command Prompt (`cmd.exe`), Git Bash (`bash.exe` dari folder instalasi Git, dijalankan `--login -i`), WSL (`wsl.exe`). Yang pertama tersedia jadi default.
- **Git Bash dicari di folder instalasi Git**, bukan lewat `PATH`, karena `bash.exe` di `PATH` Windows bisa berarti WSL.
- **Folder kerja:** root workspace; bila tidak ada folder terbuka, folder home pengguna.
- **Tab:** membuka panel Terminal untuk pertama kali langsung membuat satu terminal default. Tombol `+` membuat terminal default lagi; panah di sebelahnya memilih shell.
- **Proses selesai:** tab tetap ada dengan tulisan `[Process exited with code N]`, sampai ditutup pengguna.
- **Menutup tab** mematikan shell tanpa konfirmasi. Menutup aplikasi mematikan semua shell.
- **Pintasan saat fokus di terminal:** `Ctrl+S`, `Ctrl+W`, `Ctrl+F4` diteruskan ke shell, tidak ke editor. `F5`/`Ctrl+R` tetap tidak me-reload jendela, tetapi tombolnya sampai ke shell. `Alt+1`, `Alt+2`, `Alt+F12` tetap pintasan aplikasi.
- **Salin/tempel:** `Ctrl+C` menyalin bila ada teks terpilih, selain itu mengirim interupsi. `Ctrl+V` dan `Ctrl+Shift+V` menempel. `Ctrl+Shift+C` menyalin.
- **Scrollback:** 5000 baris per terminal.
- **Tampilan:** warna terminal mengikuti tema island; font Fira Code seperti editor.
- **Data keluar** dikirim sebagai teks UTF-8 lewat Tauri `Channel`; urutan byte yang terpotong di batas potongan ditahan sampai lengkap.
- **Ukuran awal** 80×24, lalu disesuaikan dengan ukuran panel.

## Arsitektur

**Rust (`src-tauri/src`)**

- `domain/terminal.rs` — `ShellProfile`, `TerminalSize`, `TerminalEvent`, `Utf8Stream` (penahan byte terpotong).
- `domain/ports.rs` — tambah `ProgramLocator` (cari program) dan `PtySpawner` / `PtySession` (jalankan dan kendalikan shell).
- `application/terminal.rs` — `available_shells` (aturan deteksi shell) dan `TerminalSessions` (daftar sesi hidup).
- `infrastructure/pty.rs` — `PortablePtySpawner` di atas `portable-pty`; `infrastructure/program_locator.rs` — pencarian di `PATH` dan disk.
- `presentation/commands.rs` — `terminal_shells`, `terminal_open`, `terminal_write`, `terminal_resize`, `terminal_close`.

**Frontend (`src`)**

- `domain/terminal.ts` — `ShellProfile`, `TerminalTab`, penamaan tab.
- `application/ports.ts` — tambah `PtyPort` (backend) dan `TerminalScreenPort` (layar emulator).
- `application/terminalStore.ts` — tab, terminal aktif, sambungan layar ↔ PTY.
- `infrastructure/tauri/pty.ts` — `PtyPort` lewat `invoke` + `Channel`.
- `infrastructure/xterm/screens.ts` — `TerminalScreenPort` di atas `xterm.js`, dimuat lazy.
- `presentation/terminal/TerminalPanel.tsx` — tab terminal, tombol `+`, pemilih shell, area terminal.

## Target

| Ukuran | Target |
|---|---|
| JS awal (gzip), tanpa membuka terminal | tetap ≤ 250 KB |
| Dari membuka panel sampai prompt tampil | ≤ 1 detik |
| Installer | tetap ≤ 10 MB |

## Diserahkan ke pembangun

Nama kelas CSS, warna ANSI persisnya, bentuk menu pemilih shell, dan teks empty state.
