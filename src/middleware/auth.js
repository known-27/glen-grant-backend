'use strict';

/**
 * Admin authentication middleware using session-based login.
 *
 * The admin username and password are loaded from environment variables.
 * Credentials are NEVER hard-coded or exposed to the frontend.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Credential helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies a username/password pair against environment-configured credentials.
 * Uses a constant-time comparison to mitigate timing attacks.
 *
 * @param {string} username
 * @param {string} password
 * @returns {boolean}
 */
function verifyCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME || '';
  const expectedPass = process.env.ADMIN_PASSWORD || '';

  if (!expectedUser || !expectedPass) {
    console.error('[Auth] ADMIN_USERNAME or ADMIN_PASSWORD is not set in environment variables.');
    return false;
  }

  // Constant-time comparison (avoids early-exit timing attack on strings)
  let match = true;
  if (username.length !== expectedUser.length) match = false;
  if (password.length !== expectedPass.length) match = false;

  // Still iterate both strings to keep timing consistent
  for (let i = 0; i < Math.max(username.length, expectedUser.length); i++) {
    if (username[i] !== expectedUser[i]) match = false;
  }
  for (let i = 0; i < Math.max(password.length, expectedPass.length); i++) {
    if (password[i] !== expectedPass[i]) match = false;
  }

  return match;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requireAdmin — protects HTML admin pages.
 *
 * If not authenticated, redirect to /admin/login.
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }
  // Save the intended destination for post-login redirect
  req.session.returnTo = req.originalUrl;
  res.redirect('/admin/login');
}

/**
 * requireAdminApi — protects admin API routes (returns JSON 401).
 */
function requireAdminApi(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }
  return res.status(401).json({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Admin authentication required.',
    },
  });
}

module.exports = { requireAdmin, requireAdminApi, verifyCredentials };
