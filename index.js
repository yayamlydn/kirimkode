// src/index.js  (Railway-ready)
// Main Entry Point — Business Verification Telegram Bot

require('dotenv').config();

// Pastikan direktori persisten ada sebelum apapun diload
const { ensurePersistentDirs } = require('./utils/storage');
ensurePersistentDirs();
const express = require('express');
const cron = require('node-cron');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./database/schema');
const { AdminDB } = require('./database/queries');
const { createBot } = require('./bot/index');
const { createWebhookRouter } = require('./payment/webhook');
const { autoCheckExpiredOrders } = require('./services/verification');

// =============================================
// ASCII BANNER
// =============================================
const banner = `
╔══════════════════════════════════════════════╗
║   Business Verification Telegram Bot v1.0   ║
║   Production Ready | NodeJS + SQLite        ║
╚══════════════════════════════════════════════╝
`;

console.log('\x1b[35m' + banner + '\x1b[0m');

// =============================================
// INITIALIZE DATABASE
// =============================================
logger.info('Starting bot...');
initializeDatabase();

// Setup Super Admin in database
const superAdminId = process.env.SUPER_ADMIN_ID;
if (superAdminId && !AdminDB.findById(superAdminId)) {
  AdminDB.add(superAdminId, process.env.SUPER_ADMIN_USERNAME, 'Super Admin', 'super_admin', 'system');
  logger.info(`Super Admin configured: ${superAdminId}`);
}

// =============================================
// CREATE BOT
// =============================================
const bot = createBot();

// =============================================
// EXPRESS SERVER FOR WEBHOOKS
// =============================================
const app = express();
// Railway inject PORT otomatis
const PORT = parseInt(process.env.PORT || process.env.BOT_PORT || 3000);

// Webhook routes
const webhookRouter = createWebhookRouter(bot);
app.use('/webhook', webhookRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    bot: bot.botInfo?.username || 'connecting...',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// =============================================
// CRON JOBS
// =============================================

// Check expired orders every minute
cron.schedule('* * * * *', async () => {
  await autoCheckExpiredOrders(bot);
});

// Daily statistics at midnight
cron.schedule('0 0 * * *', () => {
  logger.info('Running daily statistics update...');
  const { StatsDB } = require('./database/queries');
  const stats = StatsDB.getSummary();
  logger.info(`Daily stats: ${JSON.stringify(stats)}`);
});

// =============================================
// START BOT
// =============================================
const startBot = async () => {
  try {
    const useWebhook = process.env.NODE_ENV === 'production' && process.env.WEBHOOK_DOMAIN;

    if (useWebhook) {
      // Production: Use Webhook
      const webhookPath = `/bot${process.env.BOT_TOKEN}`;
      const webhookUrl = `${process.env.WEBHOOK_DOMAIN}${webhookPath}`;
      
      // Set bot webhook handler
      app.use(bot.webhookCallback(webhookPath));
      
      // Start express server
      app.listen(PORT, async () => {
        logger.info(`Webhook server running on port ${PORT}`);
        
        // Register webhook with Telegram
        await bot.telegram.setWebhook(webhookUrl);
        logger.info(`Webhook set to: ${webhookUrl}`);
        
        const botInfo = await bot.telegram.getMe();
        logger.info(`Bot @${botInfo.username} is running in WEBHOOK mode ✅`);
        
        // Notify super admin
        if (superAdminId) {
          try {
            await bot.telegram.sendMessage(
              superAdminId,
              `🚀 *Bot Started!*\n\nMode: Webhook\nServer: ${process.env.WEBHOOK_DOMAIN}\n⏰ ${new Date().toLocaleString('id-ID')}`,
              { parse_mode: 'Markdown' }
            );
          } catch (e) {}
        }
      });
    } else {
      // Development: Use Long Polling
      app.listen(PORT, () => {
        logger.info(`HTTP server running on port ${PORT}`);
      });
      
      await bot.launch();
      
      const botInfo = await bot.telegram.getMe();
      logger.info(`Bot @${botInfo.username} is running in POLLING mode ✅`);
      
      // Notify super admin
      if (superAdminId) {
        try {
          await bot.telegram.sendMessage(
            superAdminId,
            `🚀 *Bot Started!*\n\nMode: Long Polling\n⏰ ${new Date().toLocaleString('id-ID')}`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }
    }
  } catch (err) {
    logger.error(`Failed to start bot: ${err.message}`);
    process.exit(1);
  }
};

// Graceful shutdown
process.once('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  bot.stop('SIGTERM');
  process.exit(0);
});

// Unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

startBot();
