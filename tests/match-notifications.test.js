jest.mock('../src/modules/users/user.model', () => ({ findById: jest.fn() }));
jest.mock('../src/modules/matches/match.model', () => ({ find: jest.fn(), updateOne: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/modules/users/user.model');
const Match = require('../src/modules/matches/match.model');
process.env.JWT_SECRET = 'matches-test-secret';
const app = require('../src/app');
const a = '507f1f77bcf86cd799439011';
const b = '507f1f77bcf86cd799439012';
const c = '507f1f77bcf86cd799439013';
const matchId = '507f1f77bcf86cd799439099';
const auth = (user) => `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}`;
let rows;

beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockResolvedValue({ verificationStatus: 'approved' });
  rows = [{
    _id: matchId,
    userA: { _id: a, verificationStatus: 'approved', email: 'oculto-a@example.com' },
    userB: { _id: b, verificationStatus: 'approved', email: 'oculto-b@example.com' },
    status: 'active', readBy: [], createdAt: new Date('2026-11-13T12:00:00Z'),
  }];
  Match.find.mockImplementation((filter) => {
    const query = { sort: () => query, limit: () => query, populate: () => query,
      lean: async () => rows.filter((row) => row.status === filter.status &&
        filter.$or.some((condition) => Object.entries(condition).every(([key, value]) => row[key]?._id === value)) &&
        (!filter.readBy || !row.readBy.includes(filter.readBy.$ne))),
    };
    return query;
  });
  Match.updateOne.mockImplementation(async (filter, update) => {
    const row = rows.find((item) => item._id === filter._id && item.status === filter.status &&
      filter.$or.some((condition) => Object.entries(condition).every(([key, value]) => item[key]?._id === value)));
    if (!row) return { matchedCount: 0 };
    if (!row.readBy.includes(update.$addToSet.readBy)) row.readBy.push(update.$addToSet.readBy);
    return { matchedCount: 1 };
  });
});

test('Ambos participantes ven el match y un aviso con el identificador del otro usuario', async () => {
  for (const [user, partner] of [[a, b], [b, a]]) {
    const matches = await request(app).get('/api/matches').set('Authorization', auth(user));
    expect(matches.status).toBe(200);
    expect(matches.body).toEqual({ matches: [{
      id: matchId, users: [a, b], createdAt: '2026-11-13T12:00:00.000Z',
    }], nextCursor: null });
    const notices = await request(app).get('/api/notifications').set('Authorization', auth(user));
    expect(notices.status).toBe(200);
    expect(notices.body.notifications).toEqual([{
      id: matchId, type: 'match', matchId, otherUserId: partner, createdAt: '2026-11-13T12:00:00.000Z',
    }]);
    expect(notices.headers['cache-control']).toBe('no-store');
  }
});

test('Leer un aviso es idempotente y no marca el del otro participante', async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await request(app).patch(`/api/notifications/${matchId}/read`).set('Authorization', auth(a));
    expect(res.status).toBe(204);
  }
  const first = await request(app).get('/api/notifications').set('Authorization', auth(a));
  const second = await request(app).get('/api/notifications').set('Authorization', auth(b));
  expect(first.body.notifications).toEqual([]);
  expect(second.body.notifications).toHaveLength(1);
  const matches = await request(app).get('/api/matches').set('Authorization', auth(a));
  expect(matches.body.matches).toHaveLength(1);
  expect(rows[0].readBy).toEqual([a]);
});

test('Un tercero no puede listar ni marcar avisos de otra pareja', async () => {
  for (const path of ['/api/matches', '/api/notifications']) {
    const res = await request(app).get(path).set('Authorization', auth(c));
    expect(res.status).toBe(200);
    expect(res.body[path.includes('notifications') ? 'notifications' : 'matches']).toEqual([]);
  }
  const res = await request(app).patch(`/api/notifications/${matchId}/read`).set('Authorization', auth(c));
  expect(res.status).toBe(404);
  expect(rows[0].readBy).toEqual([]);
});

test.each(['/api/matches', '/api/notifications'])(
  'Requiere autenticación y verificación aprobada en %s', async (path) => {
    expect((await request(app).get(path)).status).toBe(401);
    User.findById.mockResolvedValue({ verificationStatus: 'pending' });
    expect((await request(app).get(path).set('Authorization', auth(a))).status).toBe(403);
    expect(Match.find).not.toHaveBeenCalled();
  }
);

test.each([null, { _id: b, verificationStatus: 'approved', deletionRequestedAt: new Date() },
  { _id: b, verificationStatus: 'rejected' }])('Oculta participantes no disponibles: %j', async (partner) => {
  rows[0].userB = partner;
  const res = await request(app).get('/api/matches').set('Authorization', auth(a));
  expect(res.body.matches).toEqual([]);
});

test('Un cursor inválido se rechaza antes de consultar', async () => {
  const res = await request(app).get('/api/matches?before=incorrecto').set('Authorization', auth(a));
  expect(res.status).toBe(400);
  expect(Match.find).not.toHaveBeenCalled();
});

test('La paginación devuelve un cursor y limita la página a 50 matches', async () => {
  const entries = Array.from({ length: 51 }, (_, index) => ({ ...rows[0], _id: String(index + 1).padStart(24, '0') }));
  const query = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(), lean: async () => entries };
  Match.find.mockReturnValue(query);
  const res = await request(app).get('/api/matches').set('Authorization', auth(a));
  expect(res.body.matches).toHaveLength(50);
  expect(res.body.nextCursor).toBe(entries[49]._id);
  expect(query.limit).toHaveBeenCalledWith(51);
  await request(app).get(`/api/matches?before=${entries[49]._id}`).set('Authorization', auth(a));
  expect(Match.find).toHaveBeenLastCalledWith(expect.objectContaining({ _id: { $lt: entries[49]._id } }));
});
