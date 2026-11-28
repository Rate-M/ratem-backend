const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { checkIn, getConfirmation } = require('./date-checkin.service');

const router = Router();
router.use(authenticate, requireVerification);

function handleError(error, res, next) {
  if (error.code && error.status && error.status < 500) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }

  return next(error);
}

router.get('/:matchId/invitations/:invitationId/confirmation', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getConfirmation(req.user.id, req.params.matchId, req.params.invitationId));
  } catch (error) {
    handleError(error, res, next);
  }
});

router.post('/:matchId/invitations/:invitationId/check-ins', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await checkIn(req.user.id, req.params.matchId, req.params.invitationId, req.body));
  } catch (error) {
    handleError(error, res, next);
  }
});

module.exports = router;
