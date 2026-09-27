'use strict';

const express = require('express');
const router = express.Router();
const { syncSubmissions } = require('../controllers/syncController');

/**
 * POST /api/sync
 *
 * Synchronize a batch of offline submissions from an Android device.
 * Body: { "submissions": [ ...records with signatureBase64 fields ] }
 *
 * Note: This endpoint accepts JSON (not multipart) because signature
 * images are sent as base64 strings within the JSON array.
 * This is the most practical approach for batch sync from Android.
 */
router.post('/', syncSubmissions);

module.exports = router;
