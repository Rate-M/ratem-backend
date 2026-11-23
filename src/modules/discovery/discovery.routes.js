const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { discoverProfiles } = require('./discovery.service');

const router = Router();

router.get('/', authenticate, requireVerification, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.status(200).json(await discoverProfiles(req.user.id, req.query));
  } catch (error) {
    if (error.code === 'PROFILE_REQUIRED' || error.code === 'LOCATION_REQUIRED') {
      return res.status(error.status).json({ message: error.message, code: error.code });
    }

    next(error);
  }
});

module.exports = router;
