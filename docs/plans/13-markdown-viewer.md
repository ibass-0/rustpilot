# Plan 13: Markdown Viewer

## Tujuan

Memberikan pengalaman membaca Markdown yang nyaman tanpa kehilangan akses ke
sumber kode asli.

## Perilaku utama

- File `.md` terbuka dengan dua mode: **Preview** dan **Code**.
- Tombol mode tampil sebagai ikon di area tab/editor.
- Mode Preview merender Markdown secara aman dan konsisten dengan tema editor.
- Mode Code menampilkan editor CodeMirror seperti biasa.
- Perubahan file di Code langsung memperbarui Preview.
- Tombol keyboard untuk berganti mode, misalnya `Ctrl+Shift+V`.

## Scope Markdown awal

- Heading H1–H6, paragraph, line break, bold, italic, inline code.
- Link, gambar lokal, ordered/unordered list, blockquote.
- Code fence dengan label bahasa, horizontal rule, dan table sederhana.

## Keamanan

- HTML mentah harus disanitasi sebelum masuk DOM.
- Link eksternal dibuka melalui alur aman aplikasi.
- Path gambar dibatasi pada workspace atau aset yang diizinkan.
- Markdown rusak tidak boleh menyebabkan aplikasi crash.

## Desain teknis

- Tambahkan deteksi `isMarkdownFile(path)` di domain editor.
- Simpan mode Code/Preview per file selama tab terbuka.
- Buat `MarkdownPreview` sebagai surface terpisah dari CodeMirror.
- Toolbar mode berada di header editor dan memakai ikon Material Design.
- Pastikan diff viewer, SQL console, dan terminal tidak terpengaruh.

## Tahapan implementasi

1. Deteksi file Markdown dan state mode Code/Preview.
2. Tambahkan tombol toggle dan shortcut.
3. Implementasikan renderer Markdown aman.
4. Tambahkan styling heading, code block, tabel, link, dan quote.
5. Sinkronkan update Code → Preview.
6. Tambahkan test renderer untuk syntax utama dan input berbahaya.
7. Uji file kosong, file besar, gambar lokal, dan tab Markdown ganda.

## Acceptance criteria

- Membuka `.md` menampilkan tombol Preview dan Code.
- Preview dapat diganti kembali ke Code tanpa kehilangan edit.
- Markdown umum terbaca baik pada tema gelap.
- HTML/script berbahaya tidak dieksekusi.
- Shortcut toggle tidak mengganggu shortcut editor lain.
- Build dan test frontend tetap hijau.

## Commit target

`feat: add markdown preview and source modes`
