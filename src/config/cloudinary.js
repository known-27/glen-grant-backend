'use strict';

const cloudinary = require('cloudinary').v2;

let configured = false;

/**
 * Configure Cloudinary SDK with environment credentials.
 * Called once at application startup.
 */
function configureCloudinary() {
  if (configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary credentials are missing. ' +
      'Ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set.'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true, // Always use HTTPS URLs
  });

  configured = true;
  console.log('[Cloudinary] SDK configured successfully.');
}

/**
 * Returns the shared Cloudinary instance.
 * configureCloudinary() must be called before using this.
 */
function getCloudinary() {
  if (!configured) {
    throw new Error('Cloudinary has not been configured. Call configureCloudinary() first.');
  }
  return cloudinary;
}

module.exports = { configureCloudinary, getCloudinary };
