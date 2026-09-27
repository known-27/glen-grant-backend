'use strict';

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB Atlas.
 * Reuses the existing connection if one is already established.
 */
async function connectDatabase() {
  if (isConnected) {
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set.');
  }

  try {
    await mongoose.connect(uri, {
      // These options are defaults in Mongoose 8 but listed for clarity
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('[Database] Connected to MongoDB Atlas successfully.');

    mongoose.connection.on('error', (err) => {
      console.error('[Database] MongoDB connection error:', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database] MongoDB disconnected. Reconnection will be attempted automatically.');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[Database] MongoDB reconnected.');
      isConnected = true;
    });
  } catch (err) {
    console.error('[Database] Failed to connect to MongoDB Atlas:', err.message);
    throw err;
  }
}

/**
 * Returns the current connection state string.
 * @returns {'connected'|'disconnected'|'connecting'|'disconnecting'}
 */
function getConnectionState() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
}

module.exports = { connectDatabase, getConnectionState };
