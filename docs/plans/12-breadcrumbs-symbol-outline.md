# Plan 12: Breadcrumbs + Symbol Outline

## Tujuan

Mempercepat navigasi file dengan menampilkan lokasi file aktif dan daftar
symbol penting seperti fungsi, class, interface, method, serta heading.

## Scope rilis pertama

- Breadcrumbs di atas editor: workspace → folder → file.
- Symbol Outline di panel navigasi yang sudah tersedia.
- Parser ringan berbasis bahasa aktif dan struktur syntax yang tersedia.
- Klik symbol memindahkan cursor ke baris deklarasinya.
- Outline diperbarui saat file aktif atau isi file berubah.
- State kosong yang jelas untuk file tanpa symbol.
- Tidak menambahkan language server atau dependency besar.

## Bahasa awal

1. Rust: `fn`, `struct`, `enum`, `trait`, `impl`, `mod`.
2. TypeScript/JavaScript: `function`, class, interface, type, const/let.
3. Python: `def`, `class`.
4. Markdown: heading.

Bahasa lain memakai fallback heading/deklarasi sederhana jika memungkinkan.

## Desain teknis

- Tambahkan domain model `DocumentSymbol` dengan nama, kind, line, dan depth.
- Buat adapter parser murni yang menerima teks dan nama file.
- Simpan symbol hasil parse di editor store per path.
- Expose callback `revealLine` dari editor buffer ke panel outline.
- Render breadcrumbs dari path workspace relatif.
- Gunakan debounce singkat saat dokumen berubah agar editor tetap responsif.

## Tahapan implementasi

1. Model symbol dan parser regex/token ringan.
2. Integrasi update symbol dengan lifecycle buffer.
3. Render Breadcrumbs dan empty state.
4. Render Outline dengan indentasi berdasarkan depth.
5. Klik outline → lompat ke baris deklarasi.
6. Tambahkan test parser untuk Rust, TypeScript, Python, dan Markdown.
7. Commit terpisah setelah build dan test frontend hijau.

## Acceptance criteria

- File aktif selalu memiliki breadcrumbs yang benar.
- Outline menampilkan deklarasi penting tanpa crash pada file besar atau kosong.
- Klik symbol memindahkan cursor ke deklarasi yang tepat.
- Perubahan dokumen memperbarui outline tanpa jeda yang mengganggu.
- Parser gagal secara aman dan tidak menghalangi proses editing.

## Commit target

`feat: add breadcrumbs and symbol outline navigation`
