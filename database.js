require('dotenv').config();
const { createClient } = require('@libsql/client');

// Ambil URL dan Token dari Environment Render
let dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
let authToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

// Pastikan protokol menggunakan https:// agar library Turso tidak meminta WebSocket / Migration Jobs
if (dbUrl.startsWith('libsql://')) {
  dbUrl = dbUrl.replace('libsql://', 'https://');
}

if (!dbUrl || !authToken) {
  console.error('❌ EROR KRITIS: TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN belum diisi di Environment Variables Render!');
}

const turso = createClient({
  url: dbUrl,
  authToken: authToken,
});

async function initDb() {
  try {
    // 1. Tabel Users
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        whatsapp TEXT,
        role TEXT DEFAULT 'user',
        is_approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabel Channels
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        channel_title TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // 3. Tabel Schedules
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        tags TEXT,
        privacy_status TEXT DEFAULT 'private',
        scheduled_time DATETIME NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT DEFAULT 'Pending',
        youtube_video_id TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    console.log('✅ BERHASIL: Semua tabel Turso Cloud siap!');
    return true;
  } catch (err) {
    console.error('❌ Gagal inisialisasi tabel Turso:', err.message || err);
    return false;
  }
}

module.exports = { turso, initDb };
