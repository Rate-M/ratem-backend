const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { getStreakThresholdDays } = require('../../config/streak');

const router = Router();

router.get('/streak', authenticate, requireVerification, (req, res, next) => {
  try {
    res.status(200).json({ thresholdDays: getStreakThresholdDays() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
