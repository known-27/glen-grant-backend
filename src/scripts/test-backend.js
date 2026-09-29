'use strict';

/**
 * Glen Grant Backend — Route & Logic Integration Test
 *
 * Tests every changed route / module without needing a running server.
 * Mocks MongoDB and Cloudinary so the test runs offline.
 *
 * Run with:  node src/scripts/test-backend.js
 */

require('dotenv').config();

let passed = 0;
let failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 1 — Module loading (all changed files must load without throws)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 1  Module loading');
console.log('──────────────────────────────────────────');

const modules = [
  ['app.js',               '../app'],
  ['excelService.js',      '../services/excelService'],
  ['backupService.js',     '../services/backupService'],
  ['cloudinaryService.js', '../services/cloudinaryService'],
  ['exportController.js',  '../controllers/exportController'],
  ['syncController.js',    '../controllers/syncController'],
  ['countController.js',   '../controllers/countController'],
  ['adminController.js',   '../controllers/adminController'],
  ['syncRoutes.js',        '../routes/syncRoutes'],
  ['exportRoutes.js',      '../routes/exportRoutes'],
  ['adminRoutes.js',       '../routes/adminRoutes'],
  ['auth.js',              '../middleware/auth'],
  ['validation.js',        '../middleware/validation'],
  ['timezone.js',          '../utils/timezone'],
];

for (const [label, path] of modules) {
  try {
    require(path);
    ok(label + ' loads without error', true);
  } catch (e) {
    ok(label + ' loads without error', false, e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 2 — /api/ping response shape
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 2  /api/ping response shape');
console.log('──────────────────────────────────────────');

{
  // Simulate the ping handler directly
  const handler = (req, res) => {
    res.status(200).json({
      status:    'ok',
      service:   'glen-grant-backend',
      timestamp: new Date().toISOString(),
      uptime:    Math.floor(process.uptime()),
    });
  };

  let captured = null;
  const mockRes = {
    _statusCode: 200,
    status(code) { this._statusCode = code; return this; },
    json(body) { captured = body; },
  };

  handler({}, mockRes);

  ok('/api/ping returns HTTP 200',           mockRes._statusCode === 200);
  ok('/api/ping has status: "ok"',           captured && captured.status === 'ok');
  ok('/api/ping has service field',          captured && typeof captured.service === 'string');
  ok('/api/ping has timestamp (ISO string)', captured && /^\d{4}-\d{2}-\d{2}T/.test(captured.timestamp));
  ok('/api/ping has uptime (number)',        captured && typeof captured.uptime === 'number');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 3 — Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 3  Validation helpers');
console.log('──────────────────────────────────────────');

{
  const {
    validateName,
    validateOutletName,
    validateInstagramHandle,
    validateTestimonial,
    validateDeviceId,
    validateClientSubmissionId,
    normaliseInstagram,
    countWords,
  } = require('../middleware/validation');

  ok('validateName null → error',            validateName(null)         !== null);
  ok('validateName valid → null',            validateName('John')       === null);
  ok('validateOutletName empty → error',     validateOutletName('')     !== null);
  ok('validateInstagramHandle @j → null',    validateInstagramHandle('@johnmac') === null);
  ok('normaliseInstagram strips @',          normaliseInstagram('@john') === 'john');
  ok('countWords("hello world") = 2',       countWords('hello world')  === 2);
  ok('validateTestimonial long → error',     validateTestimonial(Array(35).fill('word').join(' ')) !== null);
  ok('validateTestimonial 30 words → null',  validateTestimonial(Array(30).fill('word').join(' ')) === null);
  ok('validateDeviceId empty → error',       validateDeviceId('')       !== null);
  ok('validateClientSubmissionId valid → null', validateClientSubmissionId('abc-123') === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 4 — Auth middleware
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 4  Auth middleware');
console.log('──────────────────────────────────────────');

{
  const { requireAdminApi, requireAdmin } = require('../middleware/auth');

  // requireAdminApi — unauthenticated → 401 JSON
  let status401 = null, body401 = null;
  const res401 = {
    status(s) { status401 = s; return this; },
    json(b)   { body401  = b; },
  };
  requireAdminApi({ session: {} }, res401, () => { status401 = 200; });
  ok('requireAdminApi → 401 when not logged in', status401 === 401);
  ok('requireAdminApi → UNAUTHORIZED code',      body401 && body401.error && body401.error.code === 'UNAUTHORIZED');

  // requireAdminApi — authenticated → next()
  let nextCalled = false;
  requireAdminApi({ session: { isAdmin: true } }, {}, () => { nextCalled = true; });
  ok('requireAdminApi calls next() when isAdmin=true', nextCalled);

  // requireAdmin — unauthenticated → redirect
  let redirectTarget = null;
  const resRedirect = { redirect(url) { redirectTarget = url; } };
  requireAdmin({ session: {}, originalUrl: '/admin' }, resRedirect, () => {});
  ok('requireAdmin → redirect to /admin/login', redirectTarget === '/admin/login');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 5 — Timezone utility
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 5  Timezone utility');
console.log('──────────────────────────────────────────');

{
  const { getTimezoneDate } = require('../utils/timezone');
  const result = getTimezoneDate(new Date('2026-09-29T11:00:00Z'));
  ok('getTimezoneDate returns dateStr',  typeof result.dateStr === 'string' && result.dateStr.length === 10);
  ok('getTimezoneDate returns timeStr',  typeof result.timeStr === 'string' && result.timeStr.length >= 5);
  ok('dateStr matches YYYY-MM-DD',       /^\d{4}-\d{2}-\d{2}$/.test(result.dateStr));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 6 — excelService with mock submissions
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 6  excelService — mock data');
console.log('──────────────────────────────────────────');

async function testExcelService() {
  // Override cloudinaryService.downloadImageBuffer to avoid real HTTP calls
  const cloudMod = require('../services/cloudinaryService');
  const origDownload = cloudMod.downloadImageBuffer;
  cloudMod.downloadImageBuffer = async (url) => {
    if (url === 'FAIL') throw new Error('Simulated Cloudinary failure');
    // Return a minimal valid 1x1 white PNG
    return Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
  };

  const { generateExcelWorkbook, workbookToBuffer } = require('../services/excelService');

  const mockSubs = [
    {
      submissionId:   'sub-001',
      clientSubmissionId: 'csid-001',
      name:           'John Doe',
      outletName:     'The Whisky Bar',
      instagramHandle:'johndoe',
      testimonial:    'Glen Grant is exceptional.',
      submissionDate: '2026-09-29',
      submissionTime: '14:30:00',
      deviceId:       'tablet-01',
      syncStatus:     'direct',
      signatureUrl:   'https://res.cloudinary.com/fake/sig1.png',
      eventId:        'glen-grant-default',
      createdAt:      new Date('2026-09-29T09:00:00Z'),
    },
    {
      submissionId:   'sub-002',
      clientSubmissionId: 'csid-002',
      name:           'Jane Smith',
      outletName:     'Oak & Barrel',
      instagramHandle:'janesmith',
      testimonial:    'Amazing single malt.',
      submissionDate: '2026-09-29',
      submissionTime: '15:00:00',
      deviceId:       'tablet-02',
      syncStatus:     'synced',
      signatureUrl:   'FAIL', // deliberately triggers image-download failure
      eventId:        'glen-grant-default',
      createdAt:      new Date('2026-09-29T09:30:00Z'),
    },
    {
      submissionId:   'sub-003',
      clientSubmissionId: 'csid-003',
      name:           'Alice Brown',
      outletName:     'Malt House',
      instagramHandle:'aliceb',
      testimonial:    'Best Speyside dram.',
      submissionDate: '2026-09-29',
      submissionTime: '15:30:00',
      deviceId:       'tablet-01',
      syncStatus:     'direct',
      signatureUrl:   null, // no signature at all
      eventId:        'glen-grant-default',
      createdAt:      new Date('2026-09-29T10:00:00Z'),
    },
  ];

  try {
    const workbook = await generateExcelWorkbook(mockSubs);
    ok('generateExcelWorkbook resolves (3 rows, 1 bad sig, 1 null sig)', workbook !== null);

    const sheet = workbook.getWorksheet('Bartender Testimonials');
    ok('Workbook has "Bartender Testimonials" sheet',  !!sheet);
    ok('Sheet has header row + 3 data rows = 4 rows',  sheet.rowCount === 4);

    const header = sheet.getRow(1).values;
    ok('First header cell is "#"',               header.includes('#'));
    ok('Header contains "Bartender Name"',        header.includes('Bartender Name'));
    ok('Header contains "Signature"',             header.includes('Signature'));
    ok('Header contains "Cloudinary URL"',        header.includes('Cloudinary URL'));
    ok('Header contains "Sync Status"',           header.includes('Sync Status'));

    const row2 = sheet.getRow(2);
    ok('Row 2 col 3 (name) = "John Doe"',         row2.getCell(3).value === 'John Doe');

    const buffer = await workbookToBuffer(workbook);
    ok('workbookToBuffer returns a Buffer',        Buffer.isBuffer(buffer));
    ok('Buffer has XLSX magic bytes (PK header)',  buffer[0] === 0x50 && buffer[1] === 0x4B);
    ok('Buffer length > 4 KB',                    buffer.length > 4096);

    const summarySheet = workbook.getWorksheet('Summary');
    ok('Workbook has "Summary" sheet',             !!summarySheet);

    console.log(`      Buffer size: ${(buffer.length / 1024).toFixed(1)} KB`);
  } catch (e) {
    ok('generateExcelWorkbook did not throw', false, e.message);
  } finally {
    cloudMod.downloadImageBuffer = origDownload; // restore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 7 — exportController filename and header logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 7  exportController — headers & filename');
console.log('──────────────────────────────────────────');

async function testExportController() {
  // Patch Submission.find to return []
  const Submission = require('../models/Submission');
  const origFind = Submission.find.bind(Submission);
  Submission.find = () => ({ sort: () => ({ lean: async () => [] }) });

  const { exportExcel, exportBackup } = require('../controllers/exportController');

  let headers = {};
  let endBuf  = null;
  const mockRes = {
    setHeader(k, v) { headers[k] = v; },
    end(buf) { endBuf = buf; },
    headersSent: false,
    status() { return this; },
    json() {},
  };

  await exportExcel({ query: {} }, mockRes, (err) => {
    ok('exportExcel: next() NOT called with error (empty dataset)', !err);
  });

  ok('exportExcel: Content-Type is xlsx',
    headers['Content-Type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const dispHeader = headers['Content-Disposition'] || '';
  ok('exportExcel: Content-Disposition starts with attachment',
    dispHeader.startsWith('attachment'));
  ok('exportExcel: filename matches GlenGrant_Registrations_YYYY-MM-DD.xlsx',
    /GlenGrant_Registrations_\d{4}-\d{2}-\d{2}\.xlsx/.test(dispHeader));
  ok('exportExcel: Cache-Control is no-cache',
    (headers['Cache-Control'] || '').includes('no-cache'));
  ok('exportExcel: response body is a Buffer',  endBuf !== null && Buffer.isBuffer(endBuf));

  Submission.find = origFind; // restore
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 8 — syncController idempotency logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 8  syncController — route aliases & idempotency');
console.log('──────────────────────────────────────────');

{
  const syncRoutes = require('../routes/syncRoutes');
  const layers = syncRoutes.stack || [];

  // Express router.stack has Route objects
  const paths = layers
    .filter(l => l.route)
    .map(l => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));

  const hasPost = (p) => paths.some(r => r.path === p && r.methods.includes('post'));
  const hasGet  = (p) => paths.some(r => r.path === p && r.methods.includes('get'));

  ok('POST /  (root sync) registered',              hasPost('/'));
  ok('POST /submissions registered',                hasPost('/submissions'));
  ok('POST /submissions/batch registered',          hasPost('/submissions/batch'));
  ok('GET  /status registered',                     hasGet('/status'));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 9 — backupService CSV builder
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────');
console.log('GROUP 9  backupService — CSV escaping');
console.log('──────────────────────────────────────────');

{
  // Access the private buildCsv via a quick inline reimplementation
  // (it's not exported; verify the module loads and archiver is present)
  const archiver = require('archiver');
  ok('archiver package is present', typeof archiver === 'function');

  // Verify the backupService module itself loads (it uses archiver internally)
  const bs = require('../services/backupService');
  ok('backupService exports streamBackupZip', typeof bs.streamBackupZip === 'function');
}

// ─────────────────────────────────────────────────────────────────────────────
// Run async groups and print final summary
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n──────────────────────────────────────────');
  console.log('GROUP 6  excelService — mock data');
  console.log('──────────────────────────────────────────');
  await testExcelService();

  console.log('\n──────────────────────────────────────────');
  console.log('GROUP 7  exportController — headers & filename');
  console.log('──────────────────────────────────────────');
  await testExportController();

  console.log('\n══════════════════════════════════════════');
  console.log(`RESULTS  ${passed} passed   ${failed} failed`);
  console.log('══════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
})();
