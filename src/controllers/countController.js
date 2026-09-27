'use strict';

const Submission = require('../models/Submission');
const { getTodayBounds, getTimezoneDate } = require('../utils/timezone');

/**
 * GET /api/count
 * GET /api/count?eventId=EVENT_ID
 *
 * Returns:
 * - today's submission count (based on event timezone)
 * - overall submission count
 * - current date in event timezone
 *
 * The count uses submissionDate (YYYY-MM-DD stored at submission time in event TZ)
 * rather than UTC date boundaries for accuracy.
 */
async function getCount(req, res, next) {
  try {
    const eventId = req.query.eventId || null;

    // Get today's date string in the event timezone
    const { dateStr: todayStr } = getTimezoneDate(new Date());

    // Build query filters
    const todayFilter = { submissionDate: todayStr };
    const overallFilter = {};

    if (eventId) {
      todayFilter.eventId = eventId.trim();
      overallFilter.eventId = eventId.trim();
    }

    // Run both counts in parallel
    const [todayCount, overallCount] = await Promise.all([
      Submission.countDocuments(todayFilter),
      Submission.countDocuments(overallFilter),
    ]);

    return res.status(200).json({
      success: true,
      today: todayCount,
      overall: overallCount,
      date: todayStr,
      timezone: process.env.EVENT_TIMEZONE || 'Asia/Kolkata',
      ...(eventId ? { eventId } : {}),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCount };
