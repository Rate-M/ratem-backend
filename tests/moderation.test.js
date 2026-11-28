const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Message = require('../src/modules/messages/message.model');
const Place = require('../src/modules/places/place.model');
const Verification = require('../src/modules/verification/verification.model');
const Report = require('../src/modules/moderation/report.model');

let server;
beforeAll(async () => {
  process.env.JWT_SECRET = 'moderation-test-secret';
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Message.init(), Report.init(), Place.init(), Verification.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

test('solo soporte ve el mensaje reportado y solo administración cambia su rol', async () => {
  const [sender, reporter, staff, admin] = await User.insertMany(
    ['user', 'user', 'user', 'admin'].map((role, i) => ({
      role, email: i + '@example.com', passwordHash: 'hash', emailVerified: true, verificationStatus: 'approved',
    }))
  );
  const auth = (user) => 'Bearer ' + jwt.sign({ sub: String(user._id), role: 'admin' }, process.env.JWT_SECRET);
  const client = request(app);
  const match = new mongoose.Types.ObjectId();
  const [reported, unreported] = await Message.insertMany(['reportado', 'privado'].map((text) => ({
    match, sender: sender._id, recipient: reporter._id, text, clientMessageId: text,
  })));
  const path = '/api/moderation/reports';
  const rolePath = '/api/moderation/users/' + staff._id + '/role';
  const report = (user, target) => client.post('/api/reports').set('Authorization', auth(user))
    .send({ type: 'message', targetId: String(target._id), reason: 'Acoso' });
  await report(staff, unreported).expect(404);
  const created = await report(reporter, reported).expect(201);
  await report(reporter, reported).expect(409);

  await client.get(path).set('Authorization', auth(staff)).expect(403);
  await client.patch(rolePath).set('Authorization', auth(admin)).send({ role: 'moderator' }).expect(200);
  await client.patch(rolePath).set('Authorization', auth(staff)).send({ role: 'user' }).expect(403);
  const list = await client.get(path + '?type=message').set('Authorization', auth(staff)).expect(200);
  expect(list.body.reports).toHaveLength(1);
  expect(list.body.reports[0]).not.toHaveProperty('content');
  expect(list.body.counts.pending).toBe(1);
  const detailPath = path + '/' + created.body.id;
  const detail = await client.get(detailPath).set('Authorization', auth(staff)).expect(200);
  expect(detail.body.content).toMatchObject({ text: 'reportado' });
  expect(JSON.stringify(detail.body)).not.toContain('privado');
  const action = await client.patch(detailPath).set('Authorization', auth(staff))
    .send({ status: 'resolved', note: 'Revisado' }).expect(200);
  expect(action.body.audit).toMatchObject([{ actor: String(staff._id), status: 'resolved', note: 'Revisado' }]);
  await client.patch(detailPath).set('Authorization', auth(staff)).send({ status: 'resolved' }).expect(409);

  await client.patch(rolePath).set('Authorization', auth(admin)).send({ role: 'user' }).expect(200);
  await client.get(path).set('Authorization', auth(staff)).expect(403);
  const account = await User.findById(staff._id).select('+roleHistory').lean();
  expect(account.roleHistory).toMatchObject([{ role: 'moderator' }, { role: 'user' }]);
});

test('publica propuestas aprobadas, aplica suspensiones y exporta las decisiones sin datos de Didit', async () => {
  const [person, staff, admin] = await User.insertMany(['user', 'moderator', 'admin'].map((role, i) => ({
    role, email: 'support-' + i + '@example.com', passwordHash: 'hash', verificationStatus: 'approved',
  })));
  const auth = (user) => 'Bearer ' + jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET);
  const client = request(app);
  const search = () => client.get('/api/places/community?lat=25.54&lng=-103.44').set('Authorization', auth(staff));

  const proposed = await client.post('/api/places/proposals').set('Authorization', auth(person)).send({
    name: 'Café + Centro', address: 'Centro', category: 'cafe', latitude: 25.54, longitude: -103.44,
  }).expect(201);
  expect((await search().expect(200)).body.places).toEqual([]);
  const queue = await client.get('/api/moderation/places?q=%2B&status=pending')
    .set('Authorization', auth(staff)).expect(200);
  expect(queue.body.items).toHaveLength(1);

  await client.patch('/api/moderation/places/' + proposed.body.id).set('Authorization', auth(staff))
    .send({ status: 'approved' }).expect(200);
  expect((await search().expect(200)).body.places).toMatchObject([{ name: 'Café + Centro' }]);

  const userPath = '/api/moderation/users/' + person._id + '/status';
  await client.patch(userPath).set('Authorization', auth(staff)).send({ action: 'suspend', days: 7, reason: '=1+1' }).expect(200);
  await client.get('/api/places/community?lat=25.54&lng=-103.44').set('Authorization', auth(person)).expect(403);
  expect((await client.get('/api/moderation/users?status=suspended').set('Authorization', auth(staff)).expect(200))
    .body.items).toMatchObject([{ _id: String(person._id), status: 'suspended' }]);
  await client.patch(userPath).set('Authorization', auth(staff)).send({ action: 'ban', reason: 'motivo' }).expect(403);
  await client.patch(userPath).set('Authorization', auth(admin)).send({ action: 'ban', reason: 'motivo' }).expect(200);
  await client.patch(userPath).set('Authorization', auth(staff)).send({ action: 'restore', reason: 'motivo' }).expect(404);
  await client.patch(userPath).set('Authorization', auth(admin)).send({ action: 'restore', reason: 'motivo' }).expect(200);
  await client.get('/api/places/community?lat=25.54&lng=-103.44').set('Authorization', auth(person)).expect(200);

  const session = await Verification.create({
    user: person._id, provider: 'didit', providerSessionId: 'privado-id', verificationUrl: 'https://privado.example',
  });
  const verification = await client.get('/api/moderation/verifications?user=' + person._id)
    .set('Authorization', auth(staff)).expect(200);
  expect(verification.body.items).toMatchObject([{ status: 'pending' }]);
  expect(JSON.stringify(verification.body)).not.toContain('privado');
  await client.patch('/api/moderation/verifications/' + session._id + '/review')
    .set('Authorization', auth(staff)).send({ note: 'Consultado en el proveedor' }).expect(200);
  expect((await Verification.findById(session._id)).status).toBe('pending');

  const activity = await client.get('/api/moderation/activity').set('Authorization', auth(staff)).expect(200);
  expect(activity.body.items.map((item) => item.action)).toEqual(expect.arrayContaining(['approved', 'suspend', 'ban', 'restore', 'reviewed']));
  const csv = await client.get('/api/moderation/activity?format=csv&category=users')
    .set('Authorization', auth(staff)).expect(200);
  expect(csv.text).toContain("'=1+1");
  expect(csv.text).not.toContain('Consultado en el proveedor');
});
