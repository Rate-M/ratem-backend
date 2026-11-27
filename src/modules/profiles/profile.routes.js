const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const upload = require('../../middlewares/upload');
const {
  create,
  getMe,
  updateMe,
  getPublic,
  updateLocation,
  deleteLocation,
  updatePreferences,
} = require('./profile.controller');

const router = Router();

router.use(authenticate, requireVerification);

router.post('/me', upload.array('photos', 6), create);
router.get('/me', getMe);
router.patch('/me', updateMe);
router.put('/me/location', updateLocation);
router.delete('/me/location', deleteLocation);
router.patch('/me/preferences', updatePreferences);
router.get('/:id', getPublic);

module.exports = router;
