// scheduler.js
const cron = require('node-cron');
const { turso } = require('./database');
const { uploadVideoToYouTube } = require('./youtubeService');
const fs = require('fs');

// Flag untuk mencegah cron job berjalan berbarengan jika proses upload sebelumnya belum selesai
let isProcessing = false;

function initScheduler() {
  // Cron expression '* * * * *' = Berjalan otomatis setiap 1 menit
  cron.schedule('* * * * *', async () => {
    if (isProcessing) {
      console.log('[Scheduler] Proses sebelumnya masih berjalan, melewati siklus ini...');
      return;
    }

    isProcessing = true;

    try {
      console.log('[Scheduler] Mengecek antrean video...');

      // Waktu timestamp universal saat ini dalam milidetik
      const nowTimestamp = Date.now();

      // 1. Ambil item 'Pending' yang waktunya sudah tiba (scheduled_at <= nowTimestamp)
      const pendingRes = await turso.execute({
        sql: `
          SELECT * FROM queue 
          WHERE status = 'Pending' AND scheduled_at <= ?
          ORDER BY scheduled_at ASC
        `,
        args: [nowTimestamp]
      });

      const pendingItems = pendingRes.rows;

      if (pendingItems.length === 0) {
        isProcessing = false;
        return;
      }

      for (const item of pendingItems) {
        try {
          // Validasi ketersediaan channel_id
          if (!item.channel_id) {
            throw new Error('Video tidak memiliki channel_id tujuan yang valid.');
          }

          console.log(`[Scheduler] Memproses upload ID: ${item.id} - "${item.title}" ke Channel ID: ${item.channel_id}`);

          // 2. Tandai status menjadi 'Processing' di Turso sebelum memulai upload
          await turso.execute({
            sql: "UPDATE queue SET status = 'Processing' WHERE id = ?",
            args: [item.id]
          });

          // 3. Eksekusi upload ke YouTube
          const result = await uploadVideoToYouTube(item);

          // 4. Update status menjadi 'Completed' dan simpan YouTube Video ID
          await turso.execute({
            sql: "UPDATE queue SET status = 'Completed', youtube_id = ? WHERE id = ?",
            args: [result.id, item.id]
          });

          console.log(`[Scheduler] Berhasil upload ID ${item.id}. YouTube ID: ${result.id}`);

          // 5. Hapus berkas video lokal di folder uploads setelah sukses
          if (item.file_path && fs.existsSync(item.file_path)) {
            try {
              fs.unlinkSync(item.file_path);
            } catch (unlinkErr) {
              console.error(`[Scheduler] Gagal menghapus file temporary ${item.file_path}:`, unlinkErr.message);
            }
          }

        } catch (error) {
          console.error(`[Scheduler] Gagal upload ID ${item.id}:`, error.message);

          // Update status menjadi 'Failed' dan catat pesan error
          await turso.execute({
            sql: "UPDATE queue SET status = 'Failed', error_message = ? WHERE id = ?",
            args: [error.message, item.id]
          });

          // Hapus juga file jika gagal total untuk menghemat ruang penyimpanan
          if (item.file_path && fs.existsSync(item.file_path)) {
            try {
              fs.unlinkSync(item.file_path);
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler Critical Error]:', err.message);
    } finally {
      // Bebaskan lock agar siklus cron berikutnya dapat berjalan
      isProcessing = false;
    }
  });
}

module.exports = initScheduler;
