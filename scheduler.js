// scheduler.js
const cron = require('node-cron');
const db = require('./database');
const { uploadVideoToYouTube } = require('./youtubeService');
const fs = require('fs');

function initScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const nowIso = new Date().toISOString();

      // Query antrean video
      const pendingItemsRes = await db.execute({
        sql: `
          SELECT * FROM schedules 
          WHERE status = 'Pending' AND scheduled_time <= ?
          ORDER BY scheduled_time ASC
        `,
        args: [nowIso]
      });

      const pendingItems = pendingItemsRes.rows;
      if (!pendingItems || pendingItems.length === 0) return;

      for (const item of pendingItems) {
        try {
          if (!item.channel_id) {
            throw new Error('Video tidak memiliki channel_id tujuan yang valid.');
          }

          console.log(`[Scheduler] Memproses upload ID: ${item.id} - "${item.title}"`);

          // 1. Ubah status menjadi 'Processing'
          await db.execute({
            sql: "UPDATE schedules SET status = 'Processing' WHERE id = ?",
            args: [item.id]
          });

          // 2. Upload ke YouTube
          const result = await uploadVideoToYouTube(item);

          // 3. Update status ke 'Completed'
          await db.execute({
            sql: "UPDATE schedules SET status = 'Completed', youtube_video_id = ? WHERE id = ?",
            args: [result.id, item.id]
          });

          console.log(`[Scheduler] Berhasil upload ID ${item.id}. YouTube ID: ${result.id}`);

          // 4. Hapus file temporary
          if (item.file_path && fs.existsSync(item.file_path)) {
            try { fs.unlinkSync(item.file_path); } catch (e) {}
          }

        } catch (error) {
          console.error(`[Scheduler] Gagal upload ID ${item.id}:`, error.message);

          await db.execute({
            sql: "UPDATE schedules SET status = 'Failed', error_message = ? WHERE id = ?",
            args: [error.message, item.id]
          });
        }
      }
    } catch (err) {
      if (err.message && err.message.includes('no such table')) {
        console.log('[Scheduler] Menunggu tabel "schedules" dibuat oleh database.js...');
      } else {
        console.error('[Scheduler] Error pada siklus cron job:', err.message);
      }
    }
  });
}

module.exports = initScheduler;
