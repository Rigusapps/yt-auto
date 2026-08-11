// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { turso: db, initDb } = require('./database');
const { getAuthUrl, handleCallback } = require('./youtubeService');
const initScheduler = require('./scheduler');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- PROXY SETTING UNTUK CLOUD DEPLOYMENT (RENDER) ---
app.set('trust proxy', 1);

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Pengaturan Session Cookie
app.use(session({
  secret: process.env.SESSION_SECRET || 'yt-scheduler-secret-key-12345',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 1 Hari
    secure: false, // Set false agar lancar di Render HTTP/HTTPS
    sameSite: 'lax'
  }
}));

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// --- MIDDLEWARES AUTHENTICATION ---
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Sesi habis atau belum login.' });
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

// 1. REGISTER USER
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email, whatsapp } = req.body;
    if (!username || !password || !email || !whatsapp) {
      return res.status(400).json({ error: 'Semua kolom wajib diisi!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Hitung jumlah user
    const countRes = await db.execute('SELECT COUNT(*) as cnt FROM users');
    const firstRow = countRes.rows[0];
    const count = Number(firstRow?.cnt ?? firstRow?.[0] ?? 0);

    // Pendaftar pertama otomatis Admin & Approved
    const role = count === 0 ? 'admin' : 'user';
    const isApproved = count === 0 ? 1 : 0;

    await db.execute({
      sql: 'INSERT INTO users (username, password, email, whatsapp, role, is_approved) VALUES (?, ?, ?, ?, ?, ?)',
      args: [username.trim(), hashedPassword, email.trim(), whatsapp.trim(), role, isApproved]
    });

    const msg = role === 'admin' 
      ? 'Pendaftaran Admin berhasil! Silakan login.' 
      : 'Pendaftaran berhasil! Akun Anda sedang menunggu persetujuan Admin.';

    console.log(`[Auth] User terdaftar: ${username} (${role})`);
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[Register Error]:', err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username sudah digunakan!' });
    }
    res.status(500).json({ error: `Gagal daftar: ${err.message}` });
  }
});

// 2. LOGIN USER
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan Password wajib diisi!' });
    }

    const userRes = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username.trim()]
    });

    const user = userRes.rows[0];
    
    if (!user) {
      return res.status(400).json({ error: 'Username atau Password salah!' });
    }

    const isMatch = await bcrypt.compare(password, String(user.password));
    if (!isMatch) {
      return res.status(400).json({ error: 'Username atau Password salah!' });
    }

    if (user.role !== 'admin' && Number(user.is_approved) !== 1) {
      return res.status(403).json({ error: 'Akun Anda belum disetujui/diaktifkan oleh Admin.' });
    }

    req.session.user = { 
      id: Number(user.id), 
      username: String(user.username), 
      role: String(user.role) 
    };

    console.log(`[Auth] Login berhasil: ${username}`);
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error('[Login Error]:', err);
    res.status(500).json({ error: `Gagal login: ${err.message}` });
  }
});

// 3. CEK SESI USER
app.get('/api/me', (req, res) => {
  res.json({ user: req.session ? (req.session.user || null) : null });
});

// 4. LOGOUT
app.post('/api/logout', (req, res) => {
  if (req.session) {
    req.session.destroy();
  }
  res.json({ success: true });
});

// --- GOOGLE OAUTH ROUTES ---
app.get('/auth', requireAuth, (req, res) => {
  res.redirect(getAuthUrl());
});

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

// --- API CHANNELS & SCHEDULES ---
app.get('/channels', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const channelsRes = req.session.user.role === 'admin' 
      ? await db.execute('SELECT id, channel_id, channel_title FROM channels')
      : await db.execute({
          sql: 'SELECT id, channel_id, channel_title FROM channels WHERE user_id = ?',
          args: [userId]
        });
    res.json(channelsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/schedule', requireAuth, upload.single('video'), async (req, res) => {
  try {
    const { title, description, tags, privacy_status, scheduled_at, channel_id } = req.body;
    
    if (!req.file) return res.status(400).json({ error: 'File video wajib diunggah!' });
    if (!channel_id) return res.status(400).json({ error: 'Pilih channel tujuan unggah!' });

    const scheduledTime = new Date(scheduled_at).toISOString();
    const userId = req.session.user.id;

    await db.execute({
      sql: `
        INSERT INTO schedules (title, description, tags, privacy_status, scheduled_time, file_path, channel_id, user_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
      `,
      args: [title, description, tags, privacy_status, scheduledTime, req.file.path, channel_id, userId]
    });

    res.json({ message: 'Video berhasil ditambahkan ke antrean!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/queue-status', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isDbAdmin = req.session.user.role === 'admin';

    const sql = isDbAdmin ? `
      SELECT s.*, c.channel_title AS channel_name, u.username 
      FROM schedules s 
      LEFT JOIN channels c ON s.channel_id = c.channel_id 
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.id ASC
    ` : `
      SELECT s.*, c.channel_title AS channel_name 
      FROM schedules s 
      LEFT JOIN channels c ON s.channel_id = c.channel_id 
      WHERE s.user_id = ?
      ORDER BY s.id ASC
    `;

    const result = isDbAdmin 
      ? await db.execute(sql) 
      : await db.execute({ sql, args: [userId] });

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- START SERVER BERURUTAN ---
async function startServer() {
  try {
    await initDb();
    initScheduler();

    app.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Gagal menjalankan server:', err);
  }
}

startServer();
