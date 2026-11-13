const { Router } = require('express');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { listMatches, markNotificationRead } = require('./match.service');

const matchRoutes = Router();
const notificationRoutes = Router();
matchRoutes.use(authenticate, requireVerification);
notificationRoutes.use(authenticate, requireVerification);

matchRoutes.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await listMatches(req.user.id, { before: req.query.before }));
  } catch (error) { next(error); }
});

notificationRoutes.get('/', async (req, res, next) => {
  try {
    const { matches, nextCursor } = await listMatches(req.user.id, {
      before: req.query.before, unreadOnly: true,
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      notifications: matches.map((match) => ({
        id: match.id, type: 'match', matchId: match.id,
        otherUserId: match.users.find((id) => String(id) !== req.user.id),
        createdAt: match.createdAt,
      })),
      nextCursor,
    });
  } catch (error) { next(error); }
});

notificationRoutes.patch('/:id/read', async (req, res, next) => {
  try {
    if (!await markNotificationRead(req.user.id, req.params.id)) {
      return res.status(404).json({ message: 'Notificación no encontrada' });
    }
    res.sendStatus(204);
  } catch (error) { next(error); }
});

module.exports = { matchRoutes, notificationRoutes };
