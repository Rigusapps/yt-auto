// scheduler.js
const cron = require('node-cron');
const db = require('./database');
const { uploadVideoToYouTube } = require('./youtubeService');
const fs = require('fs');

function initScheduler() {
  // Cron expression '* * * * *' = Berjalan otomatis setiap 1 menit
  cron.schedule('* * * * *', async () => {
    console.log('[Scheduler] Mengecek antrean video...');

    // Ambil angka timestamp PC saat ini dalam milidetik (Waktu Lokal PC)
    const nowTimestamp = Date.now();

    // Ambil item Pending yang jadwalnya (timestamp) <= timestamp PC saat ini
    const pendingItems = db.prepare(`
      SELECT * FROM queue 
      WHERE status = 'Pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
    `).all(nowTimestamp);

    if (pendingItems.length === 0) {
      return;
    }

    for (const item of pendingItems) {
      try {
        // Validasi ketersediaan channel_id pada item antrean
        if (!item.channel_id) {
          throw new Error('Video tidak memiliki channel_id tujuan yang valid.');
        }

        console.log(`[Scheduler] Memproses upload ID: ${item.id} - "${item.title}" ke Channel ID: ${item.channel_id}`);

        // 1. Ubah status menjadi 'Processing' agar tidak dieksekusi ganda oleh worker lain
        db.prepare('UPDATE queue SET status = ? WHERE id = ?').run('Processing', item.id);

        // 2. Eksekusi Upload ke YouTube (youtubeService akan mengambil OAuth token berdasarkan item.channel_id)
        const result = await uploadVideoToYouTube(item);

        // 3. Update status menjadi 'Completed' dan simpan YouTube Video ID
        db.prepare(`
          UPDATE queue 
          SET status = 'Completed', youtube_id = ? 
          WHERE id = ?
        `).run(result.id, item.id);

        console.log(`[Scheduler] Berhasil upload ID ${item.id}. YouTube ID: ${result.id}`);

        // 4. Hapus file temporary di folder uploads setelah sukses upload
        if (item.file_path && fs.existsSync(item.file_path)) {
          fs.unlinkSync(item.file_path);
        }

      } catch (error) {
        console.error(`[Scheduler] Gagal upload ID ${item.id}:`, error.message);

        // Update status menjadi 'Failed' dan catat pesan error
        db.prepare(`
          UPDATE queue 
          SET status = 'Failed', error_message = ? 
          WHERE id = ?
        `).run(error.message, item.id);
      }
    }
  });
}

module.exports = initScheduler;