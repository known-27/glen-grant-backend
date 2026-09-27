'use strict';

const { v4: uuidv4 } = require('uuid');
const Submission = require('../models/Submission');
const { uploadSignature } = require('../services/cloudinaryService');
const { validateImageMagicBytes } = require('../middleware/upload');
const { getTimezoneDate } = require('../utils/timezone');

/**
 * POST /api/submissions
 *
 * Receives a new submission from an Android device.
 * Validates the signature, uploads it to Cloudinary,
 * then stores the full record in MongoDB.
 *
 * Uses clientSubmissionId as an idempotency key —
 * if the same submission is sent twice, the existing record is returned.
 */
async function createSubmission(req, res, next) {
  try {
    const {
      name,
      outletName,
      instagramHandle,
      testimonial,
      deviceId,
      clientSubmissionId,
      eventId,
      clientCreatedAt,
    } = req.submissionData; // set by validateSubmission middleware

    // ── Idempotency check ─────────────────────────────────────────────────
    const existing = await Submission.findOne({ clientSubmissionId });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Submission already exists.',
        status: 'already_submitted',
        submissionId: existing.submissionId,
        submission: existing.toJSON(),
      });
    }

    // ── Validate signature buffer magic bytes ─────────────────────────────
    if (!validateImageMagicBytes(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_IMAGE_CONTENT',
          message: 'The uploaded file does not appear to be a valid image.',
        },
      });
    }

    // ── Generate server-side submission ID ────────────────────────────────
    const submissionId = uuidv4();

    // ── Upload signature to Cloudinary ────────────────────────────────────
    const { signatureUrl, cloudinaryPublicId } = await uploadSignature(
      req.file.buffer,
      eventId,
      submissionId,
      req.file.mimetype
    );

    // ── Compute event-timezone date/time strings ───────────────────────────
    const now = new Date();
    const { dateStr, timeStr } = getTimezoneDate(now);

    // ── Save to MongoDB ───────────────────────────────────────────────────
    const submission = await Submission.create({
      submissionId,
      clientSubmissionId,
      deviceId,
      eventId,
      name,
      outletName,
      instagramHandle,
      testimonial,
      signatureUrl,
      cloudinaryPublicId,
      clientCreatedAt: clientCreatedAt || now,
      submissionDate: dateStr,
      submissionTime: timeStr,
      syncStatus: 'direct',
      syncedAt: null,
      isSyncedSubmission: false,
    });

    console.log(`[Submission] Created: ${submissionId} | Device: ${deviceId} | Event: ${eventId}`);

    return res.status(201).json({
      success: true,
      message: 'Submission created successfully.',
      submissionId: submission.submissionId,
      submission: submission.toJSON(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/submissions/:submissionId
 *
 * Returns a single submission by its server-generated submissionId.
 */
async function getSubmission(req, res, next) {
  try {
    const { submissionId } = req.params;

    if (!submissionId || !submissionId.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'submissionId is required.' },
      });
    }

    const submission = await Submission.findOne({ submissionId: submissionId.trim() });

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Submission "${submissionId}" not found.` },
      });
    }

    return res.status(200).json({
      success: true,
      submission: submission.toJSON(),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createSubmission, getSubmission };
