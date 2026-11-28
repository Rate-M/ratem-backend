const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Match = require('../src/modules/matches/match.model');
const Place = require('../src/modules/places/place.model');
const DateInvitation = require('../src/modules/dates/date-invitation.model');

let server;

beforeAll(async () => {
  process.env.JWT_SECRET = 'date-invitation-test';
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Match.init(), Place.init(), DateInvitation.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

test('guarda la invitación para ambos participantes solo con racha y lugar válidos', async () => {
  const [sender, recipient, outsider] = await User.insertMany(['a', 'b', 'c'].map((name) => ({
    email: `${name}@example.com`, passwordHash: 'hash', verificationStatus: 'approved',
  })));
  const match = await Match.create({ userA: sender._id, userB: recipient._id });
  const path = `/api/matches/${match._id}/invitations`;
  const authorization = (user) => `Bearer ${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET)}`;
  const payload = {
    placeId: 'google-test-place', startsAt: new Date(Date.now() + 3600000).toISOString(), note: ' Hola ',
  };
  const send = (user, body = payload) => request(app).post(path).set('Authorization', authorization(user)).send(body);
  await send(outsider).expect(404);
  await send(sender, { ...payload, startsAt: '2020-01-01T00:00:00.000Z' }).expect(400);
  await send(sender).expect(403);
  await Match.updateOne({ _id: match._id }, { $set: { 'streak.current': 5 } });
  await send(sender).expect(404);
  await Place.create({
    googlePlaceId: payload.placeId, category: 'cafe', source: 'google', status: 'approved',
    expiresAt: new Date(Date.now() + 3600000),
    location: { type: 'Point', coordinates: [-103.44, 25.54] },
  });
  const sent = await send(sender).expect(201);
  expect(sent.body).toMatchObject({ direction: 'sent', status: 'pending', note: 'Hola' });
  expect(sent.body).not.toHaveProperty('coordinates');
  const received = await request(app).get(path).set('Authorization', authorization(recipient)).expect(200);
  expect(received.body.invitations).toEqual([{ ...sent.body, direction: 'received' }]);
  await request(app).get(path).set('Authorization', authorization(outsider)).expect(404);
});
