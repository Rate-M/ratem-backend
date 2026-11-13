jest.mock('../src/modules/users/user.model', () => ({ findById: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../src/modules/matches/match.model', () => ({ findOne: jest.fn() }));
jest.mock('../src/modules/messages/message.model', () => ({ create: jest.fn(), findOne: jest.fn(), find: jest.fn() }));

const { createServer } = require('http');
const { io: connect } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../src/modules/users/user.model');
const Match = require('../src/modules/matches/match.model');
const Message = require('../src/modules/messages/message.model');
const { attachSocketServer } = require('../src/realtime/socket');
process.env.JWT_SECRET = 'chat-socket-test-secret';
const app = require('../src/app');
const a = '507f1f77bcf86cd799439011';
const b = '507f1f77bcf86cd799439012';
const c = '507f1f77bcf86cd799439013';
const matchId = '507f1f77bcf86cd799439099';
const token = (sub, expiresIn = '1h') => jwt.sign({ sub }, process.env.JWT_SECRET, { expiresIn });
let server;
let io;
let url;
let clients;
let stored;

beforeEach(async () => {
  jest.resetAllMocks();
  clients = [];
  stored = [];
  User.findById.mockResolvedValue({ verificationStatus: 'approved' });
  User.countDocuments.mockResolvedValue(2);
  Match.findOne.mockImplementation(async (filter) => filter._id === matchId &&
    filter.$or.some((item) => item.userA === a || item.userB === b)
    ? { _id: matchId, userA: a, userB: b, status: 'active' } : null);
  Message.create.mockImplementation(async (data) => {
    if (stored.some((row) => row.match === data.match && row.sender === data.sender && row.clientMessageId === data.clientMessageId)) {
      throw Object.assign(new Error('Duplicado'), { code: 11000 });
    }
    const row = { _id: String(stored.length + 1).padStart(24, '0'), ...data, createdAt: new Date() };
    stored.push(row);
    return row;
  });
  Message.findOne.mockImplementation(async (filter) => stored.find((row) =>
    row.match === filter.match && row.sender === filter.sender && row.clientMessageId === filter.clientMessageId));
  Message.find.mockImplementation(() => {
    const query = { sort: () => query, limit: () => query, lean: async () => [...stored].reverse() };
    return query;
  });
  server = createServer(app);
  io = attachSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  await new Promise((resolve) => io.close(resolve));
});

function clientWithToken(value) {
  const client = connect(url, { auth: { token: value }, transports: ['websocket'], reconnection: false, autoConnect: false });
  clients.push(client);
  return client;
}
function once(client, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`No llegó ${event}`)), 2000);
    client.once(event, (data) => { clearTimeout(timeout); resolve(data); });
  });
}
async function login(user) {
  const client = clientWithToken(token(user));
  const connected = once(client, 'connect');
  client.connect();
  await connected;
  return client;
}
function send(client, data) {
  return client.timeout(2000).emitWithAck('message:send', data);
}
const payload = (clientMessageId = 'mensaje-1') => ({ matchId, clientMessageId, text: 'Hola' });

test.each([undefined, 'invalido', token(a, -1)])('Rechaza JWT ausente, inválido o expirado: %s', async (value) => {
  const client = clientWithToken(value);
  const rejected = once(client, 'connect_error');
  client.connect();
  expect((await rejected).data.status).toBe(401);
});

test.each([null, { verificationStatus: 'pending' },
  { verificationStatus: 'approved', deletionRequestedAt: new Date() }])(
  'Rechaza una cuenta no disponible: %j', async (account) => {
    User.findById.mockResolvedValue(account);
    const client = clientWithToken(token(a));
    const rejected = once(client, 'connect_error');
    client.connect();
    expect((await rejected).data.status).toBe(403);
  }
);

test('Persiste antes de confirmar y entrega al emisor y receptor, sin suscribir a terceros', async () => {
  const first = await login(a);
  const second = await login(b);
  const stranger = await login(c);
  const receivedByStranger = jest.fn();
  stranger.on('message:new', receivedByStranger);
  const senderEvent = once(first, 'message:new');
  const recipientEvent = once(second, 'message:new');
  const ack = await send(first, payload());
  expect(ack.ok).toBe(true);
  expect(stored).toHaveLength(1);
  expect(ack.message).toMatchObject({ senderId: a, recipientId: b, text: 'Hola', matchId });
  expect(await senderEvent).toEqual(ack.message);
  expect(await recipientEvent).toEqual(ack.message);
  // Un evento posterior sirve como barrera en la conexión del tercero.
  await send(stranger, payload('ajeno'));
  expect(receivedByStranger).not.toHaveBeenCalled();
});

test('Un fallo de persistencia no confirma ni publica el mensaje', async () => {
  const client = await login(a);
  const received = jest.fn();
  client.on('message:new', received);
  Message.create.mockRejectedValueOnce(new Error('Error privado de MongoDB'));
  const result = await send(client, payload());
  expect(result).toEqual({ ok: false, error: { status: 500, message: 'No se pudo procesar el mensaje' } });
  expect(received).not.toHaveBeenCalled();
  expect(stored).toEqual([]);
});

test('Un tercero no puede enviar ni leer el historial', async () => {
  const stranger = await login(c);
  expect((await send(stranger, payload())).error.status).toBe(404);
  const history = await request(server).get(`/api/matches/${matchId}/messages`)
    .set('Authorization', `Bearer ${token(c)}`);
  expect(history.status).toBe(404);
  expect(stored).toEqual([]);
});

test('Revalida el estado del match y de las cuentas después de conectar', async () => {
  const client = await login(a);
  Match.findOne.mockResolvedValueOnce(null);
  expect((await send(client, payload())).error.status).toBe(404);
  User.countDocuments.mockResolvedValueOnce(1);
  expect((await send(client, payload())).error.status).toBe(403);
  expect(stored).toEqual([]);
});

test('Reintentar el mismo identificador devuelve el mismo mensaje y otro texto produce conflicto', async () => {
  const client = await login(a);
  const first = await send(client, payload());
  const repeat = await send(client, payload());
  expect(repeat.message).toEqual(first.message);
  expect(stored).toHaveLength(1);
  expect((await send(client, { ...payload(), text: 'Otro texto' })).error.status).toBe(409);
});

test.each([
  { ...payload(), text: '' }, { ...payload(), text: ' '.repeat(2) },
  { ...payload(), text: 'a'.repeat(2001) }, { ...payload(), senderId: b },
  { ...payload(), clientMessageId: '../no' },
])('Rechaza datos inválidos o suplantación: %j', async (data) => {
  const client = await login(a);
  expect((await send(client, data)).error.status).toBe(400);
  expect(Message.create).not.toHaveBeenCalled();
});

test('El historial HTTP recupera mensajes persistidos después de desconectar', async () => {
  const client = await login(a);
  await send(client, payload());
  client.disconnect();
  const res = await request(server).get(`/api/matches/${matchId}/messages`)
    .set('Authorization', `Bearer ${token(b)}`);
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.body.messages).toHaveLength(1);
  expect(res.body.messages[0]).toMatchObject({ text: 'Hola', senderId: a, recipientId: b });
});

test('Limita a 30 intentos por minuto por usuario, incluso desde varias conexiones', async () => {
  const first = await login(a);
  const second = await login(a);
  for (let index = 0; index < 30; index++) {
    expect((await send(index % 2 ? first : second, payload(`mensaje-${index}`))).ok).toBe(true);
  }
  expect((await send(second, payload('exceso'))).error.status).toBe(429);
  expect(stored).toHaveLength(30);
});

test('Desconecta una conexión cuando vence su JWT', async () => {
  const client = clientWithToken(token(a, 2));
  const connected = once(client, 'connect');
  client.connect();
  await connected;
  const disconnected = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El JWT vencido no desconectó')), 3500);
    client.once('disconnect', (reason) => { clearTimeout(timeout); resolve(reason); });
  });
  expect(await disconnected).toBe('io server disconnect');
});

test('El historial limita la página a 50 y devuelve cursor para los mensajes anteriores', async () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({
    _id: String(100 - index).padStart(24, '0'), match: matchId,
    sender: a, recipient: b, clientMessageId: `id-${index}`, text: `Mensaje ${index}`,
  }));
  const query = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: async () => rows };
  Message.find.mockReturnValue(query);
  const res = await request(server).get(`/api/matches/${matchId}/messages`)
    .set('Authorization', `Bearer ${token(a)}`);
  expect(res.status).toBe(200);
  expect(res.body.messages).toHaveLength(50);
  expect(res.body.nextCursor).toBe(rows[49]._id);
  expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
  expect(query.limit).toHaveBeenCalledWith(51);
  await request(server).get(`/api/matches/${matchId}/messages?before=${rows[49]._id}`)
    .set('Authorization', `Bearer ${token(a)}`);
  expect(Message.find).toHaveBeenLastCalledWith({ match: matchId, _id: { $lt: rows[49]._id } });
});

test('Rechaza cursores inválidos sin consultar mensajes', async () => {
  const res = await request(server).get(`/api/matches/${matchId}/messages?before=invalid`)
    .set('Authorization', `Bearer ${token(a)}`);
  expect(res.status).toBe(400);
  expect(Message.find).not.toHaveBeenCalled();
});
