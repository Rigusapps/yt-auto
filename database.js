require('dotenv').config();
const { createClient } = require('@libsql/client');

// 1. Ambil dan bersihkan string dari spasi, enter, atau tanda petik tak sengaja
function cleanEnv(val) {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '');
}

const dbUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
const authToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);

// 2. Cetak Diagnostik Koneksi di Log Server
console.log('--- DIAGNOSTIK KONEKSI TURSO ---');
console.log('URL Terdeteksi :', dbUrl ? dbUrl.substring(0, 30) + '...' : '❌ KOSONG / UNDEFINED');
console.log('Token Terdeteksi:', authToken ? '✅ ADA (' + authToken.length + ' karakter)' : '❌ KOSONG / UNDEFINED');
console.log('--------------------------------');

if (!dbUrl || !authToken) {
  console.error('❌ CRITICAL ERROR: Variabel TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN tidak ditemukan di Render!');
}

// 3. Inisialisasi Turso Client
const turso = createClient({
  url: dbUrl,
  authToken: authToken
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

    console.log('✅ KONEKSI SUKSES: Semua tabel Turso Cloud siap!');
  } catch (err) {
    console.error('❌ Gagal Inisialisasi Turso:', err.message || err);
  }
}

initDb();

module.exports = turso;
