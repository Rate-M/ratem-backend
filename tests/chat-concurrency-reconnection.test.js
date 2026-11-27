jest.mock('../src/modules/users/user.model', () => ({ findById: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../src/modules/matches/match.model', () => ({ findOne: jest.fn() }));
jest.mock('../src/modules/messages/message.model', () => ({ create: jest.fn(), findOne: jest.fn(), find: jest.fn() }));

const { createServer } = require('http');
const { io: connect } = require('socket.io-client');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/modules/users/user.model');
const Match = require('../src/modules/matches/match.model');
const Message = require('../src/modules/messages/message.model');
const { attachSocketServer } = require('../src/realtime/socket');
process.env.JWT_SECRET = 'chat-concurrency-test-secret';
const app = require('../src/app');

const [a, b, c, d] = [11, 12, 13, 14].map((id) => `507f1f77bcf86cd7994390${id}`);
const firstMatch = '507f1f77bcf86cd799439091';
const secondMatch = '507f1f77bcf86cd799439092';
const token = (userId, expiresIn = '1h') => jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn });
const payload = (id, matchId = firstMatch) => ({ matchId, clientMessageId: id, text: `Texto ${id}` });
let server;
let io;
let url;
let clients;
let records;
let accounts;
let matches;
let releasePending;

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const receive = (...args) => { clearTimeout(timer); resolve(args[0]); };
    const timer = setTimeout(() => {
      socket.off(name, receive);
      reject(new Error(`No llegó ${name}`));
    }, 2500);
    socket.once(name, receive);
  });
}

function collect(socket, count) {
  const messages = [];
  const promise = new Promise((resolve, reject) => {
    const receive = (message) => {
      messages.push(message);
      if (messages.length === count) {
        clearTimeout(timer);
        socket.off('message:new', receive);
        resolve(messages);
      }
    };
    const timer = setTimeout(() => {
      socket.off('message:new', receive);
      reject(new Error(`Llegaron ${messages.length} mensajes de ${count}`));
    }, 2500);
    socket.on('message:new', receive);
  });
  return promise;
}

async function login(userId, options = {}) {
  const socket = connect(url, {
    auth: { token: token(userId) }, transports: ['websocket'], autoConnect: false,
    reconnection: true, reconnectionDelay: 10, reconnectionDelayMax: 20, randomizationFactor: 0,
    ...options,
  });
  clients.push(socket);
  const connected = event(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

function send(socket, data) {
  return socket.timeout(2500).emitWithAck('message:send', data);
}

async function reconnect(socket) {
  socket.disconnect();
  const connected = event(socket, 'connect');
  socket.connect();
  await connected;
}

async function history(userId, matchId = firstMatch) {
  return request(server).get(`/api/matches/${matchId}/messages`)
    .set('Authorization', `Bearer ${token(userId)}`);
}

beforeEach(async () => {
  jest.resetAllMocks();
  clients = [];
  records = [];
  releasePending = [];
  accounts = new Map([a, b, c, d].map((id) => [id, {
    _id: id, verificationStatus: 'approved', deletionRequestedAt: null,
  }]));
  matches = new Map([
    [firstMatch, { _id: firstMatch, userA: a, userB: b, status: 'active' }],
    [secondMatch, { _id: secondMatch, userA: c, userB: d, status: 'active' }],
  ]);
  User.findById.mockImplementation(async (id) => accounts.get(String(id)) || null);
  User.countDocuments.mockImplementation(async (filter) => filter._id.$in.filter((id) => {
    const user = accounts.get(String(id));
    return user?.verificationStatus === 'approved' && !user.deletionRequestedAt;
  }).length);
  Match.findOne.mockImplementation(async (filter) => {
    const match = matches.get(filter._id);
    return match?.status === filter.status && filter.$or.some((condition) =>
      Object.entries(condition).every(([key, value]) => match[key] === value)) ? match : null;
  });
  Message.create.mockImplementation(async (data) => {
    // Simula el índice único; la concurrencia del transporte sí es real.
    if (records.some((row) => row.match === data.match && row.sender === data.sender &&
      row.clientMessageId === data.clientMessageId)) {
      throw Object.assign(new Error('Clave duplicada'), { code: 11000 });
    }
    const message = { _id: String(records.length + 1).padStart(24, '0'), ...data, createdAt: new Date() };
    records.push(message);
    return message;
  });
  Message.findOne.mockImplementation(async (filter) => records.find((row) =>
    Object.entries(filter).every(([key, value]) => row[key] === value)));
  Message.find.mockImplementation((filter) => {
    let limit = 51;
    const query = {
      sort: () => query, limit: (value) => { limit = value; return query; },
      lean: async () => records.filter((row) => row.match === filter.match &&
        (!filter._id || row._id < filter._id.$lt))
        .sort((left, right) => right._id.localeCompare(left._id)).slice(0, limit),
    };
    return query;
  });
  server = createServer(app);
  io = attachSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  releasePending.forEach((release) => release());
  clients.forEach((client) => client.disconnect());
  await new Promise((resolve) => io.close(resolve));
});

test('Entrega todos los mensajes enviados simultáneamente en ambas direcciones', async () => {
  const [first, second] = await Promise.all([login(a), login(b)]);
  const firstMessages = collect(first, 20);
  const secondMessages = collect(second, 20);
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    send(index % 2 ? first : second, payload(`simultaneo-${index}`))));
  expect(results.every((result) => result.ok)).toBe(true);
  const received = await Promise.all([firstMessages, secondMessages]);
  const expectedIds = results.map((result) => result.message.id).sort();
  for (const messages of received) expect(messages.map((row) => row.id).sort()).toEqual(expectedIds);
  expect(new Set(expectedIds).size).toBe(20);
  expect(records.filter((row) => row.sender === a)).toHaveLength(10);
  expect(records.filter((row) => row.sender === b)).toHaveLength(10);
});

test('Dos conexiones del mismo usuario reintentan simultáneamente sin duplicar el registro', async () => {
  const [first, tab] = await Promise.all([login(a), login(a)]);
  const results = await Promise.all([send(first, payload('misma-clave')), send(tab, payload('misma-clave'))]);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(results[0].message).toEqual(results[1].message);
  expect(records).toHaveLength(1);
});

test('Cada participante puede usar el mismo clientMessageId sin perder un mensaje', async () => {
  const [first, second] = await Promise.all([login(a), login(b)]);
  const results = await Promise.all([send(first, payload('compartido')), send(second, payload('compartido'))]);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(new Set(results.map((result) => result.message.id)).size).toBe(2);
  expect(records).toHaveLength(2);
});

test.each(['websocket', 'polling'])('Se reconecta automáticamente tras un corte de transporte %s', async (transport) => {
  const sender = await login(a, { transports: [transport] });
  const receiver = await login(b);
  const oldId = sender.id;
  const connected = event(sender, 'connect');
  const disconnected = event(sender, 'disconnect');
  sender.io.engine.close();
  await disconnected;
  await connected;
  expect(sender.id).not.toBe(oldId);
  const delivered = event(receiver, 'message:new');
  const result = await send(sender, payload('tras-corte'));
  expect(result.ok).toBe(true);
  expect(await delivered).toEqual(result.message);
});

test('Recupera mensajes enviados mientras el receptor estuvo desconectado', async () => {
  const sender = await login(a);
  const receiver = await login(b);
  receiver.disconnect();
  const results = await Promise.all([send(sender, payload('offline-1')), send(sender, payload('offline-2'))]);
  expect(results.every((result) => result.ok)).toBe(true);
  await reconnect(receiver);
  const recovered = await history(b);
  expect(recovered.status).toBe(200);
  expect(recovered.body.messages.map((row) => row.id).sort())
    .toEqual(results.map((result) => result.message.id).sort());
  const live = event(receiver, 'message:new');
  const next = await send(sender, payload('online'));
  expect(await live).toEqual(next.message);
});

test('Recupera un envío persistido en el modelo simulado sin acuse al cliente desconectado', async () => {
  const sender = await login(a);
  const receiver = await login(b);
  const persist = Message.create.getMockImplementation();
  let persisted;
  const committed = new Promise((resolve) => { persisted = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  releasePending.push(release);
  Message.create.mockImplementationOnce(async (data) => {
    const row = await persist(data);
    persisted();
    await gate;
    return row;
  });
  const acknowledge = jest.fn();
  sender.emit('message:send', payload('acuse-perdido'), acknowledge);
  await committed;
  sender.disconnect();
  const firstDelivery = event(receiver, 'message:new');
  release();
  const original = await firstDelivery;
  await reconnect(sender);
  const repeatedDelivery = event(receiver, 'message:new');
  const retry = await send(sender, payload('acuse-perdido'));
  expect(retry.ok).toBe(true);
  expect(retry.message).toEqual(original);
  expect(await repeatedDelivery).toEqual(original);
  expect(acknowledge).not.toHaveBeenCalled();
  expect(records).toHaveLength(1);
  expect((await history(b)).body.messages).toHaveLength(1);
});

test('Varias reconexiones no duplican la suscripción a la sala del usuario', async () => {
  const sender = await login(a);
  const receiver = await login(b);
  const messages = [];
  receiver.on('message:new', (message) => messages.push(message));
  for (let index = 0; index < 4; index++) {
    await reconnect(receiver);
    const received = event(receiver, 'message:new');
    const result = await send(sender, payload(`reconexion-${index}`));
    expect(await received).toEqual(result.message);
    expect(io.sockets.adapter.rooms.get(`user:${b}`).size).toBe(1);
  }
  expect(messages).toHaveLength(4);
  expect(new Set(messages.map((row) => row.id)).size).toBe(4);
});

test('Rechaza JWT vencido al reconectar y permite usar uno renovado', async () => {
  const client = await login(a);
  client.disconnect();
  client.auth.token = token(a, -1);
  const rejected = event(client, 'connect_error');
  client.connect();
  expect((await rejected).data.status).toBe(401);
  client.auth.token = token(a);
  const connected = event(client, 'connect');
  client.connect();
  await connected;
  expect((await send(client, payload('token-nuevo'))).ok).toBe(true);
});

test('Revalida la cuenta al reconectar después de solicitar su eliminación', async () => {
  const client = await login(a);
  client.disconnect();
  accounts.get(a).deletionRequestedAt = new Date();
  const rejected = event(client, 'connect_error');
  client.connect();
  expect((await rejected).data.status).toBe(403);
  expect(records).toEqual([]);
});

test('No permite continuar un chat que terminó durante la desconexión', async () => {
  const client = await login(a);
  client.disconnect();
  matches.get(firstMatch).status = 'ended';
  await reconnect(client);
  expect((await send(client, payload('terminado'))).error.status).toBe(404);
  expect((await history(a)).status).toBe(404);
  expect(records).toEqual([]);
});

test('Reconectar no reinicia el límite de envíos del usuario', async () => {
  const client = await login(a);
  const results = await Promise.all(Array.from({ length: 30 }, (_, index) => send(client, payload(`limite-${index}`))));
  expect(results.every((result) => result.ok)).toBe(true);
  await reconnect(client);
  expect((await send(client, payload('exceso'))).error.status).toBe(429);
  expect(records).toHaveLength(30);
});

test('Chats concurrentes permanecen aislados entre parejas', async () => {
  const [first, second, third, fourth] = await Promise.all([login(a), login(b), login(c), login(d)]);
  const received = [first, second, third, fourth].map((socket) => {
    const rows = [];
    socket.on('message:new', (message) => rows.push(message));
    return rows;
  });
  const deliveries = [first, second, third, fourth].map((socket) => event(socket, 'message:new'));
  const results = await Promise.all([
    send(first, payload('pareja-1')), send(third, payload('pareja-2', secondMatch)),
  ]);
  await Promise.all(deliveries);
  expect(results.every((result) => result.ok)).toBe(true);
  for (const index of [0, 1]) expect(received[index].map((row) => row.matchId)).toEqual([firstMatch]);
  for (const index of [2, 3]) expect(received[index].map((row) => row.matchId)).toEqual([secondMatch]);
  expect((await history(a)).body.messages.map((row) => row.matchId)).toEqual([firstMatch]);
  expect((await history(c, secondMatch)).body.messages.map((row) => row.matchId)).toEqual([secondMatch]);
});
