# Plan 16: SSH Terminal

## Tujuan

Menambahkan terminal SSH bergaya Termius di RustPilot untuk mengelola host
remote, membuka beberapa sesi, dan bekerja dari workspace yang sama.

## Scope rilis pertama

- Daftar profil SSH tersimpan secara lokal.
- Form koneksi: host, port, username, authentication method, dan label.
- Authentication method:
  - Password melalui secure storage.
  - Private key dari file lokal.
  - SSH agent/Pageant bila tersedia.
- Tombol Test Connection.
- Buka beberapa sesi SSH dalam tab terminal.
- Multiplexing seperti tmux untuk satu koneksi SSH:
  - Banyak window dalam satu host.
  - Split pane horizontal dan vertikal.
  - Pindah pane dengan shortcut.
  - Rename dan close window/pane.
  - Detach dan reattach session tanpa memutus koneksi.
- Reconnect dan Disconnect.
- Status koneksi dan pesan error yang jelas.
- Host key fingerprint ditampilkan saat pertama kali terhubung.
- User harus menyetujui fingerprint baru atau yang berubah.

## Keamanan

- Password, passphrase, dan private key tidak disimpan di project.
- Gunakan Windows Credential Manager/keyring untuk secret.
- Private key tidak pernah dikirim ke frontend sebagai plaintext.
- Validasi host key untuk mencegah koneksi ke host palsu.
- Jangan mencatat command, password, atau secret ke log.
- Hapus secret dari memory setelah sesi ditutup bila memungkinkan.

## Desain teknis

- Tambahkan domain model `SshProfile`, `SshAuthMethod`, dan `SshSession`.
- Tambahkan `SshPort` di application ports.
- Implementasikan koneksi di backend Tauri menggunakan library SSH yang
  mendukung Windows.
- Stream stdout/stderr ke xterm yang sudah tersedia.
- Kirim input dan resize terminal ke sesi remote.
- Tambahkan `SshMultiplexer` yang mengelola tree layout pane dan window.
- Gunakan tmux remote bila tersedia; fallback ke multiplexer lokal RustPilot
  untuk host yang tidak memiliki tmux.
- Simpan metadata layout dan target session, bukan output atau credential.
- Pisahkan profile store dari session store.
- Simpan metadata profil, bukan secret, di local storage.

## Tahapan implementasi

1. Model SSH profile, session, dan connection status.
2. Secure credential port untuk password/passphrase.
3. Backend SSH connect, write, resize, disconnect, dan output events.
4. UI SSH hosts dengan create/edit/delete dan Test Connection.
5. Integrasi sesi SSH ke tab terminal.
6. Multiplexer window/pane, split, focus, dan close.
7. Detach/reattach dan reconnect session.
8. Host key fingerprint approval dan changed-key warning.
9. Reconnect, retry, dan graceful disconnect.
10. Test mock transport, invalid credentials, timeout, resize, cancellation,
    dan operasi pane/window.

## Fase lanjutan

- SFTP file browser dan upload/download.
- Port forwarding lokal/remote/dynamic.
- Host groups dan tags.
- Jump host/bastion.
- Import/export profil terenkripsi.
- Snippet command per host.

## Acceptance criteria

- User dapat membuat profil dan terhubung ke server SSH.
- Terminal menerima input, output, dan resize dengan benar.
- Beberapa koneksi dapat berjalan bersamaan.
- Secret tidak muncul di UI log atau source project.
- Host key baru meminta persetujuan eksplisit.
- Koneksi putus dapat di-reconnect tanpa membuat aplikasi crash.
- Satu koneksi dapat memiliki beberapa window dan pane secara bersamaan.
- Detach/reattach mempertahankan layout tanpa menyimpan secret.
- Fitur terminal lokal yang ada tetap berjalan normal.

## Commit target

`feat: add secure SSH terminal profiles and sessions`
