'use strict';

const ExcelJS = require('exceljs');
const { downloadImageBuffer } = require('./cloudinaryService');

/**
 * Excel export service — Glen Grant Bartender Notes.
 *
 * Generates a professionally formatted .xlsx file with embedded signature images.
 * Signatures are downloaded from Cloudinary and embedded as actual PNG images
 * (not URLs) into each submission row.
 *
 * Resilience design:
 *   - If a single image download fails, that row gets "Signature unavailable"
 *     text instead — the export continues and all other rows are included.
 *   - Image downloads are sequential (not parallel) to avoid memory spikes on
 *     large datasets and to be polite to Cloudinary rate limits.
 *   - Each download has a generous 30-second timeout.
 *   - The workbook is serialised to a Buffer in memory — no temp files needed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Signature display dimensions
// ─────────────────────────────────────────────────────────────────────────────
// Column width 45 chars × 7px/char ≈ 315px; Row height 120pt × 1.333px/pt ≈ 160px
const SIGNATURE_COL_WIDTH  = 45;    // characters (ExcelJS column width unit)
const SIGNATURE_ROW_HEIGHT = 120;   // points
const SIGNATURE_IMG_W      = 300;   // px — fills the cell width with a small margin
const SIGNATURE_IMG_H      = 145;   // px — fills the cell height with a small margin

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS = [
  { header: '#',                key: 'sno',             width: 6  },
  { header: 'Submission ID',   key: 'submissionId',    width: 38 },
  { header: 'Bartender Name',  key: 'name',            width: 28 },
  { header: 'Outlet Name',     key: 'outletName',      width: 32 },
  { header: 'Instagram',       key: 'instagramHandle', width: 24 },
  { header: 'Testimonial',     key: 'testimonial',     width: 60 },
  { header: 'Date',            key: 'submissionDate',  width: 14 },
  { header: 'Time',            key: 'submissionTime',  width: 12 },
  { header: 'Device ID',       key: 'deviceId',        width: 30 },
  { header: 'Sync Status',     key: 'syncStatus',      width: 14 },
  { header: 'Cloudinary URL',  key: 'signatureUrl',    width: 50 },
  { header: 'Signature',       key: 'signature',       width: SIGNATURE_COL_WIDTH },
];

// Header styling
const HEADER_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2B2A' } }; // dark teal
const HEADER_FONT   = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const HEADER_ALIGN  = { vertical: 'middle', horizontal: 'center', wrapText: true };
const CELL_ALIGN    = { vertical: 'middle', horizontal: 'left',   wrapText: true };

// ─────────────────────────────────────────────────────────────────────────────
// Main generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a fully formatted Excel workbook for all submissions.
 *
 * @param {Array}   submissions - Lean Mongoose documents (from .lean())
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function generateExcelWorkbook(submissions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator       = 'Glen Grant — Bartender Notes';
  workbook.lastModifiedBy= 'Glen Grant Backend';
  workbook.created       = new Date();
  workbook.modified      = new Date();
  workbook.title         = 'Glen Grant Bartender Testimonials';
  workbook.description   = 'Exported registration data from the Glen Grant Bartender Notes app.';

  // ── Main data sheet ────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet('Bartender Testimonials', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });

  sheet.columns = COLUMNS;

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.fill      = HEADER_FILL;
    cell.font      = HEADER_FONT;
    cell.alignment = HEADER_ALIGN;
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF16213E' } } };
  });

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: COLUMNS.length },
  };

  // ── Resolve column indices (0-based) ──────────────────────────────────────
  const sigColIdx = COLUMNS.findIndex(c => c.key === 'signature');
  const urlColIdx = COLUMNS.findIndex(c => c.key === 'signatureUrl');

  // ── Data rows — sequential to keep memory bounded ─────────────────────────
  for (let i = 0; i < submissions.length; i++) {
    const sub      = submissions[i];
    const rowIndex = i + 2; // 1=header, data starts at 2

    const row = sheet.addRow({
      sno:             i + 1,
      submissionId:    sub.submissionId   || sub.clientSubmissionId || '',
      name:            sub.name           || '',
      outletName:      sub.outletName     || '',
      instagramHandle: sub.instagramHandle ? `@${sub.instagramHandle}` : '',
      testimonial:     sub.testimonial    || '',
      submissionDate:  sub.submissionDate || formatDate(sub.createdAt),
      submissionTime:  sub.submissionTime || formatTime(sub.createdAt),
      deviceId:        sub.deviceId       || '',
      syncStatus:      sub.syncStatus     || '',
      signatureUrl:    sub.signatureUrl   || '',
      signature:       '',   // placeholder — image anchored below
    });

    // Alternate row shading
    const bg = i % 2 === 0 ? 'FFF5FFFF' : 'FFFFFFFF';
    row.eachCell((cell, colNumber) => {
      cell.alignment = CELL_ALIGN;
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
      if (colNumber !== sigColIdx + 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      }
    });

    // Style Cloudinary URL column as hyperlink
    if (sub.signatureUrl) {
      const urlCell = sheet.getCell(rowIndex, urlColIdx + 1);
      urlCell.font = { color: { argb: 'FF0563C1' }, underline: true, name: 'Calibri', size: 10 };
    }

    row.height = SIGNATURE_ROW_HEIGHT;

    // ── Embed signature image (safe — failures do not abort the export) ──────
    if (sub.signatureUrl) {
      try {
        const imgBuffer = await downloadImageBuffer(sub.signatureUrl);
        const imageId   = workbook.addImage({ buffer: imgBuffer, extension: 'png' });

        // Use explicit pixel dimensions (ext) — the ONLY reliable way in ExcelJS
        // to control image size. tl/br with twoCell does not reliably stretch images.
        sheet.addImage(imageId, {
          tl:     { col: sigColIdx + 0.08, row: rowIndex - 1 + 0.08 },
          ext:    { width: SIGNATURE_IMG_W, height: SIGNATURE_IMG_H },
          editAs: 'oneCell',
        });
      } catch (imgErr) {
        // Non-fatal: log and write fallback text in the signature cell
        console.warn(`[Excel] Signature embed failed for row ${rowIndex} (${sub.submissionId || sub.clientSubmissionId}): ${imgErr.message}`);
        const cell       = sheet.getCell(rowIndex, sigColIdx + 1);
        cell.value       = 'Signature unavailable';
        cell.font        = { color: { argb: 'FFAAAAAA' }, italic: true };
        cell.alignment   = { vertical: 'middle', horizontal: 'center' };
      }
    } else {
      // No signature URL at all
      const cell     = sheet.getCell(rowIndex, sigColIdx + 1);
      cell.value     = 'No signature';
      cell.font      = { color: { argb: 'FFCCCCCC' }, italic: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { key: 'label', width: 30 },
    { key: 'value', width: 50 },
  ];

  const summaryHeaderRow = summary.addRow(['Field', 'Value']);
  summaryHeaderRow.eachCell((cell) => {
    cell.fill      = HEADER_FILL;
    cell.font      = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  [
    ['Report Generated',    new Date().toISOString()],
    ['Total Submissions',   submissions.length],
    ['Event ID',            submissions[0]?.eventId || 'N/A'],
    ['Generated By',        'Glen Grant — Bartender Notes Backend'],
  ].forEach(([label, value]) => {
    const r = summary.addRow({ label, value });
    r.getCell(1).font = { bold: true, name: 'Calibri' };
  });

  return workbook;
}

// ─────────────────────────────────────────────────────────────────────────────
// Buffer serialiser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes the workbook to a Buffer for streaming to the HTTP response.
 * @param {ExcelJS.Workbook} workbook
 * @returns {Promise<Buffer>}
 */
async function workbookToBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}

// ─────────────────────────────────────────────────────────────────────────────
// Date / time fallback helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
}

function formatTime(d) {
  if (!d) return '';
  try { return new Date(d).toISOString().slice(11, 19); } catch { return ''; }
}

module.exports = { generateExcelWorkbook, workbookToBuffer };
