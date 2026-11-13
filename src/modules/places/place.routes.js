const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { search, details } = require('./place.controller');

const router = Router();

router.use(authenticate, requireVerification);

router.get('/', search);
router.get('/:placeId', details);

module.exports = router;
