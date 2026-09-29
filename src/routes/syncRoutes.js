'use strict';

const express = require('express');
const router = express.Router();
const { syncSubmissions, getSyncStatus } = require('../controllers/syncController');

/**
 * POST /api/sync
 * POST /api/sync/submissions
 * POST /api/sync/submissions/batch
 *
 * All three paths call the same batch-sync handler.
 * The Android app can use any of these; all are equivalent.
 *
 * Body: { "submissions": [ ...records with signatureBase64 fields ] }
 *
 * Note: Accepts JSON (not multipart) because signature images are
 * sent as base64 strings. Most practical approach for batch sync.
 */
router.post('/',                  syncSubmissions);
router.post('/submissions',       syncSubmissions);
router.post('/submissions/batch', syncSubmissions);

/**
 * GET /api/sync/status
 *
 * Returns overall sync statistics — used by Android Count screen.
 */
router.get('/status', getSyncStatus);

module.exports = router;
