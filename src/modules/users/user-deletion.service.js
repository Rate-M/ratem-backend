const bcrypt = require('bcrypt');
const User = require('./user.model');
const Profile = require('../profiles/profile.model');
const Consent = require('../consents/consent.model');
const VerificationSession = require('../verification/verification.model');
const Swipe = require('../swipes/swipe.model');
const { deletePhotos } = require('../profiles/photo.service');

async function requestDeletion(userId, password) {
  const user = await User.findById(userId);
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    throw error;
  }

  const updated = await User.findOneAndUpdate(
    { _id: userId, deletionRequestedAt: null },
    { $set: {
      deletionRequestedAt: new Date(),
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      emailVerificationTokenHash: null,
      emailVerificationExpires: null,
    } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    const error = new Error('Cuenta no disponible');
    error.status = 409;
    throw error;
  }
}

async function processDeletion(userId) {
  const user = await User.findOne({ _id: userId, deletionRequestedAt: { $ne: null } });
  if (!user) return;

  const profile = await Profile.findOne({ user: userId });
  const filenames = (profile?.photos || []).map((url) => {
    const match = /^\/uploads\/profiles\/([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg))$/.exec(url);
    if (!match) throw new Error('Ruta de foto no válida para eliminación');
    return match[1];
  });

  // Conservar el perfil hasta borrar archivos permite reintentar si falla el disco.
  await deletePhotos(filenames);
  await Profile.deleteMany({ user: userId });
  await Consent.deleteMany({ user: userId });
  await VerificationSession.deleteMany({ user: userId });
  await Swipe.deleteMany({ $or: [{ from: userId }, { to: userId }] });
  // La marca de solicitud permanece hasta completar todas las operaciones.
  await User.deleteOne({ _id: userId, deletionRequestedAt: { $ne: null } });
}

module.exports = { requestDeletion, processDeletion };
