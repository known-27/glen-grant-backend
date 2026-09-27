'use strict';

/**
 * Validation helpers for submission fields.
 *
 * These run on the server regardless of any client-side validation.
 * NOTE: No rate limiting is implemented here or anywhere in this application.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TESTIMONIAL_WORDS = 30;

/**
 * Counts words in a string using whitespace splitting.
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Strips leading @ from an Instagram handle, normalises whitespace.
 * @param {string} handle
 * @returns {string}
 */
function normaliseInstagram(handle) {
  if (!handle) return '';
  return handle.trim().replace(/^@+/, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Field validators — each returns null (ok) or an error message string
// ─────────────────────────────────────────────────────────────────────────────

function validateName(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return 'Name is required.';
  }
  if (value.trim().length > 200) {
    return 'Name must not exceed 200 characters.';
  }
  return null;
}

function validateOutletName(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return 'Outlet name is required.';
  }
  if (value.trim().length > 300) {
    return 'Outlet name must not exceed 300 characters.';
  }
  return null;
}

function validateInstagramHandle(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return 'Instagram handle is required.';
  }
  const cleaned = normaliseInstagram(value);
  if (cleaned.length === 0) {
    return 'Instagram handle is required.';
  }
  if (cleaned.length > 100) {
    return 'Instagram handle must not exceed 100 characters.';
  }
  return null;
}

function validateTestimonial(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return 'Testimonial is required.';
  }
  const wordCount = countWords(value);
  if (wordCount === 0) {
    return 'Testimonial is required.';
  }
  if (wordCount > MAX_TESTIMONIAL_WORDS) {
    return `Testimonial must not exceed ${MAX_TESTIMONIAL_WORDS} words. You submitted ${wordCount} words.`;
  }
  return null;
}

function validateDeviceId(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return 'deviceId is required.';
  }
  return null;
}

function validateClientSubmissionId(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return 'clientSubmissionId is required.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: validate a direct POST /api/submissions request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express middleware that validates a submission request.
 * Attaches a normalized `req.submissionData` object on success.
 */
function validateSubmission(req, res, next) {
  const errors = [];

  const {
    name,
    outletName,
    instagramHandle,
    testimonial,
    deviceId,
    clientSubmissionId,
    eventId,
    clientCreatedAt,
  } = req.body;

  // Field validations
  const nameErr = validateName(name);
  if (nameErr) errors.push({ field: 'name', message: nameErr });

  const outletErr = validateOutletName(outletName);
  if (outletErr) errors.push({ field: 'outletName', message: outletErr });

  const igErr = validateInstagramHandle(instagramHandle);
  if (igErr) errors.push({ field: 'instagramHandle', message: igErr });

  const testErr = validateTestimonial(testimonial);
  if (testErr) errors.push({ field: 'testimonial', message: testErr });

  const deviceErr = validateDeviceId(deviceId);
  if (deviceErr) errors.push({ field: 'deviceId', message: deviceErr });

  const csidErr = validateClientSubmissionId(clientSubmissionId);
  if (csidErr) errors.push({ field: 'clientSubmissionId', message: csidErr });

  // Signature file must be present
  if (!req.file) {
    errors.push({ field: 'signature', message: 'Signature image is required.' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'One or more fields failed validation.',
        fields: errors,
      },
    });
  }

  // Attach normalized data
  req.submissionData = {
    name: name.trim(),
    outletName: outletName.trim(),
    instagramHandle: normaliseInstagram(instagramHandle),
    testimonial: testimonial.trim(),
    deviceId: deviceId.trim(),
    clientSubmissionId: clientSubmissionId.trim(),
    eventId: (eventId && eventId.trim()) || process.env.EVENT_ID || 'glen-grant-default',
    clientCreatedAt: clientCreatedAt ? new Date(clientCreatedAt) : new Date(),
  };

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported helpers for use in sync controller
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  validateSubmission,
  validateName,
  validateOutletName,
  validateInstagramHandle,
  validateTestimonial,
  validateDeviceId,
  validateClientSubmissionId,
  countWords,
  normaliseInstagram,
  MAX_TESTIMONIAL_WORDS,
};
