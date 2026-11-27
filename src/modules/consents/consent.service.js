const Consent = require('./consent.model');
const { CURRENT_VERSIONS } = require('../../config/legal');
const { clearLocation } = require('../profiles/profile.service');

async function recordConsents(userId, types = ['privacy', 'terms']) {
  const docs = types.map((type) => ({
    user: userId,
    type,
    version: CURRENT_VERSIONS[type],
  }));
  return Consent.insertMany(docs);
}

function validateOptionalType(type) {
  if (!['biometric', 'location'].includes(type)) {
    const error = new Error('Tipo de consentimiento inválido');
    error.status = 400;
    throw error;
  }
}

async function acceptConsent(userId, type) {
  validateOptionalType(type);

  const active = await Consent.findOne({
    user: userId,
    type,
    version: CURRENT_VERSIONS[type],
    revokedAt: null,
  });

  if (active) return active;

  return Consent.create({
    user: userId,
    type,
    version: CURRENT_VERSIONS[type],
  });
}

async function revokeConsent(userId, type) {
  validateOptionalType(type);

  const result = await Consent.updateMany(
    {
      user: userId,
      type,
      revokedAt: null,
    },
    {
      $set: { revokedAt: new Date() },
    }
  );

  if (type === 'location') {
    await clearLocation(userId);
  }

  return result;
}

async function listConsents(userId) {
  return Consent.find({ user: userId }).sort({ createdAt: -1 });
}

module.exports = { recordConsents, acceptConsent, revokeConsent, listConsents };