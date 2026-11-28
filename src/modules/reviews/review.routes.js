const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { createReview, getReviewStatus } = require('./review.service');

const router = Router();
router.use(authenticate, requireVerification);

function handleError(error, res, next) {
  if (error.code && error.status && error.status < 500) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }

  return next(error);
}

router.get('/:matchId/invitations/:invitationId/review', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getReviewStatus(req.user.id, req.params.matchId, req.params.invitationId));
  } catch (error) {
    handleError(error, res, next);
  }
});

router.post('/:matchId/invitations/:invitationId/review', async (req, res, next) => {
  try {
    const review = await createReview(req.user.id, req.params.matchId, req.params.invitationId, req.body);
    res.status(201).json(review);
  } catch (error) {
    handleError(error, res, next);
  }
});

module.exports = router;
