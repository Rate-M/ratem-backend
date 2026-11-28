const { availableAccount } = require('../users/account-status');
const mongoose = require('mongoose');
const Profile = require('../profiles/profile.model');
const Swipe = require('../swipes/swipe.model');
const { serializeProfile, serializePublicProfile } = require('../profiles/profile.serializer');

const DEFAULT_PREFERENCES = { minAge: 18, maxAge: 99, maxDistanceKm: 50 };
const ALL_GENDERS = ['mujer', 'hombre', 'no_binario', 'otra_identidad'];
const UNDISCLOSED = 'prefiero_no_decir';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

function fail(message, status = 400, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  throw error;
}

function parseLimit(query) {
  if (Object.keys(query).some((key) => key !== 'limit')) {
    fail('Solo se permite el parámetro limit');
  }

  if (query.limit === undefined) {
    return DEFAULT_LIMIT;
  }

  const limit = Number(query.limit);

  if (!/^\d+$/.test(String(query.limit)) || limit < 1 || limit > MAX_LIMIT) {
    fail(`limit debe ser un entero entre 1 y ${MAX_LIMIT}`);
  }

  return limit;
}

function birthDateYearsAgo(today, years) {
  const year = String(today.getUTCFullYear() - years).padStart(4, '0');
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const day = String(today.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolvePreferences(preferences) {
  return {
    minAge: preferences?.minAge ?? DEFAULT_PREFERENCES.minAge,
    maxAge: preferences?.maxAge ?? DEFAULT_PREFERENCES.maxAge,
    maxDistanceKm: preferences?.maxDistanceKm ?? DEFAULT_PREFERENCES.maxDistanceKm,
  };
}

function buildCandidateQuery(me, excludedUserIds, today) {
  const preferences = resolvePreferences(me.preferences);
  const interestedIn = Array.isArray(me.interestedIn) ? me.interestedIn : [];
  const wantsEveryone = ALL_GENDERS.every((gender) => interestedIn.includes(gender));

  const query = {
    user: { $nin: excludedUserIds },
    birthDate: {
      $gt: birthDateYearsAgo(today, preferences.maxAge + 1),
      $lte: birthDateYearsAgo(today, preferences.minAge),
    },
    gender: { $in: wantsEveryone ? [...interestedIn, UNDISCLOSED] : interestedIn },
  };

  if (me.gender !== UNDISCLOSED) {
    query.interestedIn = me.gender;
  }

  return query;
}

function buildDiscoveryPipeline(me, excludedUserIds, today, limit) {
  const preferences = resolvePreferences(me.preferences);
  const myAge = serializeProfile(me, today).age;

  return [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: me.location.coordinates },
        distanceField: 'distance',
        maxDistance: preferences.maxDistanceKm * 1000,
        spherical: true,
        key: 'location',
        query: buildCandidateQuery(me, excludedUserIds, today),
      },
    },
    {
      $match: {
        $expr: {
          $and: [
            {
              $lte: [
                '$distance',
                { $multiply: [{ $ifNull: ['$preferences.maxDistanceKm', DEFAULT_PREFERENCES.maxDistanceKm] }, 1000] },
              ],
            },
            { $gte: [myAge, { $ifNull: ['$preferences.minAge', DEFAULT_PREFERENCES.minAge] }] },
            { $lte: [myAge, { $ifNull: ['$preferences.maxAge', DEFAULT_PREFERENCES.maxAge] }] },
          ],
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'account',
        pipeline: [
          { $match: { verificationStatus: 'approved', deletionRequestedAt: null, ...availableAccount() } },
          { $project: { _id: 1 } },
        ],
      },
    },
    { $match: { 'account.0': { $exists: true } } },
    { $limit: limit },
    { $project: { account: 0 } },
  ];
}

async function discoverProfiles(userId, query, today = new Date()) {
  const limit = parseLimit(query);
  const me = await Profile.findOne({ user: userId });

  if (!me) {
    fail('Crea tu perfil para descubrir otros perfiles', 404, 'PROFILE_REQUIRED');
  }

  if (!me.location?.coordinates || me.location.coordinates.length !== 2) {
    fail('Comparte tu ubicación para descubrir perfiles cercanos', 409, 'LOCATION_REQUIRED');
  }

  const swiped = await Swipe.distinct('to', { from: userId });
  const excludedUserIds = [new mongoose.Types.ObjectId(String(userId)), ...swiped];

  const rows = await Profile.aggregate(
    buildDiscoveryPipeline(me, excludedUserIds, today, limit)
  );

  return {
    profiles: rows.map((row) => ({
      ...serializePublicProfile(row, today),
      distanceKm: Math.max(1, Math.round(row.distance / 1000)),
    })),
  };
}

module.exports = { discoverProfiles, buildDiscoveryPipeline, buildCandidateQuery };
