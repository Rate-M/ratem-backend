const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const { accept, revoke, list } = require('./consent.controller');

const router = Router();

router.use(authenticate);

router.get('/me', list);
router.post('/:type', accept);
router.delete('/:type', revoke);

module.exports = router;