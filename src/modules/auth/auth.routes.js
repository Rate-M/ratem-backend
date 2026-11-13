const { Router } = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authenticate = require('../../middlewares/auth');
const {
  register,
  login,
  forgotPasswordHandler,
  resetPasswordHandler,
  verifyEmailHandler,
  getVerificationStatus,
} = require('./auth.controller');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: 'Demasiados intentos, intenta de nuevo en un minuto' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),

    body('password')
      .isLength({ min: 8 })
      .withMessage('La contraseña debe tener al menos 8 caracteres'),

    body('acceptPrivacy')
      .custom((value) => value === true)
      .withMessage('Debes aceptar el aviso de privacidad'),

    body('acceptTerms')
      .custom((value) => value === true)
      .withMessage('Debes aceptar los términos de servicio'),


  ],
  register
);

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
    body('password').notEmpty().withMessage('La contraseña es obligatoria'),
  ],
  login
);

router.post(
  '/forgot-password',
  loginLimiter,
  [body('email').isEmail().withMessage('Correo inválido').normalizeEmail()],
  forgotPasswordHandler
);

router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Token requerido'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('La contraseña debe tener al menos 8 caracteres'),
  ],
  resetPasswordHandler
);
router.get('/verify-email', verifyEmailHandler);
router.get('/verification-status', authenticate, getVerificationStatus);

module.exports = router;
