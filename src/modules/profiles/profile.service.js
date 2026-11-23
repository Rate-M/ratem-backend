const mongoose = require('mongoose');
const Profile = require('./profile.model');
const User = require('../users/user.model');
const Consent = require('../consents/consent.model');
const { CURRENT_VERSIONS } = require('../../config/legal');
const { savePhotos, deletePhotos } = require('./photo.service');
const { normalizeProfileData } = require('./profile.validation');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function createProfile(userId, data, files = []) {
  const fields = normalizeProfileData(data);

  if (files.length < 1 || files.length > 6) {
    fail('Debes subir entre 1 y 6 fotos');
  }

  const existing = await Profile.findOne({ user: userId });

  if (existing) {
    fail('Ya tienes un perfil', 409);
  }

  const filenames = await savePhotos(files);

  try {
    return await Profile.create({
      ...fields,
      user: userId,
      photos: filenames.map(
        (filename) => `/uploads/profiles/${filename}`
      ),
    });
  } catch (error) {
    await deletePhotos(filenames);

    if (error.code === 11000) {
      fail('Ya tienes un perfil', 409);
    }

    if (error.name === 'ValidationError') {
      error.status = 400;
    }

    throw error;
  }
}

async function getMyProfile(userId) {
  const profile = await Profile.findOne({ user: userId });

  if (!profile) {
    fail('Todavía no tienes un perfil', 404);
  }

  return profile;
}

async function updateMyProfile(userId, data) {
  const updates = normalizeProfileData(data, true);

  let profile;

  try {
    profile = await Profile.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (error) {
    if (error.name === 'ValidationError') {
      error.status = 400;
    }

    throw error;
  }

  if (!profile) {
    fail('Todavía no tienes un perfil', 404);
  }

  return profile;
}

async function getPublicProfile(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    fail('Perfil no encontrado', 404);
  }

  if (!await User.exists({ _id: userId, deletionRequestedAt: null })) {
    fail('Perfil no encontrado', 404);
  }

  const profile = await Profile.findOne({ user: userId });

  if (!profile) {
    fail('Perfil no encontrado', 404);
  }

  return profile;
}

function validateFields(data, allowed, message) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(message);
  }

  const keys = Object.keys(data);

  if (keys.length === 0 || keys.some((key) => !allowed.includes(key))) {
    fail(message);
  }
}

function validateCoordinate(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${label} debe ser un número entre ${min} y ${max}`);
  }

  return Number(value.toFixed(2));
}

async function updateMyLocation(userId, data) {
  validateFields(data, ['latitude', 'longitude'], 'Envía solo latitude y longitude');

  if (!Object.hasOwn(data, 'latitude') || !Object.hasOwn(data, 'longitude')) {
    fail('Envía latitude y longitude');
  }

  const latitude = validateCoordinate(data.latitude, -90, 90, 'latitude');
  const longitude = validateCoordinate(data.longitude, -180, 180, 'longitude');

  const consent = await Consent.findOne({
    user: userId,
    type: 'location',
    version: CURRENT_VERSIONS.location,
    revokedAt: null,
  });

  if (!consent) {
    fail('Debes otorgar el consentimiento de ubicación para compartirla', 403);
  }

  const profile = await Profile.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        location: { type: 'Point', coordinates: [longitude, latitude] },
        locationUpdatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );

  if (!profile) {
    fail('Todavía no tienes un perfil', 404);
  }

  return profile;
}

async function clearLocation(userId) {
  return Profile.updateMany(
    { user: userId },
    { $unset: { location: '' }, $set: { locationUpdatedAt: null } }
  );
}

async function updateMyPreferences(userId, data) {
  validateFields(
    data,
    ['minAge', 'maxAge', 'maxDistanceKm'],
    'Envía minAge, maxAge o maxDistanceKm'
  );

  for (const [key, min, max] of [['minAge', 18, 99], ['maxAge', 18, 99], ['maxDistanceKm', 1, 150]]) {
    if (Object.hasOwn(data, key) && (!Number.isInteger(data[key]) || data[key] < min || data[key] > max)) {
      fail(`${key} debe ser un entero entre ${min} y ${max}`);
    }
  }

  const profile = await Profile.findOne({ user: userId });

  if (!profile) {
    fail('Todavía no tienes un perfil', 404);
  }

  const preferences = {
    minAge: profile.preferences?.minAge ?? 18,
    maxAge: profile.preferences?.maxAge ?? 99,
    maxDistanceKm: profile.preferences?.maxDistanceKm ?? 50,
    ...data,
  };

  if (preferences.minAge > preferences.maxAge) {
    fail('La edad mínima no puede ser mayor que la máxima');
  }

  return Profile.findOneAndUpdate(
    { user: userId },
    { $set: { preferences } },
    { returnDocument: 'after', runValidators: true }
  );
}

module.exports = {
  createProfile,
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  updateMyLocation,
  clearLocation,
  updateMyPreferences,
};
