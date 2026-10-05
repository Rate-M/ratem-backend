const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../users/user.model');
const { recordConsents } = require('../consents/consent.service');


async function registerUser({ email, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    const error = new Error('El correo ya está registrado');
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash });

  await recordConsents(user._id, ['privacy', 'terms']);

  return user;
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ email });

  const genericError = new Error('Credenciales inválidas');
  genericError.status = 401;

  if (!user) throw genericError;

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw genericError;

  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  return { token, user };
}

async function forgotPassword({ email }) {
  const user = await User.findOne({ email });

  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
  await user.save();

  const resetLink = `${process.env.CLIENT_URL}/recuperar/${rawToken}`;
  console.log('Enlace de recuperación (temporal, solo en consola):', resetLink);
}

async function resetPassword({ token, password }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    const error = new Error('El enlace es inválido o ya expiró');
    error.status = 400;
    throw error;
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  await user.save();
}

module.exports = { registerUser, loginUser, forgotPassword, resetPassword };

