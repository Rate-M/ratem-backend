const { validationResult } = require('express-validator');
const { registerUser, loginUser, forgotPassword, resetPassword } = require('./auth.service');

async function register(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await registerUser(req.body);
    res.status(201).json({
      id: user._id,
      email: user.email,
      verificationStatus: user.verificationStatus,
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { token, user } = await loginUser(req.body);
    res.status(200).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        verificationStatus: user.verificationStatus,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function forgotPasswordHandler(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await forgotPassword(req.body);
    res.status(200).json({
      message: 'Si el correo existe, se envió un enlace de recuperación',
    });
  } catch (err) {
    next(err);
  }
}

async function resetPasswordHandler(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await resetPassword(req.body);
    res.status(200).json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, forgotPasswordHandler, resetPasswordHandler };
