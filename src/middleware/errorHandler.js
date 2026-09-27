'use strict';

/**
 * Centralized Express error handler.
 *
 * Must be registered LAST in the middleware chain.
 * Converts all errors into a consistent JSON structure.
 *
 * In production:
 *   - Stack traces are suppressed
 *   - Generic messages are returned for unexpected errors
 *
 * In development:
 *   - Stack traces are included for easier debugging
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDev = process.env.NODE_ENV !== 'production';

  // Determine HTTP status code
  let statusCode = err.statusCode || err.status || 500;

  // Handle known Mongoose errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.name === 'CastError') {
    statusCode = 400;
  } else if (err.code === 11000) {
    // MongoDB duplicate key
    statusCode = 409;
  }

  // Build the error code (snake_case, uppercase)
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  if (statusCode === 400) errorCode = err.code || 'VALIDATION_ERROR';
  if (statusCode === 401) errorCode = err.code || 'UNAUTHORIZED';
  if (statusCode === 403) errorCode = err.code || 'FORBIDDEN';
  if (statusCode === 404) errorCode = err.code || 'NOT_FOUND';
  if (statusCode === 409) errorCode = err.code || 'CONFLICT';

  // Build user-facing message
  let message = err.message || 'An unexpected error occurred.';
  if (statusCode === 500 && !isDev) {
    message = 'An internal server error occurred. Please try again later.';
  }

  // Log server errors
  if (statusCode >= 500) {
    console.error('[Error]', {
      method: req.method,
      path: req.path,
      statusCode,
      message: err.message,
      stack: isDev ? err.stack : undefined,
    });
  } else {
    console.warn('[Warning]', {
      method: req.method,
      path: req.path,
      statusCode,
      message: err.message,
    });
  }

  const body = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
  };

  if (isDev && err.stack) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

/**
 * Creates an error with a custom status code and code string.
 */
function createError(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

module.exports = { errorHandler, createError };
