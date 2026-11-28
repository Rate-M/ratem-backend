const os = require('os');
const { createServer } = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io } = require('socket.io-client');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { attachSocketServer } = require('../src/realtime/socket');
const User = require('../src/modules/users/user.model');
const Match = require('../src/modules/matches/match.model');
const Message = require('../src/modules/messages/message.model');

let database;
let server;
let realtime;
const clients = [];

beforeAll(async () => {
  process.env.JWT_SECRET = 'read-receipt-test-secret';
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Match.init(), Message.init()]);
  server = createServer(app);
  realtime = attachSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}, 600000);

afterAll(async () => {
  clients.forEach((client) => client.disconnect());
  if (realtime) await realtime.close();
  await mongoose.disconnect();
  if (database) await database.stop();
});

const token = (user) => jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function connect(user) {
  const client = io('http://127.0.0.1:' + server.address().port, {
    forceNew: true, auth: { token: token(user) },
  });
  clients.push(client);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

test('persiste cursores independientes y evita que un reintento retroceda el historial', async () => {
  const [sender, reader, outsider] = await User.insertMany(['a', 'b', 'c'].map((name) => ({
    email: name + '@example.com', passwordHash: 'hash', verificationStatus: 'approved',
  })));
  const match = await Match.create({ userA: sender._id, userB: reader._id });
  await Match.collection.updateOne({ _id: match._id }, { $unset: { chatReadThrough: '' } });
  const [first, latest, reply] = await Message.insertMany([
    { sender: sender._id, recipient: reader._id, clientMessageId: 'first' },
    { sender: sender._id, recipient: reader._id, clientMessageId: 'latest' },
    { sender: reader._id, recipient: sender._id, clientMessageId: 'reply' },
  ].map((message) => ({ ...message, match: match._id, text: 'Hola' })));

  const [a, b, c] = await Promise.all([connect(sender), connect(reader), connect(outsider)]);
  const payload = (message) => ({ matchId: String(match._id), messageId: String(message._id) });
  const seen = [];
  const privateEvents = [];
  a.on('message:read', (receipt) => seen.push(receipt));
  c.on('message:read', (receipt) => privateEvents.push(receipt));
  const nextReceipt = new Promise((resolve) => a.once('message:read', resolve));

  await expect(c.timeout(1000).emitWithAck('message:read', payload(latest)))
    .resolves.toMatchObject({ ok: false, error: { status: 404 } });
  await expect(b.timeout(1000).emitWithAck('message:read', payload(reply)))
    .resolves.toMatchObject({ ok: false, error: { status: 404 } });
  const expected = { ...payload(latest), readerId: String(reader._id) };
  await expect(b.timeout(1000).emitWithAck('message:read', payload(latest)))
    .resolves.toEqual({ ok: true, receipt: expected });
  await expect(nextReceipt).resolves.toEqual(expected);

  const [old, repeated] = await Promise.all([first, latest].map((message) =>
    b.timeout(1000).emitWithAck('message:read', payload(message))));
  expect(old.receipt).toEqual(expected);
  expect(repeated.receipt).toEqual(expected);
  expect(seen).toEqual([expected]);
  expect(privateEvents).toEqual([]);
  await expect(a.timeout(1000).emitWithAck('message:read', payload(reply))).resolves.toMatchObject({ ok: true });

  b.disconnect();
  const path = '/api/matches/' + match._id + '/messages';
  const history = await request(app).get(path).set('Authorization', 'Bearer ' + token(sender)).expect(200);
  expect(history.body.readThrough).toEqual({ me: String(reply._id), other: String(latest._id) });

  const reconnected = await connect(reader);
  await expect(reconnected.timeout(1000).emitWithAck('message:read', payload(first)))
    .resolves.toEqual({ ok: true, receipt: expected });
});
