'use strict';

const path = require('path');
const Submission = require('../models/Submission');
const { verifyCredentials } = require('../middleware/auth');
const { getTimezoneDate } = require('../utils/timezone');

/**
 * GET /admin/login — render login page
 */
function showLoginPage(req, res) {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  res.sendFile(path.join(__dirname, '../views/admin/login.html'));
}

/**
 * POST /admin/login — process login form
 */
function processLogin(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/admin/login?error=1');
  }

  if (verifyCredentials(username.trim(), password)) {
    req.session.isAdmin = true;
    req.session.adminUser = username.trim();

    const returnTo = req.session.returnTo || '/admin';
    delete req.session.returnTo;

    console.log(`[Admin] Login: user "${username}" authenticated.`);
    return res.redirect(returnTo);
  }

  console.warn(`[Admin] Failed login attempt for username: "${username}"`);
  return res.redirect('/admin/login?error=1');
}

/**
 * POST /admin/logout
 */
function processLogout(req, res) {
  req.session.destroy((err) => {
    if (err) console.error('[Admin] Session destroy error:', err.message);
    res.redirect('/admin/login');
  });
}

/**
 * GET /admin — dashboard
 */
async function showDashboard(req, res, next) {
  try {
    res.sendFile(path.join(__dirname, '../views/admin/dashboard.html'));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/submissions — submissions list page
 */
function showSubmissionsPage(req, res) {
  res.sendFile(path.join(__dirname, '../views/admin/submissions.html'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin JSON API (used by the dashboard JavaScript)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /admin/api/stats
 * Returns quick stats for the dashboard.
 */
async function getStats(req, res, next) {
  try {
    const { dateStr: todayStr } = getTimezoneDate(new Date());
    const eventId = req.query.eventId || null;

    const matchFilter = eventId ? { eventId } : {};
    const todayFilter = { ...matchFilter, submissionDate: todayStr };

    const [total, today, deviceCount] = await Promise.all([
      Submission.countDocuments(matchFilter),
      Submission.countDocuments(todayFilter),
      Submission.distinct('deviceId', matchFilter).then(d => d.length),
    ]);

    // Submissions per day (last 14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const dailyAgg = await Submission.aggregate([
      { $match: { ...matchFilter, createdAt: { $gte: twoWeeksAgo } } },
      { $group: { _id: '$submissionDate', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    return res.json({
      success: true,
      total,
      today,
      deviceCount,
      todayDate: todayStr,
      timezone: process.env.EVENT_TIMEZONE || 'Asia/Kolkata',
      dailyTrend: dailyAgg.map(d => ({ date: d._id, count: d.count })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/submissions
 *
 * Paginated, filterable submission list for the admin dashboard table.
 *
 * Query params:
 *   page     (default 1)
 *   limit    (default 20, max 100)
 *   search   (text search across name/outlet/instagram)
 *   dateFrom (YYYY-MM-DD)
 *   dateTo   (YYYY-MM-DD)
 *   eventId
 *   deviceId
 */
async function listSubmissions(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};

    // Event filter
    if (req.query.eventId) filter.eventId = req.query.eventId.trim();

    // Device filter
    if (req.query.deviceId) filter.deviceId = req.query.deviceId.trim();

    // Date range filter
    if (req.query.dateFrom || req.query.dateTo) {
      filter.submissionDate = {};
      if (req.query.dateFrom) filter.submissionDate.$gte = req.query.dateFrom.trim();
      if (req.query.dateTo)   filter.submissionDate.$lte = req.query.dateTo.trim();
    }

    // Text search
    if (req.query.search && req.query.search.trim()) {
      const q = req.query.search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { outletName: { $regex: q, $options: 'i' } },
        { instagramHandle: { $regex: q, $options: 'i' } },
      ];
    }

    const [submissions, total] = await Promise.all([
      Submission.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Submission.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      submissions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/api/submissions/:submissionId
 * Returns a single submission for the admin view.
 */
async function getSubmissionDetail(req, res, next) {
  try {
    const submission = await Submission.findOne({
      submissionId: req.params.submissionId,
    }).lean();

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Submission not found.' },
      });
    }

    return res.json({ success: true, submission });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showLoginPage,
  processLogin,
  processLogout,
  showDashboard,
  showSubmissionsPage,
  getStats,
  listSubmissions,
  getSubmissionDetail,
};
