# 🚀 YouTube Multi-Channel Auto Uploader & Scheduler

Aplikasi berbasis Node.js & Express untuk menjadwalkan dan mengunggah video ke banyak channel YouTube secara otomatis. Sistem dilengkapi dengan kontrol sesi pengguna, persetujuan admin, integrasi Google OAuth2, database terdistribusi Turso (LibSQL), serta sinkronisasi zona waktu WIB (`Asia/Jakarta`).

---

## 📌 Fitur Utama

- 🔐 **Multi-User & Role System**: Sistem pendaftaran user dengan persetujuan (approval) manual oleh Admin. Pendaftar pertama otomatis menjadi Admin.
- 📺 **Multi-Channel YouTube Integration**: Setiap user dapat menghubungkan banyak channel YouTube menggunakan Google OAuth2.
- ⏰ **Penjadwalan Presisi (WIB)**: Pemrosesan tanggal dan waktu tayang dikunci pada skala **WIB (UTC+7)** langsung dari backend untuk mencegah pergeseran jam antrean.
- 🗄️ **Database Cloud (Turso/LibSQL)**: Penyimpanan data user, channel, dan antrean yang cepat dan terdistribusi.
- 🔄 **Worker Background Scheduler**: Proses pemutakhiran dan pengunggahan otomatis yang berjalan di latar belakang secara berkelanjutan.
- 🌐 **Deploy Ready & 24/7 Always-On**: Siap di-deploy ke platform seperti Render/Railway dan dijaga tetap aktif 24 jam menggunakan **UptimeRobot**.

---

## 🛠️ Teknologi yang Digunakan

* **Backend**: Node.js, Express.js
* **Database**: Turso DB (SQLite via LibSQL Client)
* **Authentication**: Express Session, Bcrypt.js, Google OAuth2
* **File Upload**: Multer
* **YouTube Integration**: Googleapis (`youtube_v3`)
* **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS (via CDN)

---

## ⚙️ Persyaratan Sistem & Environment Variables

Buat file `.env` di direktori utama proyek Anda dan isi variabel berikut:

```env
PORT=3000
SESSION_SECRET=yt-scheduler-secret-key-12345
NODE_ENV=production

# Database Turso
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Google OAuth2 Credential
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=[https://your-domain.com/oauth2callback](https://your-domain.com/oauth2callback)

====================================================================================================

🚀 Cara Menjalankan Secara Lokal
Clone repository ini:

Bash
git clone [https://github.com/username/yt-auto-scheduler.git](https://github.com/username/yt-auto-scheduler.git)
cd yt-auto-scheduler
Install dependensi:

Bash
npm install
Jalankan aplikasi:

Bash
npm start
Aplikasi akan berjalan di http://localhost:3000.

🌐 Panduan Deployment (Render & UptimeRobot)
1. Deploy ke Render.com
Buat Web Service baru di Render.com.

Hubungkan repository GitHub Anda.

Masukkan konfigurasi berikut:

Environment: Node

Build Command: npm install

Start Command: node server.js

Tambahkan seluruh isi file .env ke bagian Environment Variables di Dashboard Render.

Jalankan Deployment dan catat URL domain aplikasi Anda (misal: https://yt-scheduler.onrender.com).

2. Konfigurasi Google Cloud Console
Buka Google Cloud Console.

Aktifkan YouTube Data API v3.

Di menu OAuth 2.0 Credentials, tambahkan Authorized Redirect URIs:

Plaintext
[https://yt-scheduler.onrender.com/oauth2callback](https://yt-scheduler.onrender.com/oauth2callback)
3. Menjaga Server 24/7 Aktif dengan UptimeRobot
Layanan gratis seperti Render akan masuk ke mode sleep jika tidak ada aktivitas. Untuk menjaganya tetap Always-On agar Worker Scheduler tetap berjalan mengunggah video:

Buat akun di UptimeRobot.

Buat Monitor Baru dengan pengaturan:

Monitor Type: HTTP(s)

Friendly Name: YouTube Scheduler Engine

URL (or IP): https://yt-scheduler.onrender.com/api/me

Monitoring Interval: Every 5 minutes

Simpan monitor. UptimeRobot akan mengirim ping secara berkala sehingga server Anda tidak pernah mati.

📁 Struktur Direktori
Plaintext
├── database.js          # Inisialisasi dan koneksi ke Turso DB
├── youtubeService.js    # Modul Autentikasi Google & Upload API YouTube
├── scheduler.js         # Worker otomatis yang mengecek antrean setiap menit
├── server.js            # Main Express Server & Endpoints API
├── uploads/             # Folder direktori temporary berkas video
├── public/
│   ├── index.html       # Dashboard Utama User
│   ├── admin.html       # Panel Admin Control & Approval
│   └── login.html       # Halaman Login & Register
├── .env                 # Environment variables
└── README.md            # Dokumentasi proyek
📄 Lisensi & Kontribusi
Dikembangkan dan dipelihara oleh Buana Media. Hak cipta dilindungi undang-undang.
