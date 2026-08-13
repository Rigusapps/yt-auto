// youtubeService.js
const { youtube } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
// 1. Destructure turso directly from database.js
const { turso } = require('./database');
require('dotenv').config();

// Inisialisasi OAuth2 Client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// 1. Fungsi untuk mendapatkan URL Authentikasi Google
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Memaksa Google menampilkan dialog persetujuan & pilih akun
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ]
  });
}

// 2. Fungsi untuk menyimpan data channel, token, dan user_id pemilik ke database Turso
async function handleCallback(code, userId) {
  if (!userId) {
    throw new Error('User ID tidak ditemukan. Anda harus login terlebih dahulu.');
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Ambil profil channel YouTube yang sedang di-login
  const yt = youtube({ version: 'v3', auth: oauth2Client });
  const response = await yt.channels.list({
    part: ['snippet'],
    mine: true
  });

  const channel = response.data.items && response.data.items[0];
  if (!channel) {
    throw new Error('Channel YouTube tidak ditemukan pada akun Google ini.');
  }

  const channelId = channel.id;
  const title = channel.snippet.title;
  const avatarUrl = channel.snippet.thumbnails.default.url;
  const refreshToken = tokens.refresh_token;

  // PERBAIKAN: Gunakan turso.execute dengan await
  await turso.execute({
    sql: `
      INSERT INTO channels (id, title, avatar_url, refresh_token, user_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        avatar_url = excluded.avatar_url,
        refresh_token = COALESCE(excluded.refresh_token, channels.refresh_token),
        user_id = excluded.user_id
    `,
    args: [channelId, title, avatarUrl, refreshToken || null, userId]
  });

  return { id: channelId, title, avatarUrl };
}

// 3. Fungsi untuk menyiapkan Client YouTube khusus berdasarkan channel_id (Dibuat ASYNC)
async function getAuthenticatedClient(channelId) {
  if (!channelId) {
    throw new Error('Channel ID tidak ditentukan!');
  }

  // PERBAIKAN: Gunakan turso.execute secara async
  const result = await turso.execute({
    sql: 'SELECT refresh_token FROM channels WHERE id = ?',
    args: [channelId]
  });

  const channel = result.rows[0];

  if (!channel || !channel.refresh_token) {
    throw new Error(`Refresh token untuk Channel ID ${channelId} tidak ditemukan. Silakan login ulang channel ini.`);
  }

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  client.setCredentials({
    refresh_token: channel.refresh_token
  });

  return youtube({ version: 'v3', auth: client });
}

// 4. Fungsi utama untuk upload video ke YouTube berdasarkan channel_id
async function uploadVideoToYouTube(videoData) {
  // PERBAIKAN: Tambahkan await karena getAuthenticatedClient sekarang async
  const yt = await getAuthenticatedClient(videoData.channel_id);

  const response = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: videoData.title,
        description: videoData.description,
        tags: videoData.tags ? videoData.tags.split(',').map(t => t.trim()) : []
      },
      status: {
        privacyStatus: videoData.privacy_status
      }
    },
    media: {
      body: fs.createReadStream(videoData.file_path)
    }
  });

  return response.data;
}

module.exports = {
  getAuthUrl,
  handleCallback,
  uploadVideoToYouTube
};
