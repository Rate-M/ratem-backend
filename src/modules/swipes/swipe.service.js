const mongoose = require('mongoose');
const Swipe = require('./swipe.model');
const User = require('../users/user.model');
const Profile = require('../profiles/profile.model');
const { ensureMutualMatch } = require('../matches/match.service');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function serializeSwipe(swipe) {
  return {
    id: swipe._id,
    to: swipe.to,
    action: swipe.action,
    createdAt: swipe.createdAt,
  };
}

function validateSwipeData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('Envía el perfil y la acción');
  }

  if (Object.keys(data).some((key) => !['to', 'action'].includes(key))) {
    fail('Solo se permiten los campos to y action');
  }

  if (!['like', 'pass'].includes(data.action)) {
    fail('La acción debe ser like o pass');
  }

  if (typeof data.to !== 'string' || !mongoose.isValidObjectId(data.to)) {
    fail('El perfil indicado no es válido');
  }

  return { to: data.to.toLowerCase(), action: data.action };
}

async function createSwipe(userId, data) {
  const { to, action } = validateSwipeData(data);

  if (to === String(userId).toLowerCase()) {
    fail('No puedes evaluar tu propio perfil');
  }

  const target = await User.findOne({
    _id: to,
    verificationStatus: 'approved',
    deletionRequestedAt: null,
  });

  if (!target || !await Profile.exists({ user: to })) {
    fail('Perfil no encontrado', 404);
  }

  const existing = await Swipe.findOne({ from: userId, to });

  if (existing) {
    // Recupera una creación de match interrumpida tras persistir el like.
    if (existing.action === 'like' && action === 'like') await ensureMutualMatch(userId, to);
    fail('Ya evaluaste este perfil', 409);
  }

  let swipe;
  try {
    swipe = await Swipe.create({ from: userId, to, action });
  } catch (error) {
    if (error.code === 11000) {
      fail('Ya evaluaste este perfil', 409);
    }

    throw error;
  }
  const match = action === 'like' ? await ensureMutualMatch(userId, to) : null;
  return { swipe, match };
}

module.exports = { serializeSwipe, createSwipe };
