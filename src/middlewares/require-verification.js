const User = require('../modules/users/user.model');

async function requireVerification(req, res, next) {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    if (user.verificationStatus !== 'approved') {
      return res.status(403).json({
        message: 'Debes tener la verificación de identidad aprobada',
        code: 'IDENTITY_VERIFICATION_REQUIRED',
        verificationStatus: user.verificationStatus || 'pending',
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireVerification;
