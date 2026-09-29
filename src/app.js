'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const { getConnectionState } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');

// ── Route imports ─────────────────────────────────────────────────────────────
const submissionRoutes = require('./routes/submissionRoutes');
const syncRoutes       = require('./routes/syncRoutes');
const countRoutes      = require('./routes/countRoutes');
const exportRoutes     = require('./routes/exportRoutes');
const adminRoutes      = require('./routes/adminRoutes');

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// Security middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  helmet({
    // Allow inline scripts for the admin dashboard
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['*'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. Android app, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: Origin "${origin}" is not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Body parsers
// ─────────────────────────────────────────────────────────────────────────────

// JSON parser with increased limit (base64 images in sync requests can be large)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 16) {
  console.warn('[App] WARNING: SESSION_SECRET is not set or too short. Using an insecure fallback. Set SESSION_SECRET in production.');
}

app.use(
  session({
    secret: sessionSecret || 'glen-grant-insecure-dev-secret',
    resave: false,
    saveUninitialized: false,
    store: process.env.MONGODB_URI
      ? MongoStore.create({
          mongoUrl: process.env.MONGODB_URI,
          collectionName: 'sessions',
          ttl: 24 * 60 * 60, // 24 hours
          autoRemove: 'native',
        })
      : undefined, // Falls back to MemoryStore in development without MongoDB
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
    },
    name: 'gg.sid', // Custom session cookie name
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Static files (admin dashboard CSS/JS)
// ─────────────────────────────────────────────────────────────────────────────

app.use('/public', express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// /api/ping — public, ZERO DB queries, for Render keep-alive cron
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/ping', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'glen-grant-backend',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/health — lightweight MongoDB connectivity check
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const dbState = getConnectionState();
  res.status(200).json({
    success: true,
    status: 'healthy',
    database: dbState,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// /health alias (no /api prefix — common convention for platform health probes)
app.get('/health', (req, res) => res.redirect('/api/health'));

// ─────────────────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/submissions', submissionRoutes);
app.use('/api/sync',        syncRoutes);
app.use('/api/count',       countRoutes);
app.use('/api/export',      exportRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// Admin Web Interface
// ─────────────────────────────────────────────────────────────────────────────

app.use('/admin', adminRoutes);

// Redirect root to admin dashboard
app.get('/', (req, res) => res.redirect('/admin'));

// ─────────────────────────────────────────────────────────────────────────────
// 404 handler for unmatched routes
// ─────────────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  // Return JSON for API routes, HTML for everything else
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint "${req.method} ${req.path}" does not exist.`,
      },
    });
  }
  res.status(404).send('<h1>404 — Page Not Found</h1><p><a href="/admin">Go to Admin Dashboard</a></p>');
});

// ─────────────────────────────────────────────────────────────────────────────
// Centralized error handler (must be last)
// ─────────────────────────────────────────────────────────────────────────────

app.use(errorHandler);

module.exports = app;
