'use strict';

const multer = require('multer');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Allowed MIME types for signature images
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

// Maximum file size: 5 MB
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Multer configuration — memory storage (files go to Cloudinary, not disk)
// ─────────────────────────────────────────────────────────────────────────────
const storage = multer.memoryStorage();

/**
 * File filter: reject non-image uploads immediately.
 */
function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Invalid file type "${file.mimetype}". Only PNG, JPEG, and WebP images are accepted.`
    );
    err.statusCode = 400;
    err.code = 'INVALID_FILE_TYPE';
    cb(err, false);
  }
}

/**
 * Multer upload instance configured for a single signature field.
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

/**
 * Middleware: accept a single file in the 'signature' field.
 *
 * Converts Multer-specific errors into application errors with consistent
 * status codes so that the global error handler formats them correctly.
 */
function uploadSignature(req, res, next) {
  const handler = upload.single('signature');

  handler(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      let message = err.message;
      let code = 'UPLOAD_ERROR';

      if (err.code === 'LIMIT_FILE_SIZE') {
        message = `Signature image must not exceed ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`;
        code = 'FILE_TOO_LARGE';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message = 'Unexpected file field. Only "signature" is accepted.';
        code = 'UNEXPECTED_FILE_FIELD';
      }

      const error = new Error(message);
      error.statusCode = 400;
      error.code = code;
      return next(error);
    }

    // Pass through our custom file-filter errors and anything else
    return next(err);
  });
}

/**
 * Validates that the uploaded file buffer starts with the correct magic bytes.
 * This prevents content-type spoofing (e.g., uploading a script with .png extension).
 *
 * @param {Buffer} buffer - File buffer from Multer memory storage
 * @returns {boolean}
 */
function validateImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return false;

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }

  // JPEG/JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // WebP: 52 49 46 46 (RIFF header)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    return true;
  }

  return false;
}

module.exports = { uploadSignature, validateImageMagicBytes };
