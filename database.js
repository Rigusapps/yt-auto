require('dotenv').config();
const { createClient } = require('@libsql/client');

let dbUrl = (process.env.TURSO_DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
let authToken = (process.env.TURSO_AUTH_TOKEN || '').trim().replace(/^["']|["']$/g, '');

// Paksa ubah ke https:// untuk menghindari error migration jobs 400
if (dbUrl.startsWith('libsql://')) {
  dbUrl = dbUrl.replace('libsql://', 'https://');
}

const turso = createClient({
  url: dbUrl,
  authToken: authToken,
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

    console.log('✅ Database Turso Cloud berhasil terhubung via HTTPS!');
    return true;
  } catch (err) {
    console.error('❌ Gagal inisialisasi tabel:', err.message || err);
    return false;
  }
}

module.exports = { turso, initDb };
