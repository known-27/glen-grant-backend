'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// Submission Schema
// ─────────────────────────────────────────────────────────────────────────────

const SubmissionSchema = new Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────

    /**
     * Globally unique identifier for this submission.
     * Generated server-side using UUID v4.
     */
    submissionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    /**
     * Client-side submission ID sent by the Android device.
     * Used as an idempotency key to prevent duplicate submissions during sync.
     */
    clientSubmissionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    /**
     * Unique identifier for the Android device.
     * Allows tracking submissions per tablet when multiple devices are used.
     */
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    /**
     * Event identifier. Links submissions to a specific event.
     */
    eventId: {
      type: String,
      required: true,
      trim: true,
      default: () => process.env.EVENT_ID || 'glen-grant-default',
      index: true,
    },

    // ── Bartender Information ────────────────────────────────────────────────

    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      maxlength: [200, 'Name must not exceed 200 characters.'],
    },

    outletName: {
      type: String,
      required: [true, 'Outlet name is required.'],
      trim: true,
      maxlength: [300, 'Outlet name must not exceed 300 characters.'],
    },

    instagramHandle: {
      type: String,
      required: [true, 'Instagram handle is required.'],
      trim: true,
      maxlength: [100, 'Instagram handle must not exceed 100 characters.'],
    },

    testimonial: {
      type: String,
      required: [true, 'Testimonial is required.'],
      trim: true,
      maxlength: [1000, 'Testimonial text is too long.'],
    },

    // Word count is stored for quick validation / display
    testimonialWordCount: {
      type: Number,
      min: 0,
    },

    // ── Signature ────────────────────────────────────────────────────────────

    /**
     * Cloudinary secure URL to the signature PNG image.
     */
    signatureUrl: {
      type: String,
      required: [true, 'Signature URL is required.'],
      trim: true,
    },

    /**
     * Cloudinary public_id used for direct API operations (delete, transform, etc.)
     */
    cloudinaryPublicId: {
      type: String,
      required: [true, 'Cloudinary public ID is required.'],
      trim: true,
    },

    // ── Timestamps ───────────────────────────────────────────────────────────

    /**
     * ISO timestamp from the client device at the time of submission.
     * May differ from server createdAt if the device was offline.
     */
    clientCreatedAt: {
      type: Date,
    },

    /**
     * Submission date string in YYYY-MM-DD format (event timezone).
     * Used for efficient date-based queries without timezone math overhead.
     */
    submissionDate: {
      type: String,
      trim: true,
      index: true,
    },

    /**
     * Submission time string in HH:MM:SS format (event timezone).
     */
    submissionTime: {
      type: String,
      trim: true,
    },

    // ── Synchronization ───────────────────────────────────────────────────────

    /**
     * Whether this submission was received via the /api/sync endpoint.
     */
    isSyncedSubmission: {
      type: Boolean,
      default: false,
    },

    /**
     * ISO timestamp when the server confirmed the submission as synced.
     */
    syncedAt: {
      type: Date,
    },

    /**
     * Current sync state. Useful for tracking submission lifecycle.
     * Values: 'direct' | 'synced' | 'pending'
     */
    syncStatus: {
      type: String,
      enum: ['direct', 'synced', 'pending'],
      default: 'direct',
      index: true,
    },
  },
  {
    // Mongoose automatic timestamps (createdAt, updatedAt)
    timestamps: true,

    // Improve JSON output
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────

// createdAt for time-based sorting/filtering
SubmissionSchema.index({ createdAt: -1 });

// eventId + createdAt compound — most common admin query pattern
SubmissionSchema.index({ eventId: 1, createdAt: -1 });

// eventId + submissionDate — fast date-based count queries
SubmissionSchema.index({ eventId: 1, submissionDate: 1 });

// Full text search on name, outletName, instagramHandle
SubmissionSchema.index(
  { name: 'text', outletName: 'text', instagramHandle: 'text' },
  { name: 'submission_text_search' }
);

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook — compute word count
// ─────────────────────────────────────────────────────────────────────────────

SubmissionSchema.pre('save', function (next) {
  if (this.isModified('testimonial') && this.testimonial) {
    this.testimonialWordCount = this.testimonial
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Virtuals
// ─────────────────────────────────────────────────────────────────────────────

SubmissionSchema.virtual('signatureThumbnailUrl').get(function () {
  // Return a Cloudinary transformation URL for a 200px-wide thumbnail
  if (!this.signatureUrl) return null;
  return this.signatureUrl.replace('/upload/', '/upload/w_200,h_100,c_fit/');
});

const Submission = mongoose.model('Submission', SubmissionSchema);

module.exports = Submission;
