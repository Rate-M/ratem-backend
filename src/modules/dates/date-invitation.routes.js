const { Router } = require('express');
const { Types } = require('mongoose');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { hasReachedStreakThreshold } = require('../../config/streak');
const Match = require('../matches/match.model');
const Place = require('../places/place.model');
const User = require('../users/user.model');
const DateInvitation = require('./date-invitation.model');

const router = Router();
router.use(authenticate, requireVerification);

function validId(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

async function findActiveMatch(id, userId) {
  if (!validId(id)) return null;
  const match = await Match.findOne({
    _id: id, status: 'active', $or: [{ userA: userId }, { userB: userId }],
  }).lean();
  if (!match) return null;
  const other = String(match.userA) === userId ? match.userB : match.userA;
  if (!await User.exists({ _id: other, verificationStatus: 'approved', deletionRequestedAt: null })) return null;
  return { match, other };
}

function serialize(invitation, userId) {
  return {
    id: invitation._id,
    matchId: invitation.match,
    direction: String(invitation.sender) === userId ? 'sent' : 'received',
    placeId: invitation.placeId,
    startsAt: invitation.startsAt,
    note: invitation.note,
    status: invitation.status,
    createdAt: invitation.createdAt,
  };
}

router.post('/:matchId/invitations', async (req, res, next) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !['placeId', 'startsAt', 'note'].includes(key))) {
      return res.status(400).json({ message: 'Envía el lugar, la fecha y una nota opcional' });
    }
    const { placeId, startsAt, note = '' } = payload;
    const start = new Date(typeof startsAt === 'string' ? startsAt : NaN);
    if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{10,300}$/.test(placeId) ||
      typeof startsAt !== 'string' || !Number.isFinite(start.getTime()) ||
      start.toISOString() !== startsAt || start.getTime() <= Date.now() ||
      typeof note !== 'string' || note.trim().length > 300) {
      return res.status(400).json({ message: 'Envía un lugar válido, una fecha futura en UTC y una nota de hasta 300 caracteres' });
    }

    const context = await findActiveMatch(req.params.matchId, req.user.id);
    if (!context) return res.status(404).json({ message: 'Match no encontrado' });
    if (!hasReachedStreakThreshold(context.match.streak?.current ?? 0)) {
      return res.status(403).json({ message: 'Aún no alcanzan la racha mínima para invitar a una cita' });
    }
    const place = await Place.findOne({
      googlePlaceId: placeId, status: 'approved', expiresAt: { $gt: new Date() },
    }).lean();
    if (!place) return res.status(404).json({ message: 'Lugar no encontrado' });

    const invitation = await DateInvitation.create({
      match: context.match._id, sender: req.user.id, recipient: context.other,
      placeId, coordinates: place.location.coordinates, startsAt: start, note: note.trim(),
    });
    return res.status(201).json(serialize(invitation, req.user.id));
  } catch (error) { next(error); }
});

router.get('/:matchId/invitations', async (req, res, next) => {
  try {
    const before = req.query.before;
    if (before !== undefined && !validId(before)) return res.status(400).json({ message: 'Cursor inválido' });
    const context = await findActiveMatch(req.params.matchId, req.user.id);
    if (!context) return res.status(404).json({ message: 'Match no encontrado' });

    const filter = { match: context.match._id };
    if (before) filter._id = { $lt: new Types.ObjectId(before) };
    const rows = await DateInvitation.find(filter).sort({ _id: -1 }).limit(51).lean();
    const page = rows.slice(0, 50);
    res.set('Cache-Control', 'no-store');
    return res.json({
      invitations: page.map((row) => serialize(row, req.user.id)),
      nextCursor: rows.length > 50 ? String(page[49]._id) : null,
    });
  } catch (error) { next(error); }
});

module.exports = router;
