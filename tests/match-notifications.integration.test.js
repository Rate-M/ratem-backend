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
  process.env.JWT_SECRET = 'match-notifications-integration-secret';
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Match.init(), Swipe.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

test('La creación concurrente genera un aviso por persona y leer uno conserva el otro', async () => {
  const [a, b] = await User.create(['a', 'b'].map((name) => ({
    email: `${name}@example.com`,
    passwordHash: 'hash',
    verificationStatus: 'approved',
  })));
  await Swipe.create([
    { from: a._id, to: b._id, action: 'like' },
    { from: b._id, to: a._id, action: 'like' },
  ]);
  const [first, second] = await Promise.all([
    ensureMutualMatch(a._id, b._id),
    ensureMutualMatch(b._id, a._id),
  ]);
  expect(first.id).toEqual(second.id);
  expect(await Match.countDocuments()).toBe(1);

  const client = request(app);
  const authFor = (user) => `Bearer ${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET)}`;
  const list = async (user) => {
    const response = await client.get('/api/notifications')
      .set('Authorization', authFor(user)).expect(200);
    return response.body.notifications;
  };
  const id = String(first.id);
  expect(await list(a)).toMatchObject([{ id, otherUserId: String(b._id) }]);
  expect(await list(b)).toMatchObject([{ id, otherUserId: String(a._id) }]);

  await client.patch(`/api/notifications/${id}/read`)
    .set('Authorization', authFor(a)).expect(204);
  expect(await list(a)).toEqual([]);
  expect(await list(b)).toMatchObject([{ id }]);
});
