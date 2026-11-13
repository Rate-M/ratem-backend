jest.mock('../src/modules/swipes/swipe.model', () => ({ findOne: jest.fn(), create: jest.fn(), exists: jest.fn() }));
jest.mock('../src/modules/users/user.model', () => ({ findOne: jest.fn(), countDocuments: jest.fn(), findById: jest.fn() }));
jest.mock('../src/modules/profiles/profile.model', () => ({ exists: jest.fn() }));
jest.mock('../src/modules/matches/match.model', () => ({ findOneAndUpdate: jest.fn(), findOne: jest.fn() }));

const Swipe = require('../src/modules/swipes/swipe.model');
const User = require('../src/modules/users/user.model');
const Profile = require('../src/modules/profiles/profile.model');
const Match = require('../src/modules/matches/match.model');
const { createSwipe } = require('../src/modules/swipes/swipe.service');
const { ensureMutualMatch } = require('../src/modules/matches/match.service');
const request = require('supertest');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'mutual-match-test-secret';
const app = require('../src/app');
const a = '507f1f77bcf86cd799439011';
const b = '507f1f77bcf86cd799439012';
let swipes;
let matches;

beforeEach(() => {
  jest.resetAllMocks();
  swipes = [];
  matches = new Map();
  User.findOne.mockResolvedValue({ _id: b });
  User.findById.mockResolvedValue({ verificationStatus: 'approved' });
  User.countDocuments.mockResolvedValue(2);
  Profile.exists.mockResolvedValue({ _id: 'profile' });
  Swipe.findOne.mockImplementation(async (filter) => swipes.find((row) => row.from === filter.from && row.to === filter.to));
  Swipe.exists.mockImplementation(async (filter) => swipes.some((row) =>
    row.from === filter.from && row.to === filter.to && row.action === filter.action));
  Swipe.create.mockImplementation(async (data) => {
    const swipe = { _id: `swipe-${swipes.length}`, ...data };
    swipes.push(swipe);
    return swipe;
  });
  Match.findOneAndUpdate.mockImplementation(async (filter, update) => {
    const key = `${filter.userA}:${filter.userB}`;
    if (!matches.has(key)) matches.set(key, { _id: 'match-1', ...update.$setOnInsert });
    return matches.get(key);
  });
});

test('Un like unilateral no crea match ni aviso', async () => {
  const result = await createSwipe(a, { to: b, action: 'like' });
  expect(result.match).toBeNull();
  expect(matches.size).toBe(0);
});

test('Dos likes recíprocos crean un único match con avisos pendientes para ambos', async () => {
  await createSwipe(a, { to: b, action: 'like' });
  const result = await createSwipe(b, { to: a, action: 'like' });
  expect(result.match).toMatchObject({ id: 'match-1', users: [a, b] });
  expect([...matches.values()]).toEqual([{ _id: 'match-1', userA: a, userB: b, status: 'active', readBy: [] }]);
});

test.each([['pass', 'like'], ['like', 'pass'], ['pass', 'pass']])(
  '%s y %s no generan match', async (first, second) => {
    await createSwipe(a, { to: b, action: first });
    await createSwipe(b, { to: a, action: second });
    expect(matches.size).toBe(0);
  }
);

test('Likes simultáneos convergen a la misma pareja', async () => {
  await Promise.all([
    createSwipe(a, { to: b, action: 'like' }), createSwipe(b, { to: a, action: 'like' }),
  ]);
  expect(matches.size).toBe(1);
  expect([...matches.values()][0]).toMatchObject({ userA: a, userB: b, readBy: [] });
});

test('Repetir el like conserva el aviso leído y no crea otro match', async () => {
  await createSwipe(a, { to: b, action: 'like' });
  await createSwipe(b, { to: a, action: 'like' });
  [...matches.values()][0].readBy.push(a);
  await expect(createSwipe(a, { to: b, action: 'like' })).rejects.toMatchObject({ status: 409 });
  expect(matches.size).toBe(1);
  expect([...matches.values()][0].readBy).toEqual([a]);
});

test('Un reintento recupera un match fallido después de guardar el like', async () => {
  await createSwipe(a, { to: b, action: 'like' });
  Match.findOneAndUpdate.mockRejectedValueOnce(new Error('Fallo temporal'));
  await expect(createSwipe(b, { to: a, action: 'like' })).rejects.toThrow('Fallo temporal');
  expect(swipes).toHaveLength(2);
  await expect(createSwipe(b, { to: a, action: 'like' })).rejects.toMatchObject({ status: 409 });
  expect(matches.size).toBe(1);
});

test('Una colisión de índice único recupera el match ya creado', async () => {
  swipes.push({ from: a, to: b, action: 'like' });
  Match.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 });
  Match.findOne.mockResolvedValue({ _id: 'existente', userA: a, userB: b, status: 'active' });
  expect(await ensureMutualMatch(b, a)).toMatchObject({ id: 'existente', users: [a, b] });
});

test('Un match terminado no se reactiva por un reintento', async () => {
  swipes.push({ from: a, to: b, action: 'like' });
  Match.findOneAndUpdate.mockResolvedValue({ status: 'ended' });
  expect(await ensureMutualMatch(b, a)).toBeNull();
});

test('No crea match si un participante dejó de estar disponible', async () => {
  swipes.push({ from: a, to: b, action: 'like' });
  User.countDocuments.mockResolvedValue(1);
  expect(await ensureMutualMatch(b, a)).toBeNull();
  expect(Match.findOneAndUpdate).not.toHaveBeenCalled();
});

test('Rechaza el propio perfil aunque el identificador use mayúsculas', async () => {
  await expect(createSwipe(a, { to: a.toUpperCase(), action: 'like' })).rejects.toMatchObject({ status: 400 });
  expect(Swipe.create).not.toHaveBeenCalled();
});

test('No permite elegir quién envía el like', async () => {
  await expect(createSwipe(a, { from: b, to: b, action: 'like' })).rejects.toMatchObject({ status: 400 });
  expect(Swipe.create).not.toHaveBeenCalled();
});

test('POST /api/swipes mantiene los campos existentes y devuelve el match al segundo like', async () => {
  for (const [from, to, mutual] of [[a, b, false], [b, a, true]]) {
    const token = jwt.sign({ sub: from }, process.env.JWT_SECRET);
    const res = await request(app).post('/api/swipes')
      .set('Authorization', `Bearer ${token}`).send({ to, action: 'like' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ to, action: 'like' });
    if (mutual) expect(res.body.match).toEqual({ id: 'match-1', users: [a, b] });
    else expect(res.body.match).toBeNull();
  }
});
