# Plan 15: Multi-Provider AI Agent

## Tujuan

Mengubah panel AI Agent dari placeholder menjadi agent yang dapat memakai
beberapa provider melalui satu workflow yang konsisten.

## Provider awal

1. **Claude** melalui Claude Code SDK/CLI resmi dengan dua mode autentikasi:
   - **API key** Anthropic untuk penggunaan berbasis API.
   - **Subscription** Claude Pro/Max melalui login OAuth Claude Code.
2. **Codex/OpenAI** melalui OpenAI API atau CLI resmi yang tersedia.
3. **Antigravity** melalui adapter terpisah setelah format API/CLI resminya
   dikonfirmasi.

Provider tidak boleh mengharuskan UI mengetahui detail protokol masing-masing.

## Perilaku utama

- Provider dan model dapat dipilih dari header Agent.
- Claude menampilkan pilihan koneksi **API Key** atau **Claude Subscription**.
- Percakapan mendukung streaming token.
- Riwayat percakapan tersimpan per workspace secara lokal.
- Agent dapat membaca file yang dipilih atau konteks workspace terbatas.
- Agent mengusulkan perubahan sebagai patch sebelum diterapkan.
- Command terminal selalu meminta konfirmasi sebelum dijalankan.
- User dapat membatalkan request yang sedang berjalan.
- Error autentikasi, rate limit, dan network ditampilkan dengan jelas.

## Keamanan

- API key disimpan memakai secure storage OS, bukan file project.
- Secret tidak pernah dimasukkan ke prompt atau log.
- Akses file dibatasi pada workspace yang sedang dibuka.
- Perubahan file harus melalui diff review dan persetujuan user.
- Command berbahaya memerlukan konfirmasi eksplisit.
- Provider eksternal tidak boleh mengakses workspace sebelum user menyetujui.

## Desain teknis

- Definisikan interface `AgentProvider`:
  - `listModels()`
  - `sendMessage()`
  - `cancel()`
  - `capabilities()`
- Buat adapter `ClaudeProvider`, `OpenAiProvider`, dan `AntigravityProvider`.
- Gunakan event stream umum: `text`, `toolCall`, `toolResult`, `approval`,
  `error`, dan `done`.
- Pisahkan orchestrator agent dari transport provider.
- Tambahkan permission broker untuk file read/write dan terminal.
- Tambahkan secure credential port di backend Tauri.
- Jalankan Claude Code SDK sebagai proses resmi untuk mode subscription; jangan
  membaca atau mengekstrak token internal Claude.ai.
- Gunakan patch application agar perubahan dapat ditinjau sebelum diterapkan.

## Tahapan implementasi

1. Model provider, message, stream event, dan permission.
2. UI chat dasar pada panel AI Agent.
3. Secure storage untuk credential dan provider settings.
4. Adapter Claude API key dengan streaming.
5. Adapter Claude subscription melalui Claude Code SDK/CLI dan status login.
6. Adapter OpenAI/Codex dengan streaming.
7. Context picker untuk file aktif, selection, dan workspace.
8. Patch preview, approve/reject, dan undo perubahan.
9. Terminal tool dengan approval dialog.
10. Adapter Antigravity setelah spesifikasi akses tersedia.
11. Test mock provider, cancellation, error, dan permission boundary.

## Acceptance criteria

- User dapat memilih provider dan model tanpa restart aplikasi.
- Pesan tampil streaming dan dapat dibatalkan.
- Credential tidak tersimpan di source code atau workspace.
- Agent tidak dapat mengubah file tanpa persetujuan.
- Semua perubahan agent terlihat sebagai diff.
- Provider yang gagal tidak membuat panel agent crash.
- Claude dan OpenAI dapat digunakan melalui interface yang sama.
- Claude dapat terhubung melalui API key atau subscription Claude Pro/Max.
- Antigravity memiliki status `available`, `not configured`, atau `unsupported`
  yang jelas bila adapter belum dapat diaktifkan.

## Catatan Antigravity

Nama “Antigravity” harus dipetakan ke produk atau CLI yang dimaksud sebelum
implementasi adapter. Jangan mengirim credential atau request ke endpoint yang
belum diverifikasi.

## Commit target

`feat: add multi-provider AI agent foundation`
