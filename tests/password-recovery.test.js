jest.mock('../src/modules/users/user.model', () => ({
  findOne: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../src/modules/users/user.model');

process.env.JWT_SECRET = 'clave-exclusiva-para-pruebas';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_URL = 'http://localhost:5173';

const app = require('../src/app');

let user;
let logSpy;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

beforeEach(() => {
  jest.clearAllMocks();

  user = {
    _id: '507f1f77bcf86cd799439011',
    email: 'recovery@example.com',
    passwordHash: bcrypt.hashSync('Anterior12345', 10),
    role: 'user',
    verificationStatus: 'pending',
    passwordResetTokenHash: null,
    passwordResetExpires: null,
    save: jest.fn().mockResolvedValue(undefined),
  };

  User.findOne.mockImplementation(async (query) => {
    if (query.email) {
      return query.email === user.email ? user : null;
    }

    const matches =
      user.passwordResetTokenHash !== null &&
      user.passwordResetTokenHash === query.passwordResetTokenHash &&
      user.passwordResetExpires instanceof Date &&
      user.passwordResetExpires > query.passwordResetExpires.$gt;

    return matches ? user : null;
  });

  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

test('Recupera la contraseña y permite entrar solo con la nueva', async () => {
  const start = Date.now();

  const forgot = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email: user.email });

  expect(forgot.status).toBe(200);

  const log = logSpy.mock.calls.find(
    (args) =>
      typeof args[1] === 'string' &&
      args[1].includes('/recuperar/')
  );

  expect(log).toBeDefined();

  const token = log[1].split('/recuperar/')[1];

  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(user.passwordResetTokenHash).toBe(hashToken(token));
  expect(user.passwordResetTokenHash).not.toBe(token);
  expect(user.passwordResetExpires.getTime())
    .toBeGreaterThanOrEqual(start + 60 * 60 * 1000);
  expect(user.passwordResetExpires.getTime())
    .toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
  expect(user.save).toHaveBeenCalledTimes(1);

  const reset = await request(app)
    .post('/api/auth/reset-password')
    .send({ token, password: 'Nueva12345' });

  expect(reset.status).toBe(200);
  expect(user.passwordResetTokenHash).toBeNull();
  expect(user.passwordResetExpires).toBeNull();
  expect(user.save).toHaveBeenCalledTimes(2);

  const loginNew = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Nueva12345' });

  expect(loginNew.status).toBe(200);
  expect(loginNew.body.token).toEqual(expect.any(String));

  const loginOld = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Anterior12345' });

  expect(loginOld.status).toBe(401);

  const reuse = await request(app)
    .post('/api/auth/reset-password')
    .send({ token, password: 'Otra12345' });

  expect(reuse.status).toBe(400);
  expect(await bcrypt.compare('Nueva12345', user.passwordHash)).toBe(true);
  expect(user.save).toHaveBeenCalledTimes(2);
});

test('Un token vencido no cambia la contraseña', async () => {
  const token = 'a'.repeat(64);
  const originalHash = user.passwordHash;

  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpires = new Date(Date.now() - 1000);

  const res = await request(app)
    .post('/api/auth/reset-password')
    .send({ token, password: 'Nueva12345' });

  expect(res.status).toBe(400);
  expect(user.passwordHash).toBe(originalHash);
  expect(user.save).not.toHaveBeenCalled();
});

test('Un token desconocido no cambia la contraseña', async () => {
  const originalHash = user.passwordHash;

  const res = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: 'b'.repeat(64), password: 'Nueva12345' });

  expect(res.status).toBe(400);
  expect(user.passwordHash).toBe(originalHash);
  expect(user.save).not.toHaveBeenCalled();
});

test('Correo inexistente recibe una respuesta genérica', async () => {
  const res = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'inexistente@example.com' });

  expect(res.status).toBe(200);
  expect(res.body.message).toBe(
    'Si el correo existe, se envió un enlace de recuperación'
  );
  expect(user.save).not.toHaveBeenCalled();
  expect(logSpy).not.toHaveBeenCalled();
});