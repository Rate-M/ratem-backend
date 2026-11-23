const mongoose = require('mongoose');
const Match = require('../matches/match.model');
const Message = require('../messages/message.model');
const StreakJob = require('./streak-job.model');
const { getStreakThresholdDays } = require('../../config/streak');

const STREAK_TIMEZONE = 'America/Mexico_City';
const JOB_ID = 'daily-streak';
const MAX_CATCH_UP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function localDate(instant, timeZone = STREAK_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function shiftDate(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function timeZoneOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant).map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

function localMidnight(date, timeZone = STREAK_TIMEZONE) {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - timeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - timeZoneOffsetMs(new Date(first), timeZone));
}

async function findQualifyingMatchIds(date) {
  const start = Math.floor(localMidnight(date).getTime() / 1000);
  const end = Math.floor(localMidnight(shiftDate(date, 1)).getTime() / 1000);

  const rows = await Message.aggregate([
    {
      $match: {
        _id: {
          $gte: mongoose.Types.ObjectId.createFromTime(start),
          $lt: mongoose.Types.ObjectId.createFromTime(end),
        },
      },
    },
    { $group: { _id: '$match', senders: { $addToSet: '$sender' } } },
    { $match: { 'senders.1': { $exists: true } } },
  ]);

  return rows.map((row) => row._id);
}

async function processStreakDay(date, now = new Date()) {
  const qualifying = await findQualifyingMatchIds(date);
  const threshold = getStreakThresholdDays();

  if (qualifying.length > 0) {
    await Match.updateMany(
      {
        _id: { $in: qualifying },
        status: 'active',
        'streak.lastCountedDate': { $ne: date },
      },
      [
        {
          $set: {
            'streak.current': {
              $cond: [
                { $eq: ['$streak.lastCountedDate', shiftDate(date, -1)] },
                { $add: [{ $ifNull: ['$streak.current', 0] }, 1] },
                1,
              ],
            },
            'streak.lastCountedDate': date,
          },
        },
        {
          $set: {
            'streak.unlockedAt': {
              $cond: [
                { $gte: ['$streak.current', threshold] },
                { $ifNull: ['$streak.unlockedAt', now] },
                null,
              ],
            },
          },
        },
      ],
      { updatePipeline: true }
    );
  }

  await Match.updateMany(
    {
      _id: { $nin: qualifying },
      status: 'active',
      'streak.current': { $gt: 0 },
      'streak.lastCountedDate': { $lt: date },
    },
    { $set: { 'streak.current': 0, 'streak.unlockedAt': null } }
  );

  return { date, qualifying: qualifying.length };
}

async function runStreakCatchUp(now = new Date()) {
  const yesterday = shiftDate(localDate(now), -1);
  const job = await StreakJob.findById(JOB_ID);
  const oldest = shiftDate(yesterday, -(MAX_CATCH_UP_DAYS - 1));

  let next = job ? shiftDate(job.lastProcessedDate, 1) : yesterday;

  if (next < oldest) {
    next = oldest;
  }

  const processed = [];

  for (let date = next; date <= yesterday; date = shiftDate(date, 1)) {
    processed.push(await processStreakDay(date, now));

    await StreakJob.findByIdAndUpdate(
      JOB_ID,
      { $set: { lastProcessedDate: date } },
      { upsert: true }
    );
  }

  return processed;
}

module.exports = {
  STREAK_TIMEZONE,
  localDate,
  shiftDate,
  localMidnight,
  processStreakDay,
  runStreakCatchUp,
};
