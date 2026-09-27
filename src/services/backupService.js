'use strict';

const archiver = require('archiver');
const { generateExcelWorkbook, workbookToBuffer } = require('./excelService');
const { downloadImageBuffer } = require('./cloudinaryService');
const { Readable, PassThrough } = require('stream');

/**
 * Backup service.
 *
 * Generates a ZIP archive containing:
 *   - GLEN_GRANT_BARTENDER_TESTIMONIALS.xlsx  (with embedded signatures)
 *   - registrations.csv
 *   - signatures/001.png, 002.png, …
 *
 * The ZIP is generated dynamically and streamed to the HTTP response.
 * Nothing is written permanently to the Render filesystem.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CSV builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escapes a single CSV field value.
 * @param {*} value
 * @returns {string}
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts submission array to CSV string.
 * @param {Array} submissions
 * @returns {string}
 */
function buildCsv(submissions) {
  const headers = [
    'S.No',
    'Submission ID',
    'Name',
    'Outlet Name',
    'Instagram Handle',
    'Testimonial',
    'Date',
    'Time',
    'Device ID',
    'Event ID',
    'Signature URL',
    'Cloudinary Public ID',
    'Created At',
    'Synced At',
    'Sync Status',
  ];

  const rows = submissions.map((sub, idx) => [
    idx + 1,
    sub.submissionId,
    sub.name,
    sub.outletName,
    sub.instagramHandle ? `@${sub.instagramHandle}` : '',
    sub.testimonial,
    sub.submissionDate || '',
    sub.submissionTime || '',
    sub.deviceId,
    sub.eventId,
    sub.signatureUrl || '',
    sub.cloudinaryPublicId || '',
    sub.createdAt ? sub.createdAt.toISOString() : '',
    sub.syncedAt ? sub.syncedAt.toISOString() : '',
    sub.syncStatus || '',
  ]);

  const lines = [headers, ...rows].map(row => row.map(escapeCsv).join(','));
  return lines.join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main backup generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Streams a complete ZIP backup to the provided writable stream (HTTP response).
 *
 * The archive is built in memory using archiver's streaming ZIP. No temp files.
 *
 * @param {Array}    submissions - Mongoose documents
 * @param {import('stream').Writable} outputStream - HTTP response object
 * @returns {Promise<void>}
 */
async function streamBackupZip(submissions, outputStream) {
  return new Promise(async (resolve, reject) => {
    // Create archiver instance
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Balanced compression
    });

    archive.on('error', (err) => {
      console.error('[Backup] Archiver error:', err.message);
      reject(err);
    });

    archive.on('end', () => {
      console.log(`[Backup] ZIP archive finalized. Bytes written: ${archive.pointer()}`);
      resolve();
    });

    // Pipe archive data to output stream
    archive.pipe(outputStream);

    // ── 1. Excel file ─────────────────────────────────────────────────────

    try {
      console.log('[Backup] Generating Excel workbook…');
      const workbook = await generateExcelWorkbook(submissions);
      const xlsxBuffer = await workbookToBuffer(workbook);
      archive.append(xlsxBuffer, { name: 'GLEN_GRANT_BARTENDER_TESTIMONIALS.xlsx' });
    } catch (err) {
      console.error('[Backup] Excel generation failed:', err.message);
      // Continue backup without Excel rather than failing entirely
      const errNote = Buffer.from(`Excel generation failed: ${err.message}`);
      archive.append(errNote, { name: 'EXCEL_GENERATION_ERROR.txt' });
    }

    // ── 2. CSV file ───────────────────────────────────────────────────────

    const csvContent = buildCsv(submissions);
    archive.append(Buffer.from(csvContent, 'utf8'), { name: 'registrations.csv' });

    // ── 3. Signature images ───────────────────────────────────────────────

    for (let i = 0; i < submissions.length; i++) {
      const sub = submissions[i];
      if (!sub.signatureUrl) continue;

      const filename = `signatures/${String(i + 1).padStart(3, '0')}_${sub.submissionId}.png`;

      try {
        const imgBuffer = await downloadImageBuffer(sub.signatureUrl);
        archive.append(imgBuffer, { name: filename });
      } catch (err) {
        console.warn(`[Backup] Could not download signature for ${sub.submissionId}: ${err.message}`);
        // Add a placeholder text file so the slot is visible in the archive
        archive.append(
          Buffer.from(`Signature download failed: ${err.message}\nURL: ${sub.signatureUrl}`),
          { name: `signatures/${String(i + 1).padStart(3, '0')}_${sub.submissionId}_ERROR.txt` }
        );
      }
    }

    // ── 4. Manifest ───────────────────────────────────────────────────────

    const manifest = {
      generatedAt: new Date().toISOString(),
      totalSubmissions: submissions.length,
      eventId: submissions[0]?.eventId || 'N/A',
      files: [
        'GLEN_GRANT_BARTENDER_TESTIMONIALS.xlsx',
        'registrations.csv',
        `signatures/ (${submissions.filter(s => s.signatureUrl).length} files)`,
      ],
      note: 'Generated by Glen Grant — Bartender Notes backend.',
    };
    archive.append(
      Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      { name: 'manifest.json' }
    );

    // Finalize the archive
    await archive.finalize();
  });
}

module.exports = { streamBackupZip };
