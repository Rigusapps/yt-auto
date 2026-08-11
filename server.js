// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { getAuthUrl, handleCallback } = require('./youtubeService');
const initScheduler = require('./scheduler');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- PROXY SETTING UNTUK CLOUD DEPLOYMENT (RENDER/HEROKU) ---
app.set('trust proxy', 1);

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'yt-scheduler-secret-key-12345',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 1 Hari
    secure: process.env.NODE_ENV === 'production' // Otomatis aktifkan secure cookie jika di Render (HTTPS)
  }
}));

// Buat direktori temporary uploads jika belum ada
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// --- MIDDLEWARES AUTHENTICATION & AUTHORIZATION ---
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Membutuhkan hak akses Admin.' });
  }
  next();
}

// --- AUTH ROUTES ---

// 1. Register User Baru
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email, whatsapp } = req.body;
    if (!username || !password || !email || !whatsapp) {
      return res.status(400).json({ error: 'Semua kolom wajib diisi!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Pendaftar pertama otomatis menjadi Admin & Langsung Approved
    const count = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    const role = count === 0 ? 'admin' : 'user';
    const isApproved = count === 0 ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO users (username, password, email, whatsapp, role, is_approved) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(username, hashedPassword, email, whatsapp, role, isApproved);

    const msg = role === 'admin' 
      ? 'Pendaftaran Admin berhasil! Silakan login.' 
      : 'Pendaftaran berhasil! Akun Anda sedang menunggu persetujuan (approval) Admin.';

    res.json({ message: msg });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username sudah digunakan.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 2. Login User
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: 'Username atau Password salah!' });
    }

    // Cek Persetujuan Admin untuk User Biasa
    if (user.role !== 'admin' && user.is_approved !== 1) {
      return res.status(403).json({ error: 'Akun Anda belum disetujui/diaktifkan oleh Admin. Silakan hubungi admin.' });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Cek Sesi Pengguna Aktif
app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// 4. Logout User
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// --- GOOGLE OAUTH ROUTES ---

// Trigger Redirect ke Google OAuth
app.get('/auth', requireAuth, (req, res) => {
  res.redirect(getAuthUrl());
});

// Callback dari Google OAuth (Menyimpan Channel ke User Aktif)
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const userId = (req.session && req.session.user) ? req.session.user.id : null;
    if (!userId) {
      return res.status(401).send('<h2>Sesi login tidak ditemukan. Silakan login terlebih dahulu.</h2><a href="/login.html">Ke Halaman Login</a>');
    }

    const channel = await handleCallback(code, userId);
    res.send(`
      <h2>Berhasil Menghubungkan Channel: ${channel.title}!</h2>
      <p>Channel ini telah dihubungkan ke akun Anda.</p>
      <a href="/">Kembali ke Dashboard</a>
    `);
  } catch (err) {
    res.status(500).send(`Autentikasi Gagal: ${err.message}`);
  }
});

// Get Daftar Channel Milik User
app.get('/channels', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const channels = req.session.user.role === 'admin' 
      ? db.prepare('SELECT id, title, avatar_url FROM channels').all()
      : db.prepare('SELECT id, title, avatar_url FROM channels WHERE user_id = ?').all(userId);
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hapus Koneksi Channel
app.delete('/channels/:id', requireAuth, (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    if (isAdmin) {
      db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
    } else {
      db.prepare('DELETE FROM channels WHERE id = ? AND user_id = ?').run(channelId, userId);
    }
    
    res.json({ success: true, message: 'Channel berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- QUEUE MANAGEMENT ROUTES ---

// Tambah Video Baru ke Antrean
app.post('/schedule', requireAuth, upload.single('video'), (req, res) => {
  try {
    const { title, description, tags, privacy_status, scheduled_at, channel_id } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'File video wajib diunggah!' });
    }
    if (!channel_id) {
      return res.status(400).json({ error: 'Pilih channel tujuan unggah!' });
    }

    const timestamp = new Date(scheduled_at).getTime();
    if (isNaN(timestamp)) {
      return res.status(400).json({ error: 'Format tanggal/waktu tidak valid!' });
    }

    const userId = req.session.user.id;

    const stmt = db.prepare(`
      INSERT INTO queue (title, description, tags, privacy_status, scheduled_at, file_path, channel_id, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(title, description, tags, privacy_status, timestamp, req.file.path, channel_id, userId);

    res.json({ message: 'Video berhasil ditambahkan ke antrean!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get List Antrean Video
app.get('/queue-status', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const isDbAdmin = req.session.user.role === 'admin';

    const sql = isDbAdmin ? `
      SELECT q.*, c.title AS channel_name, u.username 
      FROM queue q 
      LEFT JOIN channels c ON q.channel_id = c.id 
      LEFT JOIN users u ON q.user_id = u.id
      ORDER BY q.id ASC
    ` : `
      SELECT q.*, c.title AS channel_name 
      FROM queue q 
      LEFT JOIN channels c ON q.channel_id = c.id 
      WHERE q.user_id = ?
      ORDER BY q.id ASC
    `;

    const rows = isDbAdmin ? db.prepare(sql).all() : db.prepare(sql).all(userId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hapus Item Antrean Per-Baris
app.delete('/queue/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    const item = db.prepare('SELECT * FROM queue WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    // Cek Hak Akses
    if (!isAdmin && item.user_id !== userId) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses menghapus antrean ini.' });
    }

    // Hapus file fisik lokal
    if (item.file_path && fs.existsSync(item.file_path)) {
      try { fs.unlinkSync(item.file_path); } catch (e) {}
    }

    db.prepare('DELETE FROM queue WHERE id = ?').run(id);
    res.json({ success: true, message: 'Berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bersihkan Antrean Macet / Failed / Tanpa Channel
app.delete('/clear-stuck-queue', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    const sqlSelect = isAdmin ? `
      SELECT file_path FROM queue 
      WHERE status = 'Failed' OR status = 'Processing' OR channel_id IS NULL OR channel_id = ''
    ` : `
      SELECT file_path FROM queue 
      WHERE (status = 'Failed' OR status = 'Processing' OR channel_id IS NULL OR channel_id = '')
        AND user_id = ?
    `;

    const stuckItems = isAdmin ? db.prepare(sqlSelect).all() : db.prepare(sqlSelect).all(userId);

    stuckItems.forEach(item => {
      if (item.file_path && fs.existsSync(item.file_path)) {
        try { fs.unlinkSync(item.file_path); } catch (e) {}
      }
    });

    const sqlDelete = isAdmin ? `
      DELETE FROM queue 
      WHERE status = 'Failed' OR status = 'Processing' OR channel_id IS NULL OR channel_id = ''
    ` : `
      DELETE FROM queue 
      WHERE (status = 'Failed' OR status = 'Processing' OR channel_id IS NULL OR channel_id = '')
        AND user_id = ?
    `;

    const result = isAdmin ? db.prepare(sqlDelete).run() : db.prepare(sqlDelete).run(userId);

    res.json({ success: true, message: `Berhasil membersihkan ${result.changes} data antrean.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN SPECIFIC ROUTES ---

// Get Seluruh User untuk Admin
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, email, whatsapp, role, is_approved, created_at FROM users').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve / Setujui Akun User
app.post('/api/admin/approve/:id', requireAdmin, (req, res) => {
  try {
    const { is_approved } = req.body; // 1 = Disetujui, 0 = Ditangguhkan
    db.prepare('UPDATE users SET is_approved = ? WHERE id = ?').run(is_approved, req.params.id);
    res.json({ success: true, message: 'Status user berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hapus User oleh Admin
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const targetUserId = req.params.id;

    // Bersihkan file-file antrean milik user ini sebelum menghapus user
    const userQueue = db.prepare('SELECT file_path FROM queue WHERE user_id = ?').all(targetUserId);
    userQueue.forEach(q => {
      if (q.file_path && fs.existsSync(q.file_path)) {
        try { fs.unlinkSync(q.file_path); } catch (e) {}
      }
    });

    db.prepare('DELETE FROM queue WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM channels WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);

    res.json({ success: true, message: 'User beserta datanya berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WORKER & SERVER INIT ---

// Jalankan Worker Scheduler
initScheduler();

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
