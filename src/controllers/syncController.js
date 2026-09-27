'use strict';

const { v4: uuidv4 } = require('uuid');
const Submission = require('../models/Submission');
const { uploadSignature } = require('../services/cloudinaryService');
const { validateImageMagicBytes } = require('../middleware/upload');
const {
  validateName,
  validateOutletName,
  validateInstagramHandle,
  validateTestimonial,
  validateDeviceId,
  validateClientSubmissionId,
  normaliseInstagram,
} = require('../middleware/validation');
const { getTimezoneDate } = require('../utils/timezone');

/**
 * POST /api/sync
 *
 * Receives an array of pending submissions from an offline Android device.
 *
 * Design principles:
 * - Uses clientSubmissionId as an idempotency key (no duplicates)
 * - Processes each record independently (one failure does not abort others)
 * - Returns per-record status in the response
 * - Accepts base64-encoded signature images (since multipart is complex for arrays)
 *
 * Expected request body:
 * {
 *   "submissions": [
 *     {
 *       "clientSubmissionId": "uuid",
 *       "name": "...",
 *       "outletName": "...",
 *       "instagramHandle": "...",
 *       "testimonial": "...",
 *       "deviceId": "...",
 *       "eventId": "...",
 *       "clientCreatedAt": "ISO string",
 *       "signatureBase64": "data:image/png;base64,..." or raw base64
 *     },
 *     ...
 *   ]
 * }
 */
async function syncSubmissions(req, res, next) {
  try {
    const { submissions } = req.body;

    // Validate top-level structure
    if (!submissions || !Array.isArray(submissions)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '"submissions" must be an array.',
        },
      });
    }

    if (submissions.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No submissions to sync.',
        results: [],
        summary: { synced: 0, already_synced: 0, failed: 0, total: 0 },
      });
    }

    const results = [];
    let syncedCount = 0;
    let alreadySyncedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < submissions.length; i++) {
      const record = submissions[i];
      const { clientSubmissionId } = record;

      // ── Per-record idempotency check ─────────────────────────────────
      try {
        // Check for existing submission first
        const existing = await Submission.findOne({
          clientSubmissionId: clientSubmissionId?.trim(),
        });

        if (existing) {
          results.push({
            index: i,
            clientSubmissionId,
            status: 'already_synced',
            submissionId: existing.submissionId,
            message: 'Submission already exists in the database.',
          });
          alreadySyncedCount++;
          continue;
        }

        // ── Validate individual record fields ────────────────────────
        const fieldErrors = [];

        const nameErr = validateName(record.name);
        if (nameErr) fieldErrors.push({ field: 'name', message: nameErr });

        const outletErr = validateOutletName(record.outletName);
        if (outletErr) fieldErrors.push({ field: 'outletName', message: outletErr });

        const igErr = validateInstagramHandle(record.instagramHandle);
        if (igErr) fieldErrors.push({ field: 'instagramHandle', message: igErr });

        const testErr = validateTestimonial(record.testimonial);
        if (testErr) fieldErrors.push({ field: 'testimonial', message: testErr });

        const deviceErr = validateDeviceId(record.deviceId);
        if (deviceErr) fieldErrors.push({ field: 'deviceId', message: deviceErr });

        const csidErr = validateClientSubmissionId(record.clientSubmissionId);
        if (csidErr) fieldErrors.push({ field: 'clientSubmissionId', message: csidErr });

        if (!record.signatureBase64) {
          fieldErrors.push({ field: 'signatureBase64', message: 'Signature image is required.' });
        }

        if (fieldErrors.length > 0) {
          results.push({
            index: i,
            clientSubmissionId,
            status: 'failed',
            message: 'Validation failed.',
            errors: fieldErrors,
          });
          failedCount++;
          continue;
        }

        // ── Decode base64 signature ──────────────────────────────────
        let imageBuffer;
        try {
          // Strip optional data URL prefix: data:image/png;base64,
          const base64Data = record.signatureBase64.replace(/^data:image\/\w+;base64,/, '');
          imageBuffer = Buffer.from(base64Data, 'base64');

          if (!validateImageMagicBytes(imageBuffer)) {
            results.push({
              index: i,
              clientSubmissionId,
              status: 'failed',
              message: 'Signature image content is invalid or corrupted.',
            });
            failedCount++;
            continue;
          }
        } catch (decodeErr) {
          results.push({
            index: i,
            clientSubmissionId,
            status: 'failed',
            message: `Failed to decode signature image: ${decodeErr.message}`,
          });
          failedCount++;
          continue;
        }

        // ── Upload to Cloudinary ─────────────────────────────────────
        const submissionId = uuidv4();
        const eventId = (record.eventId && record.eventId.trim()) ||
          process.env.EVENT_ID || 'glen-grant-default';

        const { signatureUrl, cloudinaryPublicId } = await uploadSignature(
          imageBuffer,
          eventId,
          submissionId,
          'image/png'
        );

        // ── Compute timezone-aware date/time ─────────────────────────
        const clientDate = record.clientCreatedAt ? new Date(record.clientCreatedAt) : new Date();
        const { dateStr, timeStr } = getTimezoneDate(clientDate);

        // ── Save to MongoDB ──────────────────────────────────────────
        const submission = await Submission.create({
          submissionId,
          clientSubmissionId: record.clientSubmissionId.trim(),
          deviceId: record.deviceId.trim(),
          eventId,
          name: record.name.trim(),
          outletName: record.outletName.trim(),
          instagramHandle: normaliseInstagram(record.instagramHandle),
          testimonial: record.testimonial.trim(),
          signatureUrl,
          cloudinaryPublicId,
          clientCreatedAt: clientDate,
          submissionDate: dateStr,
          submissionTime: timeStr,
          syncStatus: 'synced',
          syncedAt: new Date(),
          isSyncedSubmission: true,
        });

        results.push({
          index: i,
          clientSubmissionId,
          status: 'synced',
          submissionId: submission.submissionId,
          message: 'Submission synchronized successfully.',
        });
        syncedCount++;

        console.log(`[Sync] Synced: ${submissionId} | Device: ${record.deviceId} | Event: ${eventId}`);
      } catch (recordErr) {
        // Record-level error — do not fail the whole batch
        console.error(`[Sync] Record ${i} failed (${clientSubmissionId}):`, recordErr.message);
        results.push({
          index: i,
          clientSubmissionId,
          status: 'failed',
          message: recordErr.message || 'An unexpected error occurred while processing this record.',
        });
        failedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        total: submissions.length,
        synced: syncedCount,
        already_synced: alreadySyncedCount,
        failed: failedCount,
      },
      results,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { syncSubmissions };
