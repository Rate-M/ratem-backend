const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Match = require('../src/modules/matches/match.model');
const Swipe = require('../src/modules/swipes/swipe.model');
const { ensureMutualMatch } = require('../src/modules/matches/match.service');

let server;

beforeAll(async () => {
  process.env.JWT_SECRET = 'unmatch-test-secret';
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Match.init(), Swipe.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

test('Deshacer el match simultáneamente oculta la pareja para ambos y conserva su bloqueo', async () => {
  const [a, b] = await User.create(['a', 'b'].map((name) => ({
    email: `${name}@example.com`,
    passwordHash: 'hash',
    verificationStatus: 'approved',
  })));
  await Swipe.create([
    { from: a._id, to: b._id, action: 'like' },
    { from: b._id, to: a._id, action: 'like' },
  ]);
  const { id } = await ensureMutualMatch(a._id, b._id);
  const matchPath = `/api/matches/${id}`;
  const headers = [a, b].map((user) =>
    `Bearer ${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET)}`);
  const client = request(app);

  for (const auth of headers) {
    const matches = await client.get('/api/matches').set('Authorization', auth).expect(200);
    expect(matches.body.matches).toHaveLength(1);
    const notifications = await client.get('/api/notifications').set('Authorization', auth).expect(200);
    expect(notifications.body.notifications).toHaveLength(1);
    await client.get(`${matchPath}/messages`).set('Authorization', auth).expect(200);
  }

  await Promise.all(headers.map((auth) =>
    client.delete(matchPath).set('Authorization', auth).expect(204)));

  for (const auth of headers) {
    const matches = await client.get('/api/matches').set('Authorization', auth).expect(200);
    expect(matches.body.matches).toEqual([]);
    const notifications = await client.get('/api/notifications').set('Authorization', auth).expect(200);
    expect(notifications.body.notifications).toEqual([]);
    await client.get(`${matchPath}/messages`).set('Authorization', auth).expect(404);
  }

  expect(await ensureMutualMatch(a._id, b._id)).toBeNull();
  expect(await ensureMutualMatch(b._id, a._id)).toBeNull();
  expect(await Match.countDocuments()).toBe(1);
  expect(await Match.findById(id).lean()).toMatchObject({ status: 'ended' });
});
