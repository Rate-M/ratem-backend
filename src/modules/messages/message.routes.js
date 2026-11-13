const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { getHistory } = require('./message.service');

const router = Router();
router.get('/:id/messages', authenticate, requireVerification, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getHistory(req.user.id, req.params.id, req.query.before));
  } catch (error) { next(error); }
});

module.exports = router;
