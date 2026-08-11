// database.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'scheduler.db'));
db.pragma('journal_mode = WAL');

// 1. Tabel Users (Mengandun email, whatsapp, & status persetujuan is_approved)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    whatsapp TEXT,
    role TEXT DEFAULT 'user', -- 'user' atau 'admin'
    is_approved INTEGER DEFAULT 0, -- 0 = Pending/Belum Disetujui, 1 = Disetujui
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 2. Tabel Channels
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    avatar_url TEXT,
    refresh_token TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 3. Tabel Queue
db.exec(`
  CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    tags TEXT,
    privacy_status TEXT DEFAULT 'private',
    scheduled_at INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    youtube_id TEXT,
    error_message TEXT,
    channel_id TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migrasi Otomatis jika database lama belum ada kolom baru
try {
  const uInfo = db.prepare("PRAGMA table_info(users)").all();
  if (!uInfo.some(c => c.name === 'email')) db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  if (!uInfo.some(c => c.name === 'whatsapp')) db.exec("ALTER TABLE users ADD COLUMN whatsapp TEXT");
  if (!uInfo.some(c => c.name === 'is_approved')) db.exec("ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0");

  const qInfo = db.prepare("PRAGMA table_info(queue)").all();
  if (!qInfo.some(c => c.name === 'user_id')) db.exec("ALTER TABLE queue ADD COLUMN user_id INTEGER");
  
  const cInfo = db.prepare("PRAGMA table_info(channels)").all();
  if (!cInfo.some(c => c.name === 'user_id')) db.exec("ALTER TABLE channels ADD COLUMN user_id INTEGER");
} catch (e) {
  console.error("[DB Migration Error]:", e.message);
}

module.exports = db;
