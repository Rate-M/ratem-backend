const mongoose = require('mongoose');
const Report = require('../moderation/report.model');
const Review = require('./review.model');
const DateInvitation = require('../dates/date-invitation.model');
const { assertReviewCommentAllowed } = require('./review-moderation');

const HIDE_AFTER_REPORTS = 3;
const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function fail(message, status = 400, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  throw error;
}

function reviewDeadline(invitation) {
  return invitation.reviewDeadline
    ? new Date(invitation.reviewDeadline)
    : new Date(new Date(invitation.startsAt).getTime() + REVIEW_WINDOW_MS);
}

function serializeReview(review, publishedAt = null) {
  return {
    id: review._id,
    rating: review.rating,
    comment: review.comment,
    status: publishedAt ? 'published' : 'hidden',
    publishedAt,
    createdAt: review.createdAt,
  };
}

async function findReviewableInvitation(userId, matchId, invitationId) {
  if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(invitationId)) {
    fail('Cita no encontrada', 404);
  }

  const invitation = await DateInvitation.findOne({
    _id: invitationId,
    match: matchId,
    $or: [{ sender: userId }, { recipient: userId }],
  }).lean();

  if (!invitation) {
    fail('Cita no encontrada', 404);
  }

  return invitation;
}

function parseReviewData(data) {
  if (
    !data || typeof data !== 'object' || Array.isArray(data) ||
    Object.keys(data).some((key) => !['rating', 'comment'].includes(key))
  ) {
    fail('Envía la calificación y un comentario opcional');
  }

  const { rating, comment = '' } = data;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail('La calificación debe ser un entero del 1 al 5');
  }

  if (typeof comment !== 'string' || comment.trim().length > 300) {
    fail('El comentario debe tener máximo 300 caracteres');
  }

  const trimmed = comment.trim();

  if (trimmed) {
    assertReviewCommentAllowed(trimmed);
  }

  return { rating, comment: trimmed };
}

async function createReview(userId, matchId, invitationId, data, now = new Date()) {
  const { rating, comment } = parseReviewData(data);
  const invitation = await findReviewableInvitation(userId, matchId, invitationId);

  if (!invitation.confirmedAt) {
    fail('Solo puedes calificar una cita confirmada', 409, 'DATE_NOT_CONFIRMED');
  }

  if (now > reviewDeadline(invitation)) {
    fail('El plazo de 7 días para calificar esta cita ya terminó', 409, 'REVIEW_WINDOW_CLOSED');
  }

  const subject = String(invitation.sender) === String(userId)
    ? invitation.recipient
    : invitation.sender;

  let review;
  try {
    review = await Review.create({
      dateEvent: invitation._id, match: invitation.match, author: userId, subject, rating, comment,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    review = await Review.findOne({ dateEvent: invitation._id, author: userId }).lean();
    if (!review || review.rating !== rating || review.comment !== comment) {
      fail('Ya calificaste esta cita', 409, 'ALREADY_REVIEWED');
    }
  }

  const publishedAt = await publishWhenMutual(invitation);
  return serializeReview(review, publishedAt);
}

async function publishWhenMutual(invitation) {
  if (!invitation.confirmedAt) return null;
  if (invitation.reviewsPublishedAt) return invitation.reviewsPublishedAt;
  const reviews = await Review.find({
    dateEvent: invitation._id, author: { $in: [invitation.sender, invitation.recipient] },
    createdAt: { $lte: reviewDeadline(invitation) },
  }).select('createdAt').lean();
  if (reviews.length !== 2) return null;

  const publishedAt = new Date(Math.max(...reviews.map((review) => review.createdAt.getTime())));
  await DateInvitation.updateOne(
    { _id: invitation._id, reviewsPublishedAt: null }, { $set: { reviewsPublishedAt: publishedAt } }
  );
  return publishedAt;
}

async function getReviewStatus(userId, matchId, invitationId, now = new Date()) {
  const invitation = await findReviewableInvitation(userId, matchId, invitationId);
  const reviews = await Review.find({ dateEvent: invitation._id }).lean();
  const publishedAt = await publishWhenMutual(invitation);
  const mine = reviews.find((review) => String(review.author) === String(userId));
  const other = reviews.find((review) => String(review.author) !== String(userId));
  const visibleToParticipant = publishedAt && other &&
    await Report.countDocuments({ type: 'review', target: other._id }) < HIDE_AFTER_REPORTS;
  const deadline = reviewDeadline(invitation);

  return {
    canReview: Boolean(invitation.confirmedAt) && !mine && now <= deadline,
    reviewDeadline: invitation.confirmedAt ? deadline : null,
    yourReview: mine ? serializeReview(mine, publishedAt) : null,
    otherReview: visibleToParticipant ? serializeReview(other, publishedAt) : null,
    otherReviewed: Boolean(other),
  };
}

async function getPublishedReviews(subject) {
  const rows = await Review.aggregate([
    { $match: { subject: new mongoose.Types.ObjectId(subject) } },
    { $lookup: {
      from: Report.collection.name, localField: '_id', foreignField: 'target',
      pipeline: [{ $match: { type: 'review' } }, { $limit: HIDE_AFTER_REPORTS }, { $project: { _id: 1 } }],
      as: 'reportFlags',
    } },
    { $match: { ['reportFlags.' + (HIDE_AFTER_REPORTS - 1)]: { $exists: false } } },
    { $lookup: { from: DateInvitation.collection.name, localField: 'dateEvent', foreignField: '_id', as: 'date' } },
    { $unwind: '$date' },
    { $match: { 'date.reviewsPublishedAt': { $type: 'date' } } },
    { $sort: { 'date.reviewsPublishedAt': -1, _id: -1 } },
    { $facet: {
      items: [{ $limit: 20 }, { $project: { rating: 1, comment: 1, publishedAt: '$date.reviewsPublishedAt' } }],
      summary: [{ $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } }],
    } },
  ]);
  const [result] = rows;
  return {
    reviews: result.items.map(({ _id, ...entry }) => ({ id: _id, ...entry })),
    reviewCount: result.summary[0]?.count ?? 0,
    averageRating: result.summary[0]?.average ?? null,
  };
}

module.exports = { getPublishedReviews, createReview, getReviewStatus, serializeReview };
