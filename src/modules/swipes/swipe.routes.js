const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { create } = require('./swipe.controller');

const router = Router();

router.use(authenticate, requireVerification);

router.post('/', create);

module.exports = router;
