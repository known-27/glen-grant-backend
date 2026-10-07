'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin, requireAdminApi } = require('../middleware/auth');
const {
  showLoginPage,
  processLogin,
  processLogout,
  showDashboard,
  showSubmissionsPage,
  getStats,
  listSubmissions,
  getSubmissionDetail,
} = require('../controllers/adminController');
const { exportExcel, exportBackup } = require('../controllers/exportController');

// ── Authentication ────────────────────────────────────────────────────────────

// GET  /admin/login  — Show login form
router.get('/login', showLoginPage);

// POST /admin/login  — Process login form (form body: username, password)
router.post('/login', processLogin);

// POST /admin/logout — Destroy session and redirect to login
router.post('/logout', processLogout);

// ── Protected HTML pages ──────────────────────────────────────────────────────

// GET /admin          — Dashboard overview
router.get('/', requireAdmin, showDashboard);

// GET /admin/submissions — Submissions list view
router.get('/submissions', requireAdmin, showSubmissionsPage);

// ── Protected JSON API (used by dashboard JavaScript) ────────────────────────

// GET /admin/api/stats
router.get('/api/stats', requireAdminApi, getStats);

// GET /admin/api/submissions
router.get('/api/submissions', requireAdminApi, listSubmissions);

// GET /admin/api/submissions/:submissionId
router.get('/api/submissions/:submissionId', requireAdminApi, getSubmissionDetail);

// ── Session-safe Export routes (used by dashboard download buttons) ───────────
// These use requireAdmin (HTML session guard) so the download works correctly
// even when the /api/export routes have cookie issues in production.

// GET /admin/export/excel  — Download .xlsx
router.get('/export/excel',  requireAdmin, exportExcel);

// GET /admin/export/backup — Download .zip backup
router.get('/export/backup', requireAdmin, exportBackup);

module.exports = router;
