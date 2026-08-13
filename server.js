// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { turso, initDb } = require('./database');
const { getAuthUrl, handleCallback } = require('./youtubeService');
const initScheduler = require('./scheduler');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Inisialisasi Tabel Turso saat aplikasi pertama kali berjalan
initDb();

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

// 1. Register User Baru (Turso Cloud)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email, whatsapp } = req.body;
    if (!username || !password || !email || !whatsapp) {
      return res.status(400).json({ error: 'Semua kolom wajib diisi!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Pendaftar pertama otomatis menjadi Admin & Langsung Approved
    const countRes = await turso.execute("SELECT COUNT(*) as cnt FROM users");
    const count = countRes.rows[0].cnt;

    const role = count === 0 ? 'admin' : 'user';
    const isApproved = count === 0 ? 1 : 0;

    await turso.execute({
      sql: `INSERT INTO users (username, password, email, whatsapp, role, is_approved) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [username, hashedPassword, email, whatsapp, role, isApproved]
    });

    const msg = role === 'admin' 
      ? 'Pendaftaran Admin berhasil! Silakan login.' 
      : 'Pendaftaran berhasil! Akun Anda sedang menunggu persetujuan (approval) Admin.';

    res.json({ message: msg });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username sudah digunakan.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 2. Login User (Turso Cloud)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const userRes = await turso.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username]
    });
    
    const user = userRes.rows[0];

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

// Get Daftar Channel Milik User (Turso Cloud)
app.get('/channels', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const channelsRes = req.session.user.role === 'admin' 
      ? await turso.execute('SELECT id, title, avatar_url FROM channels')
      : await turso.execute({ sql: 'SELECT id, title, avatar_url FROM channels WHERE user_id = ?', args: [userId] });
    
    res.json(channelsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hapus Koneksi Channel (Turso Cloud)
app.delete('/channels/:id', requireAuth, async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    if (isAdmin) {
      await turso.execute({ sql: 'DELETE FROM channels WHERE id = ?', args: [channelId] });
    } else {
      await turso.execute({ sql: 'DELETE FROM channels WHERE id = ? AND user_id = ?', args: [channelId, userId] });
    }
    
    res.json({ success: true, message: 'Channel berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- QUEUE MANAGEMENT ROUTES ---

// Tambah Video Baru ke Antrean (Mendukung Endpoint /api/schedule dan /schedule)
const scheduleHandler = async (req, res) => {
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

    await turso.execute({
      sql: `INSERT INTO queue (title, description, tags, privacy_status, scheduled_at, file_path, channel_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [title, description || '', tags || '', privacy_status || 'private', timestamp, req.file.path, channel_id, userId]
    });

    res.json({ message: 'Video berhasil ditambahkan ke antrean!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/schedule', requireAuth, upload.single('video'), scheduleHandler);
app.post('/schedule', requireAuth, upload.single('video'), scheduleHandler);

// Get List Antrean Video (Turso Cloud)
app.get('/queue-status', requireAuth, async (req, res) => {
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

    const rowsRes = isDbAdmin ? await turso.execute(sql) : await turso.execute({ sql, args: [userId] });
    res.json(rowsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hapus Item Antrean Per-Baris (Turso Cloud)
app.delete('/queue/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    const itemRes = await turso.execute({ sql: 'SELECT * FROM queue WHERE id = ?', args: [id] });
    const item = itemRes.rows[0];

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

    await turso.execute({ sql: 'DELETE FROM queue WHERE id = ?', args: [id] });
    res.json({ success: true, message: 'Berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bersihkan Antrean Macet / Failed / Tanpa Channel (Turso Cloud)
app.delete('/clear-stuck-queue', requireAuth, async (req, res) => {
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

    const stuckItemsRes = isAdmin ? await turso.execute(sqlSelect) : await turso.execute({ sql: sqlSelect, args: [userId] });

    stuckItemsRes.rows.forEach(item => {
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

    const result = isAdmin ? await turso.execute(sqlDelete) : await turso.execute({ sql: sqlDelete, args: [userId] });

    res.json({ success: true, message: `Berhasil membersihkan data antrean.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN SPECIFIC ROUTES ---

// Get Seluruh User untuk Admin (Turso Cloud)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const usersRes = await turso.execute('SELECT id, username, email, whatsapp, role, is_approved, created_at FROM users');
    res.json(usersRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve / Setujui Akun User (Turso Cloud)
app.post('/api/admin/approve/:id', requireAdmin, async (req, res) => {
  try {
    const { is_approved } = req.body; // 1 = Disetujui, 0 = Ditangguhkan
    await turso.execute({
      sql: 'UPDATE users SET is_approved = ? WHERE id = ?',
      args: [is_approved, req.params.id]
    });
    res.json({ success: true, message: 'Status user berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hapus User oleh Admin (Turso Cloud)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.id;

    // Bersihkan file-file antrean milik user ini sebelum menghapus user
    const userQueueRes = await turso.execute({ sql: 'SELECT file_path FROM queue WHERE user_id = ?', args: [targetUserId] });
    userQueueRes.rows.forEach(q => {
      if (q.file_path && fs.existsSync(q.file_path)) {
        try { fs.unlinkSync(q.file_path); } catch (e) {}
      }
    });

    await turso.execute({ sql: 'DELETE FROM queue WHERE user_id = ?', args: [targetUserId] });
    await turso.execute({ sql: 'DELETE FROM channels WHERE user_id = ?', args: [targetUserId] });
    await turso.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [targetUserId] });

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
