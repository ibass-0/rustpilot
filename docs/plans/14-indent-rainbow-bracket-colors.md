# Plan 14: Indent Rainbow + Bracket Colors + Code Folding

## Tujuan

Membuat struktur nesting kode lebih mudah dipindai melalui garis indentasi
berwarna dan pasangan bracket yang memiliki warna konsisten.

## Perilaku utama

- Setiap level indentasi memiliki warna yang berulang secara lembut.
- Garis indentasi hanya tampil pada area yang relevan agar editor tetap bersih.
- Bracket berpasangan diberi warna berdasarkan kedalaman nesting.
- Bracket aktif saat cursor berada di dekatnya mendapat highlight tambahan.
- Bracket tidak berpasangan diberi warna peringatan.
- Blok kode dapat di-collapse/expand dari gutter editor.
- Shortcut fold/unfold tersedia untuk blok aktif dan seluruh dokumen.
- Fitur aktif untuk bahasa yang memiliki struktur bracket umum.
- Tidak mengubah isi dokumen atau perilaku undo/redo.

## Palet warna

- Gunakan 5–6 warna yang kontras namun tidak menyilaukan.
- Warna harus terbaca pada tema gelap RustPilot.
- Sediakan opacity rendah untuk indent guide dan opacity penuh saat aktif.
- Hormati `prefers-reduced-motion`; tidak memakai animasi wajib.

## Desain teknis

- Tambahkan extension CodeMirror untuk indent guide melalui `DecorationSet`.
- Hitung level indentasi dari whitespace awal setiap baris secara efisien.
- Gunakan syntax tree/bracket matching CodeMirror untuk highlight pasangan bracket.
- Recompute hanya pada viewport atau baris yang berubah bila memungkinkan.
- Buat theme extension terpisah agar mudah diaktifkan/nonaktifkan.
- Tambahkan setting workspace:
  - `editor.indentRainbow`
  - `editor.bracketPairColors`
- `editor.codeFolding`

## Tahapan implementasi

1. Tambahkan token warna editor untuk indent dan bracket.
2. Implementasikan indent guide pada baris yang memiliki nesting.
3. Tambahkan warna pasangan bracket berdasarkan depth.
4. Tambahkan highlight bracket aktif dan unmatched bracket.
5. Hubungkan toggle ke Workspace Settings.
6. Aktifkan code folding berbasis syntax tree dan gutter fold marker.
7. Tambahkan shortcut fold/unfold blok dan fold all/unfold all.
8. Tambahkan test untuk indent campuran tab/spasi dan bracket bersarang.
9. Uji file besar, Markdown code fence, string literal, dan komentar.

## Acceptance criteria

- Indentasi bertingkat dapat dibedakan sekilas tanpa mengganggu teks.
- Pasangan `()`, `[]`, dan `{}` memiliki warna yang konsisten.
- Cursor di bracket menonjolkan pasangan yang tepat.
- Bracket dalam string/comment tidak salah ditandai.
- Tidak ada lag yang terasa saat mengetik file besar.
- Toggle setting langsung berlaku tanpa restart.
- Collapse/expand tidak mengubah isi file dan tetap aman saat undo/redo.

## Commit target

`feat: add indent rainbow and bracket pair colors`
