'use strict';

const Submission = require('../models/Submission');
const { generateExcelWorkbook, workbookToBuffer } = require('../services/excelService');
const { streamBackupZip } = require('../services/backupService');

/**
 * GET /api/export/excel
 *
 * Generates and streams a professionally formatted XLSX file.
 * Signature images are downloaded from Cloudinary and embedded in each row.
 *
 * Optionally filter by eventId query param.
 */
async function exportExcel(req, res, next) {
  try {
    const { eventId } = req.query;
    const filter = eventId ? { eventId: eventId.trim() } : {};

    console.log('[Export] Fetching submissions for Excel export…');
    const submissions = await Submission.find(filter)
      .sort({ createdAt: 1 })
      .lean();

    if (submissions.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NO_DATA', message: 'No submissions found to export.' },
      });
    }

    console.log(`[Export] Generating Excel for ${submissions.length} submissions…`);
    const workbook = await generateExcelWorkbook(submissions);
    const buffer = await workbookToBuffer(workbook);

    const filename = 'GLEN_GRANT_BARTENDER_TESTIMONIALS.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    console.log(`[Export] Streaming Excel file (${buffer.length} bytes).`);
    return res.end(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/export/backup
 *
 * Generates and streams a ZIP backup archive containing:
 *   - Excel file with embedded signatures
 *   - CSV export
 *   - Individual PNG signature files
 *   - manifest.json
 *
 * The archive is generated dynamically. Nothing is written to the Render filesystem.
 */
async function exportBackup(req, res, next) {
  try {
    const { eventId } = req.query;
    const filter = eventId ? { eventId: eventId.trim() } : {};

    console.log('[Backup] Fetching submissions for ZIP backup…');
    const submissions = await Submission.find(filter)
      .sort({ createdAt: 1 })
      .lean();

    if (submissions.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NO_DATA', message: 'No submissions found to back up.' },
      });
    }

    const filename = 'GLEN_GRANT_EVENT_BACKUP.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Transfer-Encoding', 'chunked');

    console.log(`[Backup] Streaming ZIP for ${submissions.length} submissions…`);

    // Stream the ZIP directly to the response — no temp files
    await streamBackupZip(submissions, res);

    console.log('[Backup] ZIP stream complete.');
  } catch (err) {
    // If headers already sent, we can't send a JSON error response
    if (res.headersSent) {
      console.error('[Backup] Error after headers sent:', err.message);
      res.end();
    } else {
      next(err);
    }
  }
}

module.exports = { exportExcel, exportBackup };
