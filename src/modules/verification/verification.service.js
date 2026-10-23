const User = require('../users/user.model');
const Consent = require('../consents/consent.model');
const VerificationSession = require('./verification.model');
const { CURRENT_VERSIONS } = require('../../config/legal');
const { getProvider } = require('./providers');
const { applyVerificationRules } = require('./verification.rules');

const USER_STATUS = {
  approved: 'approved',
  rejected: 'rejected',
  expired: 'pending',
};

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function serializeSession(session) {
  return {
    id: session._id,
    provider: session.provider,
    status: session.status,
    verificationUrl: session.verificationUrl,
    createdAt: session.createdAt,
  };
}

async function startVerification(userId) {
  const user = await User.findById(userId);

  if (!user) {
    fail('Usuario no encontrado', 404);
  }

  if (user.verificationStatus === 'approved') {
    fail('Tu identidad ya fue verificada', 409);
  }

  const consent = await Consent.findOne({
    user: userId,
    type: 'biometric',
    version: CURRENT_VERSIONS.biometric,
    revokedAt: null,
  });

  if (!consent) {
    fail(
      'Debes otorgar el consentimiento biométrico antes de verificar tu identidad',
      403
    );
  }

  const pending = await VerificationSession.findOne({
    user: userId,
    status: 'pending',
  });

  if (pending) {
    return { session: pending, created: false };
  }

  const provider = getProvider();
  const { providerSessionId, verificationUrl } =
    await provider.createSession({ userId });

  const session = await VerificationSession.create({
    user: userId,
    provider: provider.name,
    providerSessionId,
    verificationUrl,
  });

  if (user.verificationStatus === 'rejected') {
    await User.updateOne(
      { _id: userId },
      { $set: { verificationStatus: 'pending' } }
    );
  }

  return { session, created: true };
}

async function handleWebhook({ rawBody, headers, body }) {
  const provider = getProvider();

  if (!provider.verifyWebhook({ rawBody, headers })) {
    fail('Firma del webhook inválida', 401);
  }

  const parsed = provider.parseWebhook(body);

  if (!parsed) {
    return;
  }

  const result = applyVerificationRules(parsed);

  const session = await VerificationSession.findOne({
    provider: provider.name,
    providerSessionId: result.providerSessionId,
  });

  if (!session) {
    fail('Sesión de verificación no encontrada', 404);
  }

  if (session.status !== 'pending') {
    return;
  }

  const updates = { providerStatus: result.providerStatus };

  if (result.status) {
    updates.status = result.status;
    updates.decidedAt = new Date();
  }

  const updated = await VerificationSession.findOneAndUpdate(
    { _id: session._id, status: 'pending' },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (updated && result.status) {
    await User.updateOne(
      { _id: session.user },
      { $set: { verificationStatus: USER_STATUS[result.status] } }
    );
  }
}

module.exports = { serializeSession, startVerification, handleWebhook };
