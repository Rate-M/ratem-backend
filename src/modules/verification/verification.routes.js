const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const { start, webhook } = require('./verification.controller');

const router = Router();

router.post('/webhook', webhook);
router.post('/sessions', authenticate, start);

module.exports = router;
