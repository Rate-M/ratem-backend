const Match = require('../matches/match.model');
const User = require('../users/user.model');
const Message = require('./message.model');

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function validId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
}

function serializeMessage(message) {
  return {
    id: message._id,
    matchId: message.match,
    senderId: message.sender,
    recipientId: message.recipient,
    clientMessageId: message.clientMessageId,
    text: message.text,
    createdAt: message.createdAt,
  };
}

async function authorizeChat(userId, matchId) {
  if (!validId(matchId)) fail('Conversación no encontrada', 404);
  const match = await Match.findOne({
    _id: matchId, status: 'active', $or: [{ userA: userId }, { userB: userId }],
  });
  if (!match) fail('Conversación no encontrada', 404);

  const available = await User.countDocuments({
    _id: { $in: [match.userA, match.userB] },
    verificationStatus: 'approved', deletionRequestedAt: null,
  });
  if (available !== 2) fail('Conversación no disponible', 403);
  return match;
}

async function sendMessage(userId, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
    Object.keys(data).some((key) => !['matchId', 'clientMessageId', 'text'].includes(key)) ||
    typeof data.clientMessageId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(data.clientMessageId) ||
    typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2000) {
    fail('Envía matchId, clientMessageId y un texto de entre 1 y 2000 caracteres', 400);
  }
  const match = await authorizeChat(userId, data.matchId);
  const recipient = String(match.userA) === userId ? match.userB : match.userA;
  const fields = {
    match: match._id, sender: userId, recipient,
    clientMessageId: data.clientMessageId, text: data.text.trim(),
  };
  let message;
  try {
    message = await Message.create(fields);
  } catch (error) {
    if (error.code !== 11000) throw error;
    message = await Message.findOne({
      match: match._id, sender: userId, clientMessageId: data.clientMessageId,
    });
    if (!message) throw error;
    if (message.text !== fields.text) fail('El identificador ya corresponde a otro mensaje', 409);
  }
  return serializeMessage(message);
}

async function getHistory(userId, matchId, before) {
  if (before !== undefined && !validId(before)) fail('Cursor inválido', 400);
  await authorizeChat(userId, matchId);
  const filter = { match: matchId };
  if (before) filter._id = { $lt: before };
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(51).lean();
  return {
    messages: rows.slice(0, 50).map(serializeMessage),
    nextCursor: rows.length > 50 ? String(rows[49]._id) : null,
  };
}

module.exports = { sendMessage, getHistory };
