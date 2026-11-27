const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Match = require('../src/modules/matches/match.model');
const Message = require('../src/modules/messages/message.model');

let server;

beforeAll(async () => {
  process.env.JWT_SECRET = 'conversations-test-secret';
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Match.init(), Message.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

test('Ordena por mensaje reciente, pagina empates y oculta conversaciones no disponibles', async () => {
  const [me, ...people] = await User.insertMany(Array.from({ length: 55 }, (_, i) => ({
    email: `person-${i}@example.com`,
    passwordHash: 'hash',
    verificationStatus: i === 54 ? 'pending' : 'approved',
  })));
  const matches = await Match.insertMany(people.map((person, i) => ({
    userA: i % 2 ? me._id : person._id,
    userB: i % 2 ? person._id : me._id,
    status: i === 52 ? 'ended' : 'active',
    streak: { current: i },
  })));
  const sameDate = new Date('2026-11-26T18:00:00Z');
  const recentDate = new Date('2026-11-27T18:00:00Z');
  const messages = await Message.insertMany(matches.flatMap((match, i) => i === 51 ? [] : [{
    match: match._id,
    sender: match.userA,
    recipient: match.userB,
    clientMessageId: 'first',
    text: 'Hola',
    createdAt: i === 0 ? recentDate : sameDate,
  }]));
  await Message.create({
    match: matches[0]._id,
    sender: matches[0].userB,
    recipient: matches[0].userA,
    clientMessageId: 'older',
    text: 'Anterior',
    createdAt: sameDate,
  });

  const token = jwt.sign({ sub: String(me._id) }, process.env.JWT_SECRET);
  const list = () => request(app).get('/api/conversations').set('Authorization', `Bearer ${token}`);
  const first = await list().expect(200);
  expect(first.body.conversations).toHaveLength(50);
  expect(first.body.conversations[0]).toMatchObject({
    id: String(matches[0]._id), otherUserId: String(people[0]._id), streakDays: 0,
    lastMessage: { id: String(messages[0]._id), text: 'Hola' },
  });
  expect(first.body.conversations[1]).toMatchObject({ id: String(matches[50]._id), streakDays: 50 });
  const next = await list().query({ before: first.body.nextCursor }).expect(200);
  expect(next.body.conversations.map(({ id }) => id)).toEqual([String(matches[1]._id)]);
  expect(next.body.nextCursor).toBeNull();
  await list().query({ before: 'inválido' }).expect(400);
  await request(app).get('/api/conversations').expect(401);
});
