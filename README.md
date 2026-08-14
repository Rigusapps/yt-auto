# 🚀 YouTube Multi-Channel Auto Uploader & Scheduler

Aplikasi berbasis **Node.js & Express** untuk mengelola, menjadwalkan, dan mengunggah video ke banyak channel YouTube secara otomatis. Sistem ini dilengkapi dengan kontrol akun multi-user, persetujuan admin, integrasi Google OAuth2, penyimpanan cloud temporary via **Cloudinary**, database terdistribusi **Turso (LibSQL)**, serta **penanganan zona waktu presisi (Asia/Jakarta - WIB)**.

---

## 📌 Fitur Utama

- 🔐 **Multi-User & Role System**: Pendaftaran akun baru dengan sistem persetujuan (*approval*) manual oleh Admin. Pendaftar pertama pada sistem otomatis mendapatkan hak akses **Admin**.
- 📺 **Multi-Channel YouTube Integration**: Pengguna dapat menghubungkan beberapa channel YouTube menggunakan integrasi Google OAuth2.
- ☁️ **Cloud Temporary Video Storage (Cloudinary)**: Penyimpanan berkas video sementara di cloud tanpa memakan disk lokal server. Bebas dari masalah *ephemeral storage* & hilangnya file saat re-deploy di platform cloud.
- ⏰ **Centralized WIB Timezone Engine**: Pemrosesan jadwal tayang dikunci pada skala **WIB (UTC+7)** langsung dari *backend* untuk mencegah pergeseran jam antrean di browser/client.
- 🗄️ **Cloud Database (Turso/LibSQL)**: Penyimpanan data pengguna, channel, dan entri jadwal antrean yang cepat, terdistribusi, serta handal.
- 🔄 **Worker Background Scheduler & Auto-Cleanup**: Worker background (`node-cron`) yang memeriksa antrean setiap menit, mengunggah video ke YouTube via API, dan secara otomatis membersihkan berkas video dari Cloudinary setelah unggahan selesai atau gagal.
- 🌐 **Automated CI/CD & Always-On 24/7**: Terhubung langsung dengan GitHub untuk *auto-deploy* ke Render.com dan dijaga tetap aktif 24 jam menggunakan **UptimeRobot**.

---

## 🏗️ Ekosistem & Arsitektur Sistem

Sistem ini dibangun dengan membagi peran secara terdistribusi untuk efisiensi, keamanan, dan keandalan tinggi:

| Platform / Pustaka | Peran & Fungsi dalam Sistem |
| :--- | :--- |
| **GitHub** | **Penyimpan Kode Sumber (Source Code Repository)** sekaligus pemicu otomatisasi deployment (CI/CD) ke Render.com setiap ada pembaruan kode. |
| **Render.com** | **Server Utama (Node.js App Host)** yang menjalankan `server.js` dan background worker `scheduler.js` secara 24/7. |
| **Cloudinary** | **Penyimpanan Berkas Video (`.mp4`) Sementara** di cloud untuk menghindari terhapusnya berkas akibat *ephemeral storage* di server Render. |
| **Turso DB (LibSQL)** | **Database Cloud Utama** untuk menyimpan data pengguna, kredensial token OAuth channel YouTube, dan status entri jadwal antrean video. |
| **UptimeRobot** | **Layanan Penjaga Server** yang mengirimkan *ping* HTTP setiap 5 menit agar server Render.com tidak masuk ke mode *sleep*. |
| **YouTube Data API v3** | **API Resmi Google/YouTube** untuk mengeksekusi pengunggahan video langsung ke channel tujuan. |

---

## 💡 Penjelasan Masalah Storage & Zona Waktu (WIB)

### 1. Penanganan Ephemeral Storage (Cloudinary Integration)
Di platform cloud container seperti Render.com, penyimpanan disk lokal bersifat *ephemeral* (sementara). Jika berkas disimpan di folder lokal server, berkas video akan terhapus saat server mengalami *restart* atau *re-deploy*.

**Solusi Sistem:**
1. Saat pengguna mengunggah video, berkas langsung dikirim ke **Cloudinary Storage**.
2. URL Publik dari Cloudinary disimpan ke tabel `queue` di database **Turso**.
3. Saat jadwal tayang tiba, worker `scheduler.js` mengambil *stream* berkas langsung dari URL Cloudinary dan mengirimkannya ke YouTube API.
4. Setelah proses upload selesai (sukses/gagal), berkas di Cloudinary **otomatis dihapus** oleh worker untuk menghemat ruang penyimpanan cloud.

### 2. Penanganan Presisi Zona Waktu WIB (UTC+7)
Untuk menghindari pergeseran jam jadwal (+7 jam) akibat konversi tanggal lokal browser:
1. `server.js` memproses seluruh masukan waktu menjadi timestamp UTC/WIB presisi (`Asia/Jakarta`).
2. Server menyediakan properti `display_date` yang sudah diformat matang dari backend.
3. Frontend hanya bertugas menampilkan teks siap pakai tanpa perlu mengolah kembali objek `Date`.

---

## ⚙️ Persyaratan Environment Variables (`.env`)

Konfigurasikan variabel lingkungan berikut pada file `.env` lokal atau pada menu **Environment Variables** di Dashboard Render.com:

```env
# Server Configuration
PORT=3000
SESSION_SECRET=yt-scheduler-secret-key-12345
NODE_ENV=production
TZ=Asia/Jakarta

# Turso Cloud Database Credentials
TURSO_DATABASE_URL=libsql://nama-database-anda.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Cloudinary Storage Credentials
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

# Google OAuth2 Credentials
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=[https://domain-anda.com/oauth2callback](https://domain-anda.com/oauth2callback)
