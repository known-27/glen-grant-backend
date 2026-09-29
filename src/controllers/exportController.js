'use strict';

const Submission = require('../models/Submission');
const { generateExcelWorkbook, workbookToBuffer } = require('../services/excelService');
const { streamBackupZip } = require('../services/backupService');

// ─────────────────────────────────────────────────────────────────────────────
// Filename helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/export/excel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates and streams a professionally formatted XLSX file.
 *
 * - Retrieves ALL submissions from MongoDB (sorted chronologically).
 * - Downloads each signature from Cloudinary and embeds it as a PNG image.
 *   If any individual download fails, "Signature unavailable" is written
 *   in that cell — the export is NEVER aborted due to a single image failure.
 * - Returns the buffer with correct Content-Type so the browser auto-downloads.
 *
 * Protected by requireAdminApi (session cookie must be present).
 * The dashboard calls this via window.location.href which sends the session
 * cookie automatically (same-origin navigation).
 */
async function exportExcel(req, res, next) {
  try {
    const { eventId } = req.query;
    const filter = eventId ? { eventId: eventId.trim() } : {};

    console.log('[Export] Fetching submissions for Excel export…');
    const submissions = await Submission.find(filter)
      .sort({ createdAt: 1 })
      .lean();

    console.log(`[Export] Generating Excel for ${submissions.length} submissions…`);

    // Generate even for empty datasets (returns a valid workbook with just the header)
    const workbook = await generateExcelWorkbook(submissions);
    const buffer   = await workbookToBuffer(workbook);

    const filename = `GlenGrant_Registrations_${todayString()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    console.log(`[Export] Streaming ${filename} (${buffer.length} bytes, ${submissions.length} rows).`);
    return res.end(buffer);
  } catch (err) {
    console.error('[Export] Excel generation failed:', err.message);
    // If headers not yet sent, return a JSON error the dashboard can display
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: {
          code:    'EXPORT_FAILED',
          message: 'Unable to generate Excel export. Please try again.',
        },
      });
    }
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/export/backup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates and streams a ZIP backup archive containing:
 *   GlenGrant_Backup/
 *   ├── GlenGrant_Registrations.xlsx    (with embedded signatures)
 *   ├── registrations.csv               (full CSV)
 *   ├── signatures/
 *   │   ├── 001_<id>.png
 *   │   └── ...
 *   └── manifest.json
 *
 * The archive is generated dynamically — nothing is written to the Render filesystem.
 */
async function exportBackup(req, res, next) {
  try {
    const { eventId } = req.query;
    const filter = eventId ? { eventId: eventId.trim() } : {};

    console.log('[Backup] Fetching submissions for ZIP backup…');
    const submissions = await Submission.find(filter)
      .sort({ createdAt: 1 })
      .lean();

    const filename = `GlenGrant_Backup_${todayString()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Transfer-Encoding: chunked is implied for streaming (no Content-Length)

    console.log(`[Backup] Streaming ${filename} for ${submissions.length} submissions…`);
    await streamBackupZip(submissions, res);

    console.log('[Backup] ZIP stream complete.');
  } catch (err) {
    console.error('[Backup] ZIP generation error:', err.message);
    if (res.headersSent) {
      // Can't send JSON after streaming started — just close the connection
      res.end();
    } else {
      return res.status(500).json({
        success: false,
        error: {
          code:    'BACKUP_FAILED',
          message: 'Unable to generate backup archive. Please try again.',
        },
      });
    }
  }
}

module.exports = { exportExcel, exportBackup };
