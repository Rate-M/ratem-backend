const { Router } = require('express');
const { Types } = require('mongoose');
const Place = require('../places/place.model');
const Profile = require('../profiles/profile.model');
const User = require('../users/user.model');
const Verification = require('../verification/verification.model');
const Report = require('./report.model');

const router = Router();
const idPattern = /^[a-f0-9]{24}$/i;
const placeStatuses = ['pending', 'approved', 'rejected'];
const accountStatuses = ['active', 'watch', 'suspended'];
const verificationStatuses = ['pending', 'approved', 'rejected', 'expired'];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function textFilter(value) {
  return typeof value === 'string' && value.length <= 100;
}

function pageNumber(value = '1') {
  return typeof value === 'string' && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : null;
}

async function page(model, filter, projection, number, order = -1) {
  const rows = await model.find(filter).select(projection).sort({ _id: order })
    .skip((number - 1) * 50).limit(51).lean();
  return { items: rows.slice(0, 50), nextPage: rows.length > 50 ? number + 1 : null };
}

router.get('/places', async (req, res, next) => {
  try {
    const { status, q = '' } = req.query;
    const number = pageNumber(req.query.page);
    if (!number || !textFilter(q) || (status !== undefined && !placeStatuses.includes(status))) {
      return res.status(400).json({ message: 'Filtros inválidos' });
    }
    const filter = { source: 'community' };
    if (status) filter.status = status;
    if (q.trim()) {
      const regex = new RegExp(escapeRegex(q.trim()), 'i');
      filter.$or = [{ name: regex }, { address: regex }];
    }
    return res.json(await page(Place, filter,
      'name category address hours location createdBy status createdAt moderation', number, 1));
  } catch (error) { next(error); }
});

router.patch('/places/:id', async (req, res, next) => {
  try {
    const { status, reason = '' } = req.body ?? {};
    if (!idPattern.test(req.params.id) || !['approved', 'rejected'].includes(status) ||
      typeof reason !== 'string' || reason.trim().length > 300 || (status === 'rejected' && !reason.trim())) {
      return res.status(400).json({ message: 'Decisión inválida' });
    }
    const decision = { actor: req.user.id, state: status, note: reason.trim(), at: new Date() };
    const place = await Place.findOneAndUpdate(
      { _id: req.params.id, source: 'community', status: 'pending' },
      { $set: { status, moderation: decision } },
      { returnDocument: 'after', runValidators: true, projection: { status: 1, moderation: 1 } }
    ).lean();
    if (!place) return res.status(409).json({ message: 'La propuesta ya no está pendiente o no existe' });
    return res.json(place);
  } catch (error) { next(error); }
});

router.get('/users', async (req, res, next) => {
  try {
    const { status, verification, q = '' } = req.query;
    const number = pageNumber(req.query.page);
    if (!number || !textFilter(q) || (status !== undefined && !accountStatuses.includes(status)) ||
      (verification !== undefined && !['pending', 'approved', 'rejected'].includes(verification))) {
      return res.status(400).json({ message: 'Filtros inválidos' });
    }
    const filter = { deletionRequestedAt: null };
    const now = new Date();
    if (status === 'suspended') filter.$or = [{ suspendedUntil: { $gt: now } }, { suspendedPermanently: true }];
    if (status === 'active' || status === 'watch') {
      filter.suspendedPermanently = { $ne: true };
      filter.$or = [{ suspendedUntil: null }, { suspendedUntil: { $lte: now } }];
      filter.underWatch = status === 'watch' ? true : { $ne: true };
    }
    if (verification) filter.verificationStatus = verification;
    if (q.trim()) {
      const term = q.trim();
      const regex = new RegExp(escapeRegex(term), 'i');
      const names = await Profile.find({ name: regex }).distinct('user');
      const matches = [{ email: regex }, { _id: { $in: names } }];
      if (idPattern.test(term)) matches.push({ _id: term });
      filter.$and = [{ $or: matches }];
    }
    const result = await page(User, filter,
      'email role verificationStatus emailVerified underWatch suspendedUntil suspendedPermanently createdAt', number);
    const ids = result.items.map((user) => user._id);
    const [profiles, counts] = await Promise.all([
      Profile.find({ user: { $in: ids } }).select('user name').lean(),
      Report.aggregate([{ $match: { reportedUser: { $in: ids } } }, { $group: { _id: '$reportedUser', count: { $sum: 1 } } }]),
    ]);
    const names = new Map(profiles.map((profile) => [String(profile.user), profile.name]));
    const reports = new Map(counts.map((row) => [String(row._id), row.count]));
    result.items = result.items.map((user) => ({
      ...user,
      name: names.get(String(user._id)) ?? null,
      reportCount: reports.get(String(user._id)) ?? 0,
      status: user.suspendedPermanently || user.suspendedUntil > now ? 'suspended' : user.underWatch ? 'watch' : 'active',
    }));
    return res.json(result);
  } catch (error) { next(error); }
});

router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { action, days, reason } = req.body ?? {};
    if (!idPattern.test(req.params.id) || !['warn', 'watch', 'suspend', 'ban', 'restore'].includes(action) ||
      typeof reason !== 'string' || !reason.trim() || reason.trim().length > 300 ||
      (action === 'suspend' ? !Number.isInteger(days) || days < 1 || days > 30 : days !== undefined)) {
      return res.status(400).json({ message: 'Acción o motivo inválido' });
    }
    const admin = req.account.role === 'admin';
    if (action === 'ban' && !admin) return res.status(403).json({ message: 'Acceso restringido' });
    const now = new Date();
    const updates = {
      warn: {},
      watch: { underWatch: true },
      suspend: { suspendedUntil: new Date(now.getTime() + days * 86400000) },
      ban: { suspendedPermanently: true },
      restore: { underWatch: false, suspendedUntil: null, suspendedPermanently: false },
    };
    const account = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'user', deletionRequestedAt: null, ...(!admin ? { suspendedPermanently: { $ne: true } } : {}) },
      { $set: updates[action], $push: { moderationHistory: { actor: req.user.id, state: action, note: reason.trim(), at: now } } },
      { returnDocument: 'after', projection: { underWatch: 1, suspendedUntil: 1, suspendedPermanently: 1 }, runValidators: true }
    ).lean();
    if (!account) return res.status(404).json({ message: 'Cuenta no disponible para esta acción' });
    return res.json(account);
  } catch (error) { next(error); }
});

router.get('/verifications', async (req, res, next) => {
  try {
    const { status, user, q = '' } = req.query;
    const number = pageNumber(req.query.page);
    if (!number || !textFilter(q) || (user !== undefined && (typeof user !== 'string' || !idPattern.test(user))) ||
      (status !== undefined && !verificationStatuses.includes(status))) {
      return res.status(400).json({ message: 'Filtros inválidos' });
    }
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (q.trim()) {
      const term = q.trim();
      const ids = await Profile.find({ name: new RegExp(escapeRegex(term), 'i') }).distinct('user');
      filter.$or = [{ user: { $in: ids } }];
      if (idPattern.test(term)) filter.$or.push({ _id: term }, { user: term });
    }
    return res.json(await page(Verification, filter,
      'user provider status providerStatus decidedAt createdAt supportReview', number, 1));
  } catch (error) { next(error); }
});

router.patch('/verifications/:id/review', async (req, res, next) => {
  try {
    const { note } = req.body ?? {};
    if (!idPattern.test(req.params.id) || typeof note !== 'string' || !note.trim() || note.trim().length > 300) {
      return res.status(400).json({ message: 'Nota de revisión inválida' });
    }
    const review = { actor: req.user.id, state: 'reviewed', note: note.trim(), at: new Date() };
    const session = await Verification.findOneAndUpdate(
      { _id: req.params.id, supportReview: null }, { $set: { supportReview: review } },
      { returnDocument: 'after', runValidators: true, projection: { status: 1, supportReview: 1 } }
    ).lean();
    if (!session) return res.status(409).json({ message: 'La sesión ya fue revisada o no existe' });
    return res.json(session);
  } catch (error) { next(error); }
});

function activitySource(model, path, category, { many = true, state = 'state' } = {}) {
  const activity = '$' + path;
  return {
    coll: model.collection.name,
    pipeline: [
      { $match: { [path + '.at']: { $exists: true } } },
      ...(many ? [{ $unwind: activity }] : []),
      { $project: {
        category: { $literal: category }, actor: activity + '.actor', at: activity + '.at',
        action: activity + '.' + state, note: { $ifNull: [activity + '.note', ''] },
      } },
    ],
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return '"' + (/^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"';
}

router.get('/activity', async (req, res, next) => {
  try {
    const { category, actor, format = 'json' } = req.query;
    const number = pageNumber(req.query.page);
    const sources = [
      activitySource(Report, 'audit', 'reports', { state: 'status' }),
      activitySource(Place, 'moderation', 'places', { many: false }),
      activitySource(User, 'moderationHistory', 'users'),
      activitySource(User, 'roleHistory', 'users', { state: 'role' }),
      activitySource(Verification, 'supportReview', 'verifications', { many: false }),
    ];
    if (!number || !['json', 'csv'].includes(format) ||
      (category !== undefined && !['reports', 'places', 'users', 'verifications'].includes(category)) ||
      (actor !== undefined && (typeof actor !== 'string' || !idPattern.test(actor)))) {
      return res.status(400).json({ message: 'Filtros inválidos' });
    }
    const [first, ...rest] = sources;
    const filters = { ...(category ? { category } : {}), ...(actor ? { actor: new Types.ObjectId(actor) } : {}) };
    const limit = format === 'csv' ? 500 : 50;
    const rows = await Report.aggregate([
      ...first.pipeline, ...rest.map((source) => ({ $unionWith: source })), { $match: filters },
      { $sort: { at: -1, _id: -1, category: 1, action: 1 } },
      { $skip: (number - 1) * limit }, { $limit: limit + 1 },
    ]);
    const items = rows.slice(0, limit);
    const nextPage = rows.length > limit ? number + 1 : null;
    if (format === 'json') return res.json({ items, nextPage });
    if (nextPage) res.set('X-Next-Page', String(nextPage));
    const csv = ['fecha,categoria,referencia,actor,accion,nota', ...items.map((row) =>
      [row.at.toISOString(), row.category, row._id, row.actor, row.action, row.note].map(csvCell).join(','))];
    return res.attachment('actividad-soporte.csv').type('text/csv').send(csv.join('\r\n') + '\r\n');
  } catch (error) { next(error); }
});

module.exports = router;
