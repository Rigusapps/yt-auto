require('dotenv').config();
const { createClient } = require('@libsql/client');

// Sanitasi & pembersihan spasi/enter
let dbUrl = process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.trim() : '';
let authToken = process.env.TURSO_AUTH_TOKEN ? process.env.TURSO_AUTH_TOKEN.trim() : '';

// Otomatis ubah https:// menjadi libsql:// jika salah ketik
if (dbUrl.startsWith('https://')) {
  dbUrl = dbUrl.replace('https://', 'libsql://');
}

const isTursoConfigured = dbUrl.length > 0 && authToken.length > 0;

if (!isTursoConfigured) {
  console.warn('⚠️ WARN: TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN belum terpasang dengan benar!');
}

const turso = createClient({
  url: isTursoConfigured ? dbUrl : 'file:scheduler.db',
  authToken: isTursoConfigured ? authToken : undefined
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

    console.log('✅ Semua tabel berhasil diinisialisasi di Turso Cloud!');
    return true;
  } catch (err) {
    console.error('❌ Gagal membuat tabel di Turso:', err.message || err);
    return false;
  }
}

initDb();

module.exports = { turso, initDb };
