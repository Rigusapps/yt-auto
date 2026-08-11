require('dotenv').config();
const { createClient } = require('@libsql/client');

// Sanitasi string URL & Token
let dbUrl = (process.env.TURSO_DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
let authToken = (process.env.TURSO_AUTH_TOKEN || '').trim().replace(/^["']|["']$/g, '');

// Ubah libsql:// menjadi https:// agar koneksi Turso stabil via HTTP
if (dbUrl.startsWith('libsql://')) {
  dbUrl = dbUrl.replace('libsql://', 'https://');
}

if (!dbUrl || !authToken) {
  console.error('❌ WARN: TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN belum terpasang di Render!');
}

const turso = createClient({
  url: dbUrl || 'file:scheduler.db',
  authToken: authToken || undefined,
});

async function initDb() {
  try {
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
      )
    `);

    await turso.execute(`
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        channel_title TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

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
      )
    `);

    console.log('✅ Semua tabel (users, channels, schedules) siap di Turso Cloud!');
    return true;
  } catch (err) {
    console.error('❌ Gagal inisialisasi tabel Turso:', err.message || err);
    return false;
  }
}

// EKSPOR DUA-DUANYA AGAR DIPANGGIL DI SERVER.JS TANPA ERROR
module.exports = { turso, initDb };
