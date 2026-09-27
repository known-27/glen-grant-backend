'use strict';

const express = require('express');
const router = express.Router();

const { uploadSignature } = require('../middleware/upload');
const { validateSubmission } = require('../middleware/validation');
const { createSubmission, getSubmission } = require('../controllers/submissionController');

/**
 * POST /api/submissions
 *
 * Create a new bartender submission.
 * Expects multipart/form-data with a 'signature' image file.
 */
router.post(
  '/',
  uploadSignature,       // 1. Parse multipart + validate file type/size
  validateSubmission,    // 2. Validate all text fields
  createSubmission       // 3. Upload to Cloudinary, save to MongoDB
);

/**
 * GET /api/submissions/:submissionId
 *
 * Retrieve a single submission by server-generated submissionId.
 */
router.get('/:submissionId', getSubmission);

module.exports = router;
