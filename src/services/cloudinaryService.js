'use strict';

const { getCloudinary } = require('../config/cloudinary');
const { Readable } = require('stream');

/**
 * Cloudinary service layer.
 *
 * Wraps Cloudinary SDK calls with consistent error handling.
 * Provides deterministic public_id generation based on eventId + submissionId.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public ID builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a deterministic Cloudinary public_id.
 *
 * Format: glen-grant/signatures/{eventId}/{submissionId}
 *
 * Using deterministic IDs means re-uploading the same submission simply
 * overwrites the previous image rather than creating a new orphaned asset.
 *
 * @param {string} eventId
 * @param {string} submissionId
 * @returns {string}
 */
function buildPublicId(eventId, submissionId) {
  // Sanitize: replace anything that isn't alphanumeric, dash, or underscore
  const safeEvent = eventId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSub = submissionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `glen-grant/signatures/${safeEvent}/${safeSub}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a signature image buffer to Cloudinary.
 *
 * @param {Buffer} imageBuffer - Raw image bytes from Multer memory storage
 * @param {string} eventId     - Event identifier
 * @param {string} submissionId - Submission identifier (used as filename)
 * @param {string} [mimeType]  - MIME type (default: image/png)
 * @returns {Promise<{ signatureUrl: string, cloudinaryPublicId: string }>}
 */
async function uploadSignature(imageBuffer, eventId, submissionId, mimeType = 'image/png') {
  const cloudinary = getCloudinary();
  const publicId = buildPublicId(eventId, submissionId);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'image',
        format: 'png',          // Always store as PNG regardless of input format
        overwrite: true,         // Idempotent — safe to re-upload on retry
        invalidate: true,        // Bust CDN cache on overwrite
        tags: ['glen-grant', 'signature', eventId],
        context: {
          event_id: eventId,
          submission_id: submissionId,
        },
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload failed:', error.message);
          const err = new Error(`Cloudinary upload failed: ${error.message}`);
          err.statusCode = 502;
          err.code = 'CLOUDINARY_UPLOAD_FAILED';
          return reject(err);
        }

        resolve({
          signatureUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
        });
      }
    );

    // Pipe the buffer into the upload stream
    const readable = Readable.from(imageBuffer);
    readable.pipe(uploadStream);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete (used for cleanup / future admin feature)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes a Cloudinary asset by public_id.
 *
 * @param {string} publicId
 * @returns {Promise<void>}
 */
async function deleteSignature(publicId) {
  const cloudinary = getCloudinary();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    console.log(`[Cloudinary] Deleted asset: ${publicId}`);
  } catch (err) {
    console.error(`[Cloudinary] Delete failed for ${publicId}:`, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Download (used by Excel / backup export)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Downloads a Cloudinary image by URL and returns it as a Buffer.
 *
 * @param {string} url - Cloudinary secure URL
 * @returns {Promise<Buffer>}
 */
async function downloadImageBuffer(url) {
  const axios = require('axios');

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'Accept': 'image/png,image/jpeg,image/*',
      },
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.error(`[Cloudinary] Image download failed (${url}):`, err.message);
    const error = new Error(`Failed to download image from Cloudinary: ${err.message}`);
    error.code = 'IMAGE_DOWNLOAD_FAILED';
    throw error;
  }
}

module.exports = {
  buildPublicId,
  uploadSignature,
  deleteSignature,
  downloadImageBuffer,
};
