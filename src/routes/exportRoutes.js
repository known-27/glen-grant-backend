'use strict';

const express = require('express');
const router = express.Router();
const { requireAdminApi } = require('../middleware/auth');
const { exportExcel, exportBackup } = require('../controllers/exportController');

/**
 * All export routes require admin authentication.
 *
 * GET /api/export/excel   — Download .xlsx with embedded signatures
 * GET /api/export/backup  — Download .zip with Excel + CSV + signature PNGs
 *
 * Optional query param: ?eventId=EVENT_ID to filter by event
 */
router.get('/excel',  requireAdminApi, exportExcel);
router.get('/backup', requireAdminApi, exportBackup);

module.exports = router;
