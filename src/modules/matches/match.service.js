const mongoose = require('mongoose');
const Match = require('./match.model');
const Swipe = require('../swipes/swipe.model');
const User = require('../users/user.model');

function serializeMatch(match) {
  return {
    id: match._id,
    users: [match.userA._id || match.userA, match.userB._id || match.userB],
    createdAt: match.createdAt,
  };
}

async function ensureMutualMatch(from, to) {
  const [userA, userB] = [String(from).toLowerCase(), String(to).toLowerCase()].sort();
  if (userA === userB) return null;
  const reciprocal = await Swipe.exists({ from: to, to: from, action: 'like' });
  if (!reciprocal) return null;

  const available = await User.countDocuments({
    _id: { $in: [userA, userB] }, verificationStatus: 'approved', deletionRequestedAt: null,
  });
  if (available !== 2) return null;

  let match;
  try {
    match = await Match.findOneAndUpdate(
      { userA, userB },
      { $setOnInsert: { userA, userB, status: 'active', readBy: [] } },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    match = await Match.findOne({ userA, userB });
    if (!match) throw error;
  }
  return match.status === 'active' ? serializeMatch(match) : null;
}

async function listMatches(userId, { before, unreadOnly = false } = {}) {
  if (before !== undefined && (typeof before !== 'string' || !/^[a-f0-9]{24}$/i.test(before))) {
    const error = new Error('Cursor inválido');
    error.status = 400;
    throw error;
  }
  const filter = { status: 'active', $or: [{ userA: userId }, { userB: userId }] };
  if (before) filter._id = { $lt: before };
  if (unreadOnly) filter.readBy = { $ne: userId };
  const rows = await Match.find(filter)
    .sort({ _id: -1 }).limit(51)
    .populate('userA userB', '_id verificationStatus deletionRequestedAt').lean();
  const page = rows.slice(0, 50);
  const matches = page.filter((row) => [row.userA, row.userB].every(
    (user) => user && user.verificationStatus === 'approved' && !user.deletionRequestedAt
  )).map(serializeMatch);

  return { matches, nextCursor: rows.length > 50 ? String(page[49]._id) : null };
}

async function markNotificationRead(userId, matchId) {
  if (typeof matchId !== 'string' || !mongoose.isValidObjectId(matchId)) return false;
  const result = await Match.updateOne(
    { _id: matchId, status: 'active', $or: [{ userA: userId }, { userB: userId }] },
    { $addToSet: { readBy: userId } }
  );
  return result.matchedCount === 1;
}

module.exports = { ensureMutualMatch, listMatches, markNotificationRead };
