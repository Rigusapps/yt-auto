// scheduler.js
const cron = require('node-cron');
const db = require('./database');
const { uploadVideoToYouTube } = require('./youtubeService');
const fs = require('fs');

function initScheduler() {
  // Cron expression '* * * * *' = Berjalan otomatis setiap 1 menit
  cron.schedule('* * * * *', async () => {
    try {
      console.log('[Scheduler] Mengecek antrean video...');

      // Ambil waktu ISO UTC saat ini
      const nowIso = new Date().toISOString();

      // Ambil item Pending yang jadwalnya (scheduled_time) <= waktu saat ini
      const pendingItemsRes = await db.execute({
        sql: `
          SELECT * FROM schedules 
          WHERE status = 'Pending' AND scheduled_time <= ?
          ORDER BY scheduled_time ASC
        `,
        args: [nowIso]
      });

      const pendingItems = pendingItemsRes.rows;

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
          await db.execute({
            sql: 'UPDATE schedules SET status = ? WHERE id = ?',
            args: ['Processing', item.id]
          });

          // 2. Eksekusi Upload ke YouTube
          const result = await uploadVideoToYouTube(item);

          // 3. Update status menjadi 'Completed' dan simpan YouTube Video ID
          await db.execute({
            sql: `
              UPDATE schedules 
              SET status = 'Completed', youtube_video_id = ? 
              WHERE id = ?
            `,
            args: [result.id, item.id]
          });

          console.log(`[Scheduler] Berhasil upload ID ${item.id}. YouTube ID: ${result.id}`);

          // 4. Hapus file temporary di folder uploads setelah sukses upload
          if (item.file_path && fs.existsSync(item.file_path)) {
            try { fs.unlinkSync(item.file_path); } catch (e) {}
          }

        } catch (error) {
          console.error(`[Scheduler] Gagal upload ID ${item.id}:`, error.message);

          // Update status menjadi 'Failed' dan catat pesan error
          await db.execute({
            sql: `
              UPDATE schedules 
              SET status = 'Failed', error_message = ? 
              WHERE id = ?
            `,
            args: [error.message, item.id]
          });
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error pada siklus cron job:', err.message);
    }
  });
}

module.exports = initScheduler;
