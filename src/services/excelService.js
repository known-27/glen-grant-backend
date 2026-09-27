'use strict';

const ExcelJS = require('exceljs');
const { downloadImageBuffer } = require('./cloudinaryService');

/**
 * Excel export service.
 *
 * Generates a professionally formatted .xlsx file with embedded signature images.
 * Signatures are downloaded from Cloudinary and embedded as actual images
 * (not URLs) into each submission row.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS = [
  { header: 'S.No',             key: 'sno',             width: 8  },
  { header: 'Submission ID',    key: 'submissionId',    width: 38 },
  { header: 'Name',             key: 'name',            width: 28 },
  { header: 'Outlet Name',      key: 'outletName',      width: 32 },
  { header: 'Instagram Handle', key: 'instagramHandle', width: 26 },
  { header: 'Testimonial',      key: 'testimonial',     width: 60 },
  { header: 'Date',             key: 'submissionDate',  width: 14 },
  { header: 'Time',             key: 'submissionTime',  width: 12 },
  { header: 'Device ID',        key: 'deviceId',        width: 32 },
  { header: 'Signature',        key: 'signature',       width: 28 },
];

// Row height (in points) when a signature image is embedded
const SIGNATURE_ROW_HEIGHT = 80;
const SIGNATURE_IMG_HEIGHT = 70; // px
const SIGNATURE_IMG_WIDTH = 200; // px

// Header row styling
const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A1A2E' }, // dark navy
};
const HEADER_FONT = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};
const HEADER_ALIGNMENT = {
  vertical: 'middle',
  horizontal: 'center',
  wrapText: true,
};

const CELL_ALIGNMENT = {
  vertical: 'middle',
  horizontal: 'left',
  wrapText: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a fully formatted Excel workbook for all submissions.
 *
 * @param {Array} submissions - Mongoose Submission documents
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function generateExcelWorkbook(submissions) {
  const workbook = new ExcelJS.Workbook();

  // Workbook metadata
  workbook.creator = 'Glen Grant — Bartender Notes';
  workbook.lastModifiedBy = 'Glen Grant Backend';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = 'Glen Grant Bartender Testimonials';
  workbook.description = 'Exported registration data from the Glen Grant Bartender Notes app.';

  const sheet = workbook.addWorksheet('Bartender Testimonials', {
    views: [{ state: 'frozen', ySplit: 1 }], // Freeze header row
    properties: { defaultRowHeight: 20 },
  });

  // Set columns
  sheet.columns = COLUMNS;

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF16213E' } },
    };
  });

  // Enable auto filter on header row
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  // ── Add data rows ────────────────────────────────────────────────────────

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    const rowIndex = i + 2; // +2 because row 1 is header

    const row = sheet.addRow({
      sno: i + 1,
      submissionId: sub.submissionId,
      name: sub.name,
      outletName: sub.outletName,
      instagramHandle: sub.instagramHandle ? `@${sub.instagramHandle}` : '',
      testimonial: sub.testimonial,
      submissionDate: sub.submissionDate || '',
      submissionTime: sub.submissionTime || '',
      deviceId: sub.deviceId,
      signature: '', // placeholder — image embedded below
    });

    // Alternate row shading
    const rowFill = i % 2 === 0
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8FF' } }
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    row.eachCell((cell, colNumber) => {
      cell.alignment = CELL_ALIGNMENT;
      if (colNumber !== COLUMNS.findIndex(c => c.key === 'signature') + 1) {
        cell.fill = rowFill;
      }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });

    row.height = SIGNATURE_ROW_HEIGHT;

    // ── Embed signature image ────────────────────────────────────────────────
    if (sub.signatureUrl) {
      try {
        const imgBuffer = await downloadImageBuffer(sub.signatureUrl);

        const imageId = workbook.addImage({
          buffer: imgBuffer,
          extension: 'png',
        });

        // Column index for 'signature' (0-indexed within the columns array)
        const sigColIndex = COLUMNS.findIndex(c => c.key === 'signature');

        sheet.addImage(imageId, {
          tl: { col: sigColIndex + 0.1, row: rowIndex - 1 + 0.1 },
          br: { col: sigColIndex + 1 - 0.1, row: rowIndex - 0.1 },
          editAs: 'oneCell',
        });
      } catch (err) {
        // If image download fails, write the URL as fallback text
        console.warn(`[Excel] Could not embed signature for ${sub.submissionId}: ${err.message}`);
        const sigColIndex = COLUMNS.findIndex(c => c.key === 'signature') + 1;
        const cell = sheet.getCell(rowIndex, sigColIndex);
        cell.value = sub.signatureUrl;
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    }
  }

  // ── Summary sheet ────────────────────────────────────────────────────────

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { key: 'label', width: 30 },
    { key: 'value', width: 40 },
  ];

  const summaryData = [
    ['Report Generated', new Date().toISOString()],
    ['Total Submissions', submissions.length],
    ['Event ID', submissions[0]?.eventId || 'N/A'],
    ['Generated By', 'Glen Grant — Bartender Notes Backend'],
  ];

  const summaryHeaderRow = summarySheet.addRow(['Field', 'Value']);
  summaryHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  summaryData.forEach(([label, value]) => {
    const r = summarySheet.addRow({ label, value });
    r.getCell(1).font = { bold: true };
  });

  return workbook;
}

/**
 * Writes the workbook to a Buffer (for streaming to the HTTP response).
 *
 * @param {ExcelJS.Workbook} workbook
 * @returns {Promise<Buffer>}
 */
async function workbookToBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelWorkbook, workbookToBuffer };
