const mongoose = require('mongoose');
const Match = require('../matches/match.model');
const { availableAccount } = require('../users/account-status');
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
    verificationStatus: 'approved', deletionRequestedAt: null, ...availableAccount(),
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
  const match = await authorizeChat(userId, matchId);
  const own = String(match.userA) === userId ? 'userA' : 'userB';
  const other = own === 'userA' ? 'userB' : 'userA';
  const filter = { match: matchId };
  if (before) filter._id = { $lt: before };
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(51).lean();
  return {
    messages: rows.slice(0, 50).map(serializeMessage),
    readThrough: {
      me: match.chatReadThrough?.[own] ?? null,
      other: match.chatReadThrough?.[other] ?? null,
    },
    nextCursor: rows.length > 50 ? String(rows[49]._id) : null,
  };
}

async function markChatRead(userId, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
    Object.keys(data).some((key) => !['matchId', 'messageId'].includes(key)) || !validId(data.messageId)) {
    fail('Envía el identificador del mensaje leído', 400);
  }

  const match = await authorizeChat(userId, data.matchId);
  const own = String(match.userA) === userId ? 'userA' : 'userB';
  const other = own === 'userA' ? 'userB' : 'userA';
  const message = await Message.findOne({
    _id: data.messageId, match: match._id, recipient: userId, sender: match[other],
  }).select('_id').lean();
  if (!message) fail('Mensaje no encontrado', 404);

  const previous = await Match.findOneAndUpdate(
    { _id: match._id, status: 'active', [own]: userId },
    { $max: { ['chatReadThrough.' + own]: message._id } },
    { returnDocument: 'before', timestamps: false }
  ).lean();
  if (!previous) fail('Conversación no encontrada', 404);

  const previousId = previous.chatReadThrough?.[own];
  const advanced = !previousId || String(previousId) < String(message._id);
  return {
    advanced,
    otherUserId: match[other],
    receipt: { matchId: match._id, readerId: userId, messageId: advanced ? message._id : previousId },
  };
}

async function listConversations(userId, before) {
  const pageSize = 50;
  let cursorFilter = [];
  if (before !== undefined) {
    if (typeof before !== 'string') fail('Cursor inválido', 400);
    const [timestamp, id, extra] = before.split('_');
    const date = new Date(timestamp);
    if (!validId(id) || extra !== undefined || !Number.isFinite(date.getTime()) ||
      date.toISOString() !== timestamp) fail('Cursor inválido', 400);

    cursorFilter = [{ $match: { $or: [
      { 'lastMessage.createdAt': { $lt: date } },
      { 'lastMessage.createdAt': date, 'lastMessage._id': { $lt: new mongoose.Types.ObjectId(id) } },
    ] } }];
  }

  const member = new mongoose.Types.ObjectId(userId);
  const rows = await Match.aggregate([
    { $match: { status: 'active', $or: [{ userA: member }, { userB: member }] } },
    { $lookup: {
      from: User.collection.name,
      localField: 'userA',
      foreignField: '_id',
      pipeline: [{ $match: { verificationStatus: 'approved', deletionRequestedAt: null, ...availableAccount() } }, { $project: { _id: 1 } }],
      as: 'accountA',
    } },
    { $lookup: {
      from: User.collection.name,
      localField: 'userB',
      foreignField: '_id',
      pipeline: [{ $match: { verificationStatus: 'approved', deletionRequestedAt: null, ...availableAccount() } }, { $project: { _id: 1 } }],
      as: 'accountB',
    } },
    { $match: { 'accountA.0': { $exists: true }, 'accountB.0': { $exists: true } } },
    { $lookup: {
      from: Message.collection.name,
      localField: '_id',
      foreignField: 'match',
      pipeline: [{ $sort: { createdAt: -1, _id: -1 } }, { $limit: 1 }],
      as: 'lastMessage',
    } },
    { $unwind: '$lastMessage' },
    ...cursorFilter,
    { $sort: { 'lastMessage.createdAt': -1, 'lastMessage._id': -1 } },
    { $limit: pageSize + 1 },
  ]);

  const conversations = rows.slice(0, pageSize).map((match) => ({
    id: match._id,
    otherUserId: match.userA.equals(member) ? match.userB : match.userA,
    lastMessage: serializeMessage(match.lastMessage),
    streakDays: match.streak?.current ?? 0,
  }));
  const last = conversations.at(-1)?.lastMessage;
  return {
    conversations,
    nextCursor: rows.length > pageSize ? `${last.createdAt.toISOString()}_${last.id}` : null,
  };
}

module.exports = { sendMessage, getHistory, listConversations, markChatRead };
