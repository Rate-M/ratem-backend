const Consent = require('./consent.model');
const { CURRENT_VERSIONS } = require('../../config/legal');

async function recordConsents(userId, types = ['privacy', 'terms']) {
  const docs = types.map((type) => ({
    user: userId,
    type,
    version: CURRENT_VERSIONS[type],
  }));
  return Consent.insertMany(docs);
}

module.exports = { recordConsents };