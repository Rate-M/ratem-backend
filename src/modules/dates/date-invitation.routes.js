const { Router } = require('express');
const { Types } = require('mongoose');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const { hasReachedStreakThreshold } = require('../../config/streak');
const Match = require('../matches/match.model');
const Place = require('../places/place.model');
const { availableAccount } = require('../users/account-status');
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
  if (!await User.exists({ _id: other, verificationStatus: 'approved', deletionRequestedAt: null, ...availableAccount() })) return null;
  return { match, other };
}

function parseFutureDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return date.getTime() > Date.now() && date.toISOString() === value ? date : null;
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
    revision: invitation.revision ?? 0,
    awaitingYourResponse: invitation.status === 'pending' &&
      String(invitation.proposedBy ?? invitation.sender) !== userId,
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
    const start = parseFutureDate(startsAt);
    if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{10,300}$/.test(placeId) ||
      !start ||
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

router.patch('/:matchId/invitations/:invitationId', async (req, res, next) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !['action', 'revision', 'startsAt'].includes(key))) {
      return res.status(400).json({ message: 'Envía la acción y la revisión de la invitación' });
    }
    const { action, revision, startsAt } = payload;
    const proposedDate = action === 'propose' ? parseFutureDate(startsAt) : null;
    if (!['accept', 'decline', 'propose'].includes(action) || !Number.isSafeInteger(revision) || revision < 0 ||
      (action === 'propose' ? !proposedDate : startsAt !== undefined)) {
      return res.status(400).json({ message: 'La respuesta o la nueva fecha no es válida' });
    }

    const context = await findActiveMatch(req.params.matchId, req.user.id);
    if (!context || !validId(req.params.invitationId)) {
      return res.status(404).json({ message: 'Invitación no encontrada' });
    }
    const filter = { _id: req.params.invitationId, match: context.match._id };
    const invitation = await DateInvitation.findOne(filter).lean();
    if (!invitation) return res.status(404).json({ message: 'Invitación no encontrada' });

    if (invitation.status !== 'pending' || (invitation.revision ?? 0) !== revision) {
      return res.status(409).json({ message: 'La invitación cambió. Actualízala antes de responder' });
    }
    if (String(invitation.proposedBy ?? invitation.sender) === req.user.id) {
      return res.status(403).json({ message: 'La otra persona debe responder a esta propuesta' });
    }
    if (action === 'accept' && invitation.startsAt.getTime() <= Date.now()) {
      return res.status(409).json({ message: 'La hora de la cita ya pasó. Propón una hora nueva' });
    }
    if (proposedDate?.getTime() === invitation.startsAt.getTime()) {
      return res.status(400).json({ message: 'Propón una hora distinta' });
    }

    const $set = proposedDate
      ? { startsAt: proposedDate, proposedBy: req.user.id }
      : { status: action === 'accept' ? 'accepted' : 'declined' };
    const updated = await DateInvitation.findOneAndUpdate({
      ...filter, status: 'pending',
      ...(revision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision }),
    }, { $set, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true });

    if (!updated) return res.status(409).json({ message: 'La invitación cambió. Actualízala antes de responder' });
    return res.json(serialize(updated, req.user.id));
  } catch (error) { next(error); }
});

module.exports = router;
