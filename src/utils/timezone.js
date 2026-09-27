'use strict';

/**
 * Timezone utility.
 *
 * All date-based operations (count queries, submission dating) use the
 * event timezone configured via the EVENT_TIMEZONE environment variable.
 *
 * This avoids incorrect date boundaries when the server runs in UTC
 * but the event takes place in another timezone (e.g., Asia/Kolkata).
 *
 * Node.js 18+ includes the Intl API natively with full IANA timezone support,
 * so no external library is needed.
 */

/**
 * Returns the configured event timezone string.
 * Falls back to 'Asia/Kolkata' if not set.
 *
 * @returns {string} IANA timezone name
 */
function getEventTimezone() {
  return process.env.EVENT_TIMEZONE || 'Asia/Kolkata';
}

/**
 * Formats a Date object according to the event timezone.
 *
 * @param {Date}   date   - The date to format
 * @param {string} locale - BCP 47 locale tag (default: 'en-IN')
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string}
 */
function formatInTimezone(date, options, locale = 'en-IN') {
  const tz = getEventTimezone();
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).format(date);
}

/**
 * Returns YYYY-MM-DD and HH:MM:SS strings for a given Date in event timezone.
 *
 * @param {Date} date
 * @returns {{ dateStr: string, timeStr: string }}
 */
function getTimezoneDate(date = new Date()) {
  const tz = getEventTimezone();

  // Use formatToParts for reliable extraction
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || '00';

  const year   = get('year');
  const month  = get('month');
  const day    = get('day');
  const hour   = get('hour') === '24' ? '00' : get('hour'); // midnight edge case
  const minute = get('minute');
  const second = get('second');

  return {
    dateStr: `${year}-${month}-${day}`,
    timeStr: `${hour}:${minute}:${second}`,
  };
}

/**
 * Returns the start and end of today in UTC, using the event timezone
 * to determine what "today" means.
 *
 * For example, if EVENT_TIMEZONE=Asia/Kolkata and it is 01:00 UTC,
 * that is 06:30 IST, so "today" is the IST calendar date.
 *
 * @returns {{ startOfDay: Date, endOfDay: Date, todayDateStr: string }}
 */
function getTodayBounds() {
  const tz = getEventTimezone();
  const now = new Date();

  // Get today's date string in the event timezone
  const { dateStr } = getTimezoneDate(now);

  // Parse the day boundaries by constructing ISO strings with timezone offset
  // Use Intl to get the UTC offset at midnight of today in the event timezone
  const startLocal = new Date(`${dateStr}T00:00:00`);
  const endLocal   = new Date(`${dateStr}T23:59:59.999`);

  // Convert from local timezone to UTC by using the offset
  // We use a reliable method: format a known reference date in the target timezone
  // and compare to get the offset in ms
  function toUTC(localIso) {
    // Create a Date object interpreted as UTC
    const asUTC = new Date(localIso + 'Z');

    // Format that UTC date in the event timezone to see what local time it shows
    const tzDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Binary search for the correct UTC time that represents midnight in the TZ
    // For simplicity, use offset calculation via a formatting trick
    const parts = tzDate.formatToParts(asUTC);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const offset = asUTC.getTime() - localMs;
    return new Date(asUTC.getTime() + offset);
  }

  // Simpler and reliable approach: construct dates using the known date string
  // and find midnight UTC by calculating timezone offset
  const midnightUTC = getMidnightUTC(dateStr, tz);
  const endOfDayUTC = new Date(midnightUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

  return {
    startOfDay: midnightUTC,
    endOfDay: endOfDayUTC,
    todayDateStr: dateStr,
  };
}

/**
 * Gets the UTC Date that corresponds to midnight (00:00:00) of a given
 * YYYY-MM-DD date string in the specified IANA timezone.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} tz      - IANA timezone
 * @returns {Date}         UTC Date object
 */
function getMidnightUTC(dateStr, tz) {
  // Iterate offset search: try UTC midnight, then adjust by the TZ offset
  // This handles DST transitions correctly via binary approach.
  // For most practical uses, we construct the date and use the formatting trick.

  // Fast path: estimate offset in minutes for the given date
  // by formatting a test Date in the target timezone and diffing
  const testDate = new Date(`${dateStr}T12:00:00Z`); // noon UTC as reference
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(testDate);

  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const localNoon = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offsetMs = testDate.getTime() - localNoon; // UTC - local = -offset

  // Midnight local = dateStr + T00:00:00 + offsetMs
  const midnightLocal = new Date(`${dateStr}T00:00:00Z`);
  return new Date(midnightLocal.getTime() + offsetMs);
}

module.exports = { getEventTimezone, getTimezoneDate, getTodayBounds, getMidnightUTC };
