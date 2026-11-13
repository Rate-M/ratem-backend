const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../../middlewares/auth');
const { requestDeletion } = require('./user-deletion.service');

const router = Router();
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos, intenta de nuevo en un minuto' },
});

router.post('/me/deletion-requests', authenticate, limiter, async (req, res, next) => {
  if (
    !req.body || typeof req.body.password !== 'string' || !req.body.password ||
    req.body.confirmDeletion !== true ||
    Object.keys(req.body).some((key) => !['password', 'confirmDeletion'].includes(key))
  ) {
    return res.status(400).json({ message: 'Confirma la eliminación y proporciona tu contraseña' });
  }
  try {
    await requestDeletion(req.user.id, req.body.password);
    res.status(202).json({
      message: 'Solicitud de eliminación recibida. Tu cuenta ha sido deshabilitada',
      status: 'pending',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
