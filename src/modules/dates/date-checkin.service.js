const mongoose = require('mongoose');
const Match = require('../matches/match.model');
const Consent = require('../consents/consent.model');
const DateInvitation = require('./date-invitation.model');
const DateCheckin = require('./date-checkin.model');
const { CURRENT_VERSIONS } = require('../../config/legal');
const { getDateCheckinSettings } = require('../../config/date-checkin');

const EARTH_RADIUS_METERS = 6371008.8;
const REVIEW_WINDOW_DAYS = 7;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function fail(message, status = 400, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  throw error;
}

function distanceInMeters([longitudeA, latitudeA], [longitudeB, latitudeB]) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function confirmationWindow(invitation, settings) {
  const startsAt = new Date(invitation.startsAt).getTime();
  return {
    opensAt: new Date(startsAt - settings.windowMinutes * MINUTE_MS),
    closesAt: new Date(startsAt + settings.windowMinutes * MINUTE_MS),
  };
}

function confirmationStatus(invitation, now = new Date(), settings = getDateCheckinSettings()) {
  if (invitation.status !== 'accepted') return 'not_applicable';
  if (invitation.confirmedAt) return 'confirmed';

  const { opensAt, closesAt } = confirmationWindow(invitation, settings);

  if (now < opensAt) return 'scheduled';
  if (now <= closesAt) return 'open';
  return 'failed';
}

function serializeConfirmation(invitation, checkins, userId, now, settings) {
  const { opensAt, closesAt } = confirmationWindow(invitation, settings);
  const mine = checkins.find((checkin) => String(checkin.user) === String(userId));
  const other = checkins.find((checkin) => String(checkin.user) !== String(userId));

  return {
    status: confirmationStatus(invitation, now, settings),
    windowOpensAt: opensAt,
    windowClosesAt: closesAt,
    radiusMeters: settings.radiusMeters,
    confirmedAt: invitation.confirmedAt ?? null,
    confirmationMethod: invitation.confirmationMethod ?? null,
    reviewDeadline: invitation.reviewDeadline ?? null,
    yourCheckin: mine
      ? { at: mine.at, withinRadius: mine.withinRadius, distanceMeters: Math.round(mine.distanceMeters) }
      : null,
    otherCheckedIn: Boolean(other?.withinRadius),
    manual: {
      me: (invitation.manualConfirmedBy ?? []).some((id) => String(id) === userId),
      other: (invitation.manualConfirmedBy ?? []).some((id) => String(id) !== userId),
      available: confirmationStatus(invitation, now, settings) === 'failed',
    },
  };
}

async function findInvitation(userId, matchId, invitationId) {
  if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(invitationId)) {
    fail('Invitación no encontrada', 404);
  }

  const match = await Match.findOne({
    _id: matchId,
    status: 'active',
    $or: [{ userA: userId }, { userB: userId }],
  }).lean();

  if (!match) {
    fail('Invitación no encontrada', 404);
  }

  const invitation = await DateInvitation.findOne({ _id: invitationId, match: match._id }).lean();

  if (!invitation) {
    fail('Invitación no encontrada', 404);
  }

  return invitation;
}

function parseLocation(data, settings) {
  if (
    !data || typeof data !== 'object' || Array.isArray(data) ||
    Object.keys(data).some((key) => !['latitude', 'longitude', 'accuracy'].includes(key))
  ) {
    fail('Envía latitude, longitude y accuracy');
  }

  const { latitude, longitude, accuracy } = data;

  if (
    typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    fail('La ubicación no es válida');
  }

  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy <= 0) {
    fail('Envía la precisión del GPS en metros');
  }

  if (accuracy > settings.maxAccuracyMeters) {
    fail(
      `La precisión del GPS (${Math.round(accuracy)} m) no es suficiente. Intenta de nuevo al aire libre o cerca de una ventana`,
      422,
      'LOW_ACCURACY'
    );
  }

  return { latitude, longitude, accuracy };
}

async function getConfirmation(userId, matchId, invitationId, now = new Date()) {
  const settings = getDateCheckinSettings();
  const invitation = await findInvitation(userId, matchId, invitationId);
  const checkins = await DateCheckin.find({ invitation: invitation._id }).lean();
  return serializeConfirmation(invitation, checkins, userId, now, settings);
}

async function checkIn(userId, matchId, invitationId, data, now = new Date()) {
  const settings = getDateCheckinSettings();
  const location = parseLocation(data, settings);
  const invitation = await findInvitation(userId, matchId, invitationId);
  const status = confirmationStatus(invitation, now, settings);

  if (status === 'not_applicable') {
    fail('Solo se puede confirmar una cita aceptada', 409, 'DATE_NOT_ACCEPTED');
  }

  if (status === 'scheduled' || status === 'failed') {
    fail(
      'La confirmación por ubicación solo está disponible una hora antes y una hora después de la cita',
      409,
      'OUTSIDE_WINDOW'
    );
  }

  if (status === 'open') {
    const consent = await Consent.findOne({
      user: userId,
      type: 'location',
      version: CURRENT_VERSIONS.location,
      revokedAt: null,
    });

    if (!consent) {
      fail('Debes otorgar el consentimiento de ubicación para confirmar la cita', 403, 'LOCATION_CONSENT_REQUIRED');
    }

    const distanceMeters = distanceInMeters(
      [location.longitude, location.latitude],
      invitation.coordinates
    );
    const withinRadius = distanceMeters <= settings.radiusMeters;
    const participants = [invitation.sender, invitation.recipient];

    await DateCheckin.findOneAndUpdate(
      { invitation: invitation._id, user: userId, withinRadius: { $ne: true } },
      {
        $set: {
          participants,
          at: now,
          distanceMeters,
          accuracyMeters: location.accuracy,
          withinRadius,
        },
      },
      { upsert: true }
    ).catch((error) => {
      if (error.code !== 11000) throw error;
    });

    const confirmedCheckins = await DateCheckin.countDocuments({
      invitation: invitation._id,
      user: { $in: participants },
      withinRadius: true,
    });

    if (confirmedCheckins === 2) {
      await DateInvitation.updateOne(
        { _id: invitation._id, status: 'accepted', confirmedAt: null },
        {
          $set: {
            confirmedAt: now,
            confirmationMethod: 'location',
            reviewDeadline: new Date(new Date(invitation.startsAt).getTime() + REVIEW_WINDOW_DAYS * DAY_MS),
          },
        }
      );
    }
  }

  return getConfirmation(userId, matchId, invitationId, now);
}

async function confirmManually(userId, matchId, invitationId, now = new Date()) {
  const invitation = await findInvitation(userId, matchId, invitationId);
  const status = confirmationStatus(invitation, now);
  if (status === 'confirmed' && invitation.confirmationMethod === 'manual') {
    return getConfirmation(userId, matchId, invitationId, now);
  }
  if (status !== 'failed') {
    fail('La confirmación manual está disponible después de la ventana de ubicación', 409, 'MANUAL_UNAVAILABLE');
  }

  const participants = [invitation.sender, invitation.recipient];
  await DateInvitation.updateOne(
    { _id: invitation._id, status: 'accepted', confirmedAt: null },
    { $addToSet: { manualConfirmedBy: userId } }
  );
  await DateInvitation.updateOne(
    { _id: invitation._id, status: 'accepted', confirmedAt: null, manualConfirmedBy: { $all: participants } },
    { $set: {
      confirmedAt: now,
      confirmationMethod: 'manual',
      reviewDeadline: new Date(new Date(invitation.startsAt).getTime() + REVIEW_WINDOW_DAYS * DAY_MS),
    } },
    { runValidators: true }
  );
  return getConfirmation(userId, matchId, invitationId, now);
}

module.exports = {
  distanceInMeters,
  confirmationStatus,
  getConfirmation,
  checkIn,
  confirmManually,
};
