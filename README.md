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
