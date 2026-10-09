const {
  acceptConsent,
  revokeConsent,
  listConsents,
} = require('./consent.service');

async function accept(req, res, next) {
  try {
    const consent = await acceptConsent(req.user.id, req.params.type);
    res.status(200).json(consent);
  } catch (err) {
    next(err);
  }
}

async function revoke(req, res, next) {
  try {
    await revokeConsent(req.user.id, req.params.type);

    res.status(200).json({
      message: 'El consentimiento quedó revocado',
    });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const consents = await listConsents(req.user.id);
    res.status(200).json(consents);
  } catch (err) {
    next(err);
  }
}

module.exports = { accept, revoke, list };