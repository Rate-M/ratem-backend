const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Message = require('../src/modules/messages/message.model');
const Report = require('../src/modules/moderation/report.model');

let server;
beforeAll(async () => {
  process.env.JWT_SECRET = 'moderation-test-secret';
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Message.init(), Report.init()]);
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
