'use strict';

require('dotenv').config();

const { connectDatabase } = require('./config/database');
const { configureCloudinary } = require('./config/cloudinary');

// ─────────────────────────────────────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────────────────────────────────────

async function startServer() {
  // 1. Configure Cloudinary SDK (validates credentials exist)
  try {
    configureCloudinary();
  } catch (err) {
    console.error('[Server] Cloudinary configuration failed:', err.message);
    process.exit(1);
  }

  // 2. Connect to MongoDB Atlas
  try {
    await connectDatabase();
  } catch (err) {
    console.error('[Server] Database connection failed:', err.message);
    process.exit(1);
  }

  // 3. Start Express
  const app = require('./app');
  const PORT = parseInt(process.env.PORT, 10) || 3000;
  const HOST = '0.0.0.0'; // Required for Render deployment

  const server = app.listen(PORT, HOST, () => {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║   THE GLEN GRANT — BARTENDER NOTES    ║`);
    console.log(`║   Backend Server                       ║`);
    console.log(`╠════════════════════════════════════════╣`);
    console.log(`║  Status  : Running                     ║`);
    console.log(`║  Host    : ${HOST}                     ║`);
    console.log(`║  Port    : ${PORT}                        ║`);
    console.log(`║  Env     : ${(process.env.NODE_ENV || 'development').padEnd(10)}              ║`);
    console.log(`║  Timezone: ${(process.env.EVENT_TIMEZONE || 'Asia/Kolkata').padEnd(12)}        ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    console.log(`  Admin Dashboard : http://localhost:${PORT}/admin`);
    console.log(`  Health Check   : http://localhost:${PORT}/api/health`);
    console.log(`  API Base       : http://localhost:${PORT}/api\n`);
  });

  // ─── Graceful shutdown ─────────────────────────────────────────────────────

  const shutdown = (signal) => {
    console.log(`\n[Server] Received ${signal}. Shutting down gracefully…`);

    server.close(async () => {
      console.log('[Server] HTTP server closed.');

      try {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        console.log('[Server] MongoDB connection closed.');
      } catch (err) {
        console.error('[Server] Error closing MongoDB:', err.message);
      }

      console.log('[Server] Shutdown complete.');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 15000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Handle uncaught exceptions — log and exit so process manager can restart
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception:', err.message, err.stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled Rejection:', reason);
    process.exit(1);
  });

  return server;
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
