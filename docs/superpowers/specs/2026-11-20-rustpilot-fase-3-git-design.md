# RustPilot — Desain Fase 3 (Git: VS Code + JetBrains, multi-project)

Tanggal: 2026-11-20

## Maksud

Git di RustPilot sekarang baru bisa membaca status, stage/unstage, dan menampilkan diff teks sederhana. Fase 3 menjadikannya alat kerja harian yang lengkap: alur cepat ala **VS Code Source Control** (stage, commit, sync dari satu panel) digabung dengan kedalaman **JetBrains Git** (log bergrafik, branch popup, push dialog, merge tiga arah, annotate, operasi serentak di banyak repository). Semua bekerja di workspace yang berisi **banyak project**, dan tiap project boleh berisi banyak repository.

`docs/git-feature-plan.md` adalah catatan arah sebelumnya; spec ini menggantikannya sebagai acuan.

## Model multi-project

- **Workspace** berisi satu atau lebih **project** (folder root). Pengguna bisa *Add Folder to Workspace* dan *Remove from Workspace*; daftar disimpan dan dipulihkan saat start.
- Di bawah tiap project, RustPilot menemukan semua **repository**: root project itu sendiri, repository bersarang, submodule, dan worktree. Satu repository punya identitas = path root absolutnya (dinormalisasi, tanpa beda huruf besar-kecil di Windows).
- Setiap repository punya state sendiri: branch, upstream, ahead/behind, perubahan, operasi yang sedang berjalan (merge/rebase/cherry-pick), sibuk, error.
- Setiap path file dipetakan ke repository terdekat (prefix terpanjang). Semua aksi Git selalu dijalankan di repository pemilik path itu.
- **Repository aktif** = repository dari file di tab editor aktif; bila tidak ada, repository pertama dari project pertama. Widget branch di title bar mengikuti repository aktif (seperti JetBrains).
- Banyak repository bisa dioperasikan **serentak** bila pengguna memilih (fetch/pull/push semua, checkout branch dengan nama sama di semua repo — fitur "synchronous branch control" JetBrains), dengan hasil per repository.

## Acuan fitur

| Area | Dari VS Code | Dari JetBrains | Hasil di RustPilot |
|---|---|---|---|
| Panel perubahan | Source Control: grup Changes / Staged / Merge, input pesan, tombol Commit | Commit tool window: tampilan pohon per folder, amend, opsi commit | Tool window **Commit** (kiri): per repository → Merge Changes, Staged, Changes, Untracked; tampilan daftar atau pohon; pesan commit + riwayat pesan; Commit / Commit & Push / Amend |
| Diff | Diff editor inline/side-by-side | Diff viewer dengan aksi per hunk | Tab diff (CodeMirror merge view): berdampingan atau unified, navigasi hunk, stage/unstage/revert per hunk |
| Editor | Gutter decoration | Line status markers + peek/rollback | Penanda baris berubah di gutter, klik → peek diff dan Revert/Stage hunk |
| Riwayat | Ekstensi *Git Graph*, Timeline | **Git Log** bergrafik, filter, detail commit | Tool window **Git** (bawah) tab Graph: grafik lane berwarna, ref label, filter, detail + daftar file, compare dua commit, aksi klik-kanan |
| Blame | GitLens: blame inline baris aktif + hover | **Annotate with Git Blame** di gutter, blame previous revision, **Code Vision author** di atas fungsi/kelas | Blame inline + annotate di gutter + author di atas tiap deklarasi + hover dengan aksi, file history, line history |
| Branch | Status bar branch picker | **Branch popup** (recent, local, remote, aksi per branch), compare branch | Popup dari title bar: cari, recent, local/remote/tags, checkout/new/rename/delete/merge/rebase/compare; serentak di semua repo |
| Remote | Sync, publish | **Push dialog** (pratinjau commit), pull dengan merge/rebase | Fetch/Pull/Push/Sync dengan progres + batal; push dialog per repo; publish branch; auto-fetch |
| Konflik | Merge editor | **Merge dialog tiga panel** | Daftar file konflik + editor tiga panel (Ours / Result / Theirs), accept per sisi per chunk |
| Lain | Stash, Timeline | Annotate (blame), file history, cherry-pick, revert, reset, interactive rebase, shelve, changelists | Stash, annotate, file history, cherry-pick, revert, reset; interactive rebase dan changelists di tahap akhir |

## Tahapan

Dikerjakan bertahap; tiap tahap punya plan sendiri, bisa dipakai sendiri, dan di-commit sendiri. Plan ditulis tepat sebelum tahapnya dimulai.

| Tahap | Isi |
|---|---|
| **G1 Fondasi multi-project** | Workspace multi-root; registry repository per project (bersarang, submodule, worktree); state per repository; routing path → repository; refresh otomatis (watcher `.git`, fokus jendela, setelah simpan, setelah operasi); widget repository + branch di title bar; dekorasi file di semua project; panel Commit dikelompokkan per repository (masih dengan aksi yang ada). |
| **G2 Commit workflow** | Panel Commit lengkap: grup Merge/Staged/Changes/Untracked, daftar ↔ pohon, multi-pilih, stage/unstage file/folder/semua, discard (dengan konfirmasi), pesan commit + riwayat + validasi, Commit / Commit & Push / Amend / sign-off, error hook ditampilkan, badge per repo. |
| **G3 Diff & gutter** | Diff editor (`@codemirror/merge`): berdampingan/unified, file baru/hapus/rename/biner, navigasi hunk, stage/unstage/revert hunk (`git apply`); penanda baris di gutter editor + peek. |
| **G4a Git Graph** | Tool window Git → tab **Graph** (rincian di "Git Graph" di bawah). |
| **G4b Blame & riwayat file** | Blame inline, annotate di gutter, author di atas fungsi/kelas (Code Vision), hover commit, file history, line history (rincian di "Blame" di bawah). |
| **G5 Branch & tag** | Branch popup: recent, local, remote, tag; checkout (dengan opsi smart checkout = stash otomatis), new, rename, delete, compare, merge into current, rebase onto; operasi serentak multi-repo; detached HEAD aman. |
| **G6 Remote** | Fetch / Pull (merge atau rebase) / Push / Sync; progres streaming dan batal; push dialog dengan daftar commit; force-with-lease dengan konfirmasi; publish branch; auto-fetch berkala; kredensial lewat Git Credential Manager. |
| **G7 Konflik, rebase, stash** | Daftar konflik + editor tiga panel; continue/abort/skip untuk merge, rebase, cherry-pick; stash create/apply/pop/drop/diff; cherry-pick, revert commit, reset (soft/mixed/hard dengan konfirmasi). |
| **G8 Lanjutan** | Interactive rebase editor, changelists, shelve, worktree manager, info submodule/LFS, aksi `.gitignore`. |

## Git Graph (G4a)

Gabungan ekstensi *Git Graph* VS Code dan Git Log JetBrains, ditampilkan di tool window **Git** (bawah), tab **Graph**.

- **Grafik lane berwarna**: garis per branch, titik commit, merge dan fork digambar sebagai kurva; warna lane stabil per branch. Digambar di `<canvas>` hanya untuk baris yang terlihat (virtual scroll), sehingga 100.000+ commit tetap lancar.
- **Kolom**: graph, subject, label ref (branch lokal, remote, tag, `HEAD`, stash; branch aktif ditebalkan), author, tanggal (relatif + tooltip absolut), hash pendek. Kolom bisa diubah lebarnya dan disembunyikan.
- **Sumber data**: semua branch (bawaan), branch saat ini saja, atau pilihan branch tertentu; opsi tampilkan remote branch, tag, stash, dan commit yang tidak terjangkau (dangling) dimatikan bawaan.
- **Filter dan cari**: teks (subject, hash, author), author, rentang tanggal, path (hanya commit yang menyentuh file/folder); hasil cari disorot dan bisa lompat berikutnya/sebelumnya.
- **Detail commit** (panel kanan/bawah, bisa dipindah): pesan lengkap, author/committer, tanggal, parent (bisa diklik), ref yang memuat commit, daftar file berubah sebagai daftar atau pohon dengan +/− baris; klik file → diff terhadap parent (merge commit: pilih parent).
- **Bandingkan**: pilih dua commit (Ctrl+klik) → daftar file berbeda dan diff di antaranya; bandingkan commit dengan working tree.
- **Menu klik-kanan commit**: checkout (detached, dengan peringatan), create branch here, create tag here, cherry-pick, revert, reset current branch ke sini (soft/mixed/hard, hard dengan konfirmasi), copy hash/subject, interactive rebase dari sini (G8). Menu klik-kanan label branch/tag: checkout, merge into current, rebase current onto, rename, delete, push, compare with current.
- **Lompat**: ke `HEAD`, ke commit dari hash, ke branch tertentu; tautan dari blame dan file history membuka commit di graph.
- **Multi-repo**: pemilih repository di toolbar graph (bawaan: repository aktif); opsi "All repositories" menampilkan log gabungan diurutkan tanggal dengan kolom repository berwarna (grafik lane per repository disembunyikan pada mode gabungan).
- **Data**: `git log --topo-order --date-order -z` dengan format berpemisah NUL (hash, parent, author, tanggal, ref, subject), diproses per halaman 500 commit; layout lane dihitung di Rust (`domain/git_graph.rs`, fungsi murni dengan tes) dan dikirim sebagai daftar segmen per baris. Refresh graph mengikuti watcher `.git`.

## Blame (G4b)

Gabungan GitLens/VS Code (blame inline) dan JetBrains (Annotate with Git Blame).

- **Blame inline baris aktif**: teks samar di akhir baris kursor: `author, 3 days ago • subject` (muncul setelah kursor diam 300 ms; bisa dimatikan di settings). Baris belum di-commit: `You • Uncommitted changes`.
- **Annotate di gutter** (Toggle Annotate, klik-kanan gutter atau `Ctrl+Alt+B`): kolom kiri berisi tanggal + author per blok commit, warna latar bertingkat menurut umur (baru = lebih terang); blok baris dari commit yang sama digabung.
- **Hover** pada blame/annotate: hash, author, tanggal absolut, pesan lengkap, dan tombol: *Open in Graph*, *Show Diff* (perubahan commit untuk file ini), *Copy Hash*, *Blame Previous Revision* (annotate parent commit untuk baris itu, seperti JetBrains).
- **Akurat saat diedit**: blame dihitung untuk isi buffer saat ini (`git blame --contents -` dengan isi editor), jadi baris yang baru diketik ditandai uncommitted dan nomor baris tetap cocok; dihitung ulang dengan debounce setelah berhenti mengetik dan setelah simpan.
- **Opsi**: abaikan whitespace (`-w`), deteksi baris pindah/salin (`-M`/`-C`), `.git-blame-ignore-revs` dihormati bila ada.
- **Author di atas kode (Code Vision ala JetBrains)**: di atas setiap deklarasi (fungsi, method, kelas, interface, struct, impl) tampil baris kecil samar berisi author utama blok itu dan jumlah kontributor lain, mis. `Indra Basuki +2`. Author utama = yang menulis baris terbanyak di blok itu (dari blame yang sama, tanpa perintah Git tambahan). Hover → daftar semua author dengan jumlah baris dan tanggal perubahan terakhir; klik → buka annotate yang difokuskan ke blok itu, atau file history yang difilter ke rentang baris itu (`git log -L`).
  - Batas blok diambil dari pohon sintaks CodeMirror (Lezer) yang sudah dipakai panel Structure, jadi berlaku untuk semua bahasa yang punya parser; bahasa tanpa parser tidak menampilkan hint.
  - Ditampilkan sebagai *block widget* CodeMirror di atas baris deklarasi; tidak mengubah isi file, tidak ikut tersalin, dan tidak menggeser nomor baris.
  - File belum di-commit atau blok yang seluruhnya baru: `You (uncommitted)`.
  - Bisa dimatikan di settings (`git.codeVision.authors`), dan otomatis tidak tampil di file > 5.000 baris kecuali diminta.
- **File history**: dari menu file/tab → daftar commit yang menyentuh file (mengikuti rename, `--follow`), klik → diff versi itu; buka di graph dengan filter path.
- **Line history**: seleksi baris → *Show History for Selection* (`git log -L`), daftar commit yang mengubah rentang itu dengan diff-nya.
- **Data**: `git blame --porcelain` (incremental untuk file besar, ditampilkan bertahap), diparse di Rust (`domain/git_blame.rs` dengan tes); cache per (file, HEAD, versi buffer).
- **Batas**: file biner atau > 5 MB tidak di-blame; file tak terlacak menampilkan "Not committed yet".

## Bukan tujuan (seluruh Fase 3)

Hosting service (GitHub/GitLab PR, issue), pengelolaan kredensial sendiri (pakai Git Credential Manager), membaca internal `.git` secara langsung untuk operasi tulis, Git versi lama (< 2.30), macOS/Linux.

## Anti-tujuan

- **Kehilangan pekerjaan:** discard, reset hard, checkout paksa, drop stash, atau force push tanpa konfirmasi yang menyebut apa yang hilang.
- **Salah repository:** aksi dijalankan di repository lain dari pemilik file, terutama di workspace multi-project.
- **UI membeku:** status repo besar, log panjang, atau push lambat memblokir jendela.
- **Injeksi:** nama file, pesan commit, atau nama branch diperlakukan sebagai argumen/opsi/sintaks shell.
- **Merusak konfigurasi pengguna:** mengabaikan hooks, signing, credential helper, `core.autocrlf`, atau `.gitattributes`.
- **Lock yang tertinggal:** `index.lock` milik RustPilot menghalangi Git di terminal.

## Keputusan

Ditetapkan pemilik: Git lengkap gabungan VS Code + JetBrains; mendukung multi-project.

Keputusan penyusun (boleh dikoreksi):

- **Git CLI**, bukan library (libgit2/gitoxide): kompatibel penuh dengan config, hooks, signing, credential manager, worktree, LFS. Minimal Git 2.30; versi dicek sekali saat start dengan pesan jelas bila kurang atau tidak ada.
- **Eksekusi aman:** argumen array tanpa shell, `--` sebelum path, nama branch divalidasi dengan `git check-ref-format`, pesan commit lewat file sementara (`-F`), bukan argumen.
- **Tanpa lock untuk baca:** `GIT_OPTIONAL_LOCKS=0` dan `--no-optional-locks` untuk status/log, supaya Git di terminal tidak terganggu.
- **Output mesin:** `status --porcelain=v2 -z`, `log` dengan format berpemisah NUL, `diff`/`show` untuk patch.
- **Operasi panjang** (fetch/pull/push/clone/rebase) di-stream lewat Tauri `Channel` dan bisa dibatalkan (proses dibunuh beserta anaknya). Prompt kredensial ditangani Git Credential Manager; `GIT_TERMINAL_PROMPT=0` supaya tidak ada proses menggantung menunggu input.
- **Refresh:** watcher (crate `notify`) hanya pada metadata `.git` (HEAD, index, refs, packed-refs, MERGE_HEAD, REBASE_*) dengan debounce 300 ms; perubahan isi file ditangkap lewat event simpan editor dan fokus jendela. Tidak mengawasi seluruh worktree (mahal pada `node_modules`).
- **Diff dan merge view:** `@codemirror/merge` (MIT, pembuat CodeMirror), dimuat lazy.
- **Grafik log** dihitung di Rust (domain murni, bisa dites), dikirim ke frontend per halaman 200 commit.
- **Warna repository:** di tampilan multi-repo, tiap repository diberi warna stabil dari palet (hash path), dipakai di kolom log dan judul seksi.

## Arsitektur (target akhir)

Rust: `domain/git.rs` (repository, status, commit, branch, ref, graph), `application/git/*` (use case per area), `infrastructure/git_cli.rs` (proses), `infrastructure/git_watch.rs` (notify), `presentation/commands.rs` (`git_*`).

Frontend: `domain/git.ts`, `domain/workspace.ts` (project & routing), `application/workspaceStore.ts` (multi-root), `application/gitStore.ts` (registry repo), lalu `commitStore.ts`, `gitLogStore.ts`, `branchStore.ts`, `remoteStore.ts`; UI di `presentation/git/` (CommitPanel, GitToolWindow, LogView, BranchPopup, PushDialog, MergeEditor) dan `presentation/editor/` (DiffEditor, gutter).

## Target

| Ukuran | Target |
|---|---|
| Status 5 repository, masing-masing 1.000 file berubah | tampil ≤ 1 detik, UI tetap responsif |
| Log 100.000 commit | halaman pertama ≤ 500 ms, scroll tanpa patah (virtual) |
| Graph: render 60 fps saat scroll | hanya baris terlihat digambar di canvas |
| Blame inline baris aktif | muncul ≤ 300 ms setelah kursor diam (dari cache) |
| Annotate file 5.000 baris | tampil bertahap, blok pertama ≤ 500 ms |
| JS awal (gzip) | tetap ≤ 250 KB; merge view, log, dan dialog Git lazy |
| Refresh setelah `git commit` di terminal | ≤ 1 detik lewat watcher |
