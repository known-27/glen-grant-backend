'use strict';

const express = require('express');
const router = express.Router();
const { getCount } = require('../controllers/countController');

/**
 * GET /api/count
 * GET /api/count?eventId=EVENT_ID
 *
 * Returns today's and overall submission counts.
 * Counts are based on the configured event timezone (EVENT_TIMEZONE env var).
 */
router.get('/', getCount);

module.exports = router;
