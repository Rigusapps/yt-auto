// scheduler.js
const cron = require('node-cron');
const { turso } = require('./database');
const { uploadVideoToYouTube } = require('./youtubeService');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Konfigurasi Cloudinary dari .env
cloudinary.config();

// Flag untuk mencegah cron job berjalan berbarengan (Overlapping Execution)
let isProcessing = false;

// Fungsi Bantuan untuk Menghapus File dari Cloudinary atau Disk Lokal
async function deleteFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return;

  if (filePath.includes('cloudinary.com')) {
    try {
      // Ekstraksi Public ID secara presisi dari URL Cloudinary
      const regex = /\/v\d+\/(.+)\.[a-z0-9]+$/i;
      const match = filePath.match(regex);
      const publicId = match ? match[1] : null;

      if (publicId) {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        console.log(`[Scheduler] 🧹 Berkas ${publicId} berhasil dibersihkan dari Cloudinary Storage.`);
      }
    } catch (err) {
      console.error(`[Scheduler Warning] Gagal menghapus file Cloudinary:`, err.message);
    }
  } else {
    // Jika berupa Berkas Lokal Disk
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`[Scheduler] Berkas fisik lokal ${filePath} berhasil dibersihkan.`);
      } catch (unlinkErr) {
        console.error(`[Scheduler Warning] Gagal menghapus berkas temporary lokal:`, unlinkErr.message);
      }
    }
  }
}

function initScheduler() {
  // Cron expression '* * * * *' = Berjalan otomatis setiap 1 menit
  cron.schedule('* * * * *', async () => {
    if (isProcessing) {
      console.log('[Scheduler] Proses unggah sebelumnya masih berjalan, melewati siklus ini...');
      return;
    }

    isProcessing = true;

    try {
      // Waktu timestamp universal saat ini dalam milidetik (UNIX Time)
      const nowTimestamp = Date.now();

      // 1. Ambil item 'Pending' yang waktunya sudah tiba
      const pendingRes = await turso.execute({
        sql: `
          SELECT * FROM queue 
          WHERE status = 'Pending' AND scheduled_at <= ?
          ORDER BY scheduled_at ASC
        `,
        args: [nowTimestamp]
      });

      const pendingItems = pendingRes.rows;

      if (!pendingItems || pendingItems.length === 0) {
        return; // Blok 'finally' akan otomatis mengubah isProcessing menjadi false
      }

      console.log(`[Scheduler] Ditemukan ${pendingItems.length} antrean video untuk diproses.`);

      for (const item of pendingItems) {
        try {
          // Validasi ketersediaan channel_id
          if (!item.channel_id) {
            throw new Error('Video tidak memiliki channel_id tujuan yang valid.');
          }

          if (!item.file_path) {
            throw new Error('Jalur berkas video (file_path) kosong.');
          }

          const isRemoteUrl = item.file_path.startsWith('http://') || item.file_path.startsWith('https://');

          // Validasi ketersediaan berkas jika lokal
          if (!isRemoteUrl && !fs.existsSync(item.file_path)) {
            throw new Error(`Berkas video lokal tidak ditemukan di server: ${item.file_path}`);
          }

          console.log(`[Scheduler] Memproses upload ID ${item.id}: "${item.title}" -> Channel ID: ${item.channel_id}`);

          // 2. Tandai status menjadi 'Processing' agar tidak diproses ganda oleh worker lain
          await turso.execute({
            sql: "UPDATE queue SET status = 'Processing' WHERE id = ?",
            args: [item.id]
          });

          // 3. Eksekusi upload ke YouTube via API v3
          const result = await uploadVideoToYouTube(item);

          // 4. Update status menjadi 'Completed' dan simpan YouTube Video ID
          await turso.execute({
            sql: "UPDATE queue SET status = 'Completed', youtube_id = ? WHERE id = ?",
            args: [result.id, item.id]
          });

          console.log(`[Scheduler] ✅ Berhasil upload ID ${item.id}. YouTube Video ID: ${result.id}`);

          // 5. Hapus berkas dari Cloudinary / Lokal Disk setelah sukses upload
          await deleteFile(item.file_path);

        } catch (error) {
          console.error(`[Scheduler Error] Gagal mengunggah ID ${item.id}:`, error.message);

          // Update status menjadi 'Failed' dan catat pesan error
          await turso.execute({
            sql: "UPDATE queue SET status = 'Failed', error_message = ? WHERE id = ?",
            args: [error.message, item.id]
          });

          // Hapus juga berkas fisik/Cloudinary jika gagal total agar storage tidak tersumbat
          await deleteFile(item.file_path);
        }
      }
    } catch (err) {
      console.error('[Scheduler Critical Error]:', err.message);
    } finally {
      // Bebaskan lock agar siklus cron menit berikutnya dapat berjalan
      isProcessing = false;
    }
  });
}

module.exports = initScheduler;
