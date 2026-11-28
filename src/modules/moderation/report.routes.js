const { Router } = require('express');
const { STREAK_TIMEZONE, localDate, localMidnight } = require('../streaks/streak.service');
const authenticate = require('../../middlewares/auth');
const requireVerification = require('../../middlewares/require-verification');
const Message = require('../messages/message.model');
const Profile = require('../profiles/profile.model');
const Report = require('./report.model');
const { availableAccount } = require('../users/account-status');
const User = require('../users/user.model');

const reportRoutes = Router();
const moderationRoutes = Router();
const types = ['message', 'profile', 'photo'];
const statuses = ['pending', 'in_review', 'resolved'];
const objectId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);

function authorize(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.account.role)) return res.status(403).json({ message: 'Acceso restringido' });
    next();
  };
}

function metadata(report) {
  return {
    id: report._id, type: report.type, reporter: report.reporter, reportedUser: report.reportedUser,
    reason: report.reason, priority: report.priority, status: report.status, createdAt: report.createdAt,
  };
}

reportRoutes.post('/', authenticate, requireVerification, async (req, res, next) => {
  try {
    const { type, targetId, photo, reason } = req.body ?? {};
    if (!types.includes(type) || !objectId(targetId) || typeof reason !== 'string' ||
      !reason.trim() || reason.trim().length > 300 ||
      (type === 'photo' ? typeof photo !== 'string' || photo.length > 300 : photo !== undefined)) {
      return res.status(400).json({ message: 'El contenido o el motivo del reporte no es válido' });
    }
    const creator = req.user.id;
    let reportedUser;
    if (type === 'message') {
      const message = await Message.findOne({ _id: targetId, recipient: creator }).select('sender').lean();
      reportedUser = message?.sender;
    } else {
      const profile = await Profile.findOne({
        user: targetId, ...(type === 'photo' ? { photos: photo } : {}),
      }).select('user').lean();
      reportedUser = profile?.user;
    }
    if (!reportedUser || String(reportedUser) === creator) {
      return res.status(404).json({ message: 'Contenido no encontrado' });
    }

    const report = await Report.create({
      type, target: targetId, reporter: creator, reportedUser, photo: photo ?? null, reason: reason.trim(),
    });
    return res.status(201).json({ id: report._id, status: report.status });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Este contenido ya fue reportado por tu cuenta' });
    next(error);
  }
});

moderationRoutes.use(authenticate, authorize(['moderator', 'admin']), (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

moderationRoutes.get('/reports', async (req, res, next) => {
  try {
    const { type, status, page = '1', q = '' } = req.query;
    const pageNumber = Number(page);
    if ((type !== undefined && !types.includes(type)) ||
      (status !== undefined && !statuses.includes(status)) ||
      typeof page !== 'string' || !/^[1-9]\d{0,3}$/.test(page) || typeof q !== 'string' || q.length > 100) {
      return res.status(400).json({ message: 'Filtros de reportes inválidos' });
    }
    const filter = { ...(type ? { type } : {}), ...(status ? { status } : {}) };
    if (q.trim()) {
      const term = q.trim();
      const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await Profile.find({ name: pattern }).distinct('user');
      filter.$or = [{ reason: pattern }, { reporter: { $in: users } }, { reportedUser: { $in: users } }];
      if (objectId(term)) filter.$or.push({ _id: term }, { reporter: term }, { reportedUser: term });
    }
    const today = localMidnight(localDate(new Date(), STREAK_TIMEZONE));
    const [rows, [summary]] = await Promise.all([
      Report.find(filter).sort({ priority: -1, _id: -1 }).skip((pageNumber - 1) * 50).limit(51).lean(),
      Report.aggregate([{ $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        resolvedToday: [{ $match: { audit: { $elemMatch: { status: 'resolved', at: { $gte: today } } } } }, { $count: 'count' }],
        responseTime: [
          { $match: { 'audit.0': { $exists: true } } },
          { $project: { firstAction: { $arrayElemAt: ['$audit.at', 0] }, createdAt: 1 } },
          { $group: { _id: null, averageMs: { $avg: { $subtract: ['$firstAction', '$createdAt'] } } } },
        ],
      } }]),
    ]);
    const pageRows = rows.slice(0, 50);
    const profileIds = pageRows.flatMap((row) => [row.reporter, row.reportedUser]);
    const profiles = await Profile.find({ user: { $in: profileIds } }).select('user name').lean();
    const names = new Map(profiles.map((profile) => [String(profile.user), profile.name]));
    const counts = (values, bucket) => Object.fromEntries(values.map((value) => [
      value, bucket.find((row) => row._id === value)?.count ?? 0,
    ]));
    res.json({
      reports: pageRows.map((row) => ({
        ...metadata(row),
        reporterName: names.get(String(row.reporter)) ?? null,
        reportedUserName: names.get(String(row.reportedUser)) ?? null,
      })),
      nextPage: rows.length > 50 ? pageNumber + 1 : null,
      counts: counts(statuses, summary.byStatus),
      typeCounts: counts(types, summary.byType),
      resolvedToday: summary.resolvedToday[0]?.count ?? 0,
      averageResponseMs: summary.responseTime[0]?.averageMs ?? null,
    });
  } catch (error) { next(error); }
});

moderationRoutes.get('/reports/:id', async (req, res, next) => {
  try {
    const report = objectId(req.params.id) && await Report.findById(req.params.id).lean();
    if (!report) return res.status(404).json({ message: 'Reporte no encontrado' });

    let content = null;
    if (report.type === 'message') {
      const message = await Message.findOne({
        _id: report.target, sender: report.reportedUser, recipient: report.reporter,
      }).select('text createdAt').lean();
      if (message) content = { text: message.text, createdAt: message.createdAt };
    } else if (report.type === 'photo') {
      if (await Profile.exists({ user: report.reportedUser, photos: report.photo })) content = { photo: report.photo };
    } else {
      const profile = await Profile.findOne({ user: report.reportedUser }).select('name bio').lean();
      if (profile) content = { name: profile.name, bio: profile.bio };
    }
    return res.json({ ...metadata(report), content, audit: report.audit });
  } catch (error) { next(error); }
});

moderationRoutes.patch('/reports/:id', async (req, res, next) => {
  try {
    const { status, note = '' } = req.body ?? {};
    if (!['in_review', 'resolved'].includes(status) || typeof note !== 'string' || note.trim().length > 500) {
      return res.status(400).json({ message: 'Decisión inválida' });
    }
    if (!objectId(req.params.id)) return res.status(404).json({ message: 'Reporte no encontrado' });
    const from = status === 'in_review' ? ['pending'] : ['pending', 'in_review'];
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, status: { $in: from } },
      { $set: { status }, $push: { audit: { actor: req.user.id, status, note: note.trim(), at: new Date() } } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    if (!report) {
      const exists = await Report.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ message: exists ? 'El reporte ya cambió de estado' : 'Reporte no encontrado' });
    }
    return res.json({ ...metadata(report), audit: report.audit });
  } catch (error) { next(error); }
});

moderationRoutes.patch('/users/:id/role', authorize(['admin']), async (req, res, next) => {
  try {
    const { role } = req.body ?? {};
    if (!['user', 'moderator'].includes(role)) return res.status(400).json({ message: 'Rol inválido' });
    if (!objectId(req.params.id)) return res.status(404).json({ message: 'Cuenta no encontrada' });

    const filter = {
      _id: req.params.id, deletionRequestedAt: null, emailVerified: true,
      ...(role === 'moderator' ? availableAccount() : {}),
    };
    const account = await User.findOneAndUpdate(
      { ...filter, role: role === 'moderator' ? 'user' : 'moderator' },
      { $set: { role }, $push: { roleHistory: { actor: req.user.id, role, at: new Date() } } },
      { returnDocument: 'after', runValidators: true, projection: { role: 1 } }
    ).lean();
    if (!account && !await User.exists({ ...filter, role })) {
      return res.status(404).json({ message: 'Cuenta no disponible para cambiar el rol' });
    }
    return res.json({ id: req.params.id.toLowerCase(), role });
  } catch (error) { next(error); }
});

moderationRoutes.use(require('./support.routes'));

module.exports = { reportRoutes, moderationRoutes };
