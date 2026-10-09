jest.mock('../src/modules/users/user.model', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../src/modules/consents/consent.model', () => ({
  insertMany: jest.fn(),
}));

jest.mock('../src/config/mail', () => ({
  sendVerificationEmail: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../src/modules/users/user.model');
const Consent = require('../src/modules/consents/consent.model');
const { sendVerificationEmail } = require('../src/config/mail');
const { registerUser } = require('../src/modules/auth/auth.service');
const app = require('../src/app');

let user;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

beforeEach(() => {
  jest.clearAllMocks();
  user = null;

  User.findOne.mockImplementation(async ({ email }) =>
    user && user.email === email ? user : null
  );

  User.create.mockImplementation(async (data) => {
    user = {
      ...data,
      _id: '507f1f77bcf86cd799439011',
      verificationStatus: 'pending',
      emailVerified: false,
      save: jest.fn().mockResolvedValue(undefined),
    };

    return user;
  });

  User.findOneAndUpdate.mockImplementation(async (query, update) => {
    const matches =
      user &&
      user.emailVerificationTokenHash !== null &&
      user.emailVerificationTokenHash === query.emailVerificationTokenHash &&
      user.emailVerificationExpires instanceof Date &&
      user.emailVerificationExpires > query.emailVerificationExpires.$gt;

    if (!matches) return null;

    Object.assign(user, update.$set);
    return user;
  });

  Consent.insertMany.mockResolvedValue([]);
  sendVerificationEmail.mockResolvedValue(undefined);
});

test('Registra un usuario y confirma su correo una sola vez', async () => {
  const start = Date.now();

  const register = await request(app)
    .post('/api/auth/register')
    .send({
      email: 'registro@example.com',
      password: 'Prueba12345',
    });

  expect(register.status).toBe(201);
  expect(register.body.email).toBe('registro@example.com');
  expect(register.body).not.toHaveProperty('passwordHash');

  expect(user.passwordHash).not.toBe('Prueba12345');
  expect(await bcrypt.compare('Prueba12345', user.passwordHash)).toBe(true);

  expect(Consent.insertMany).toHaveBeenCalledWith([
    { user: user._id, type: 'privacy', version: '1.0' },
    { user: user._id, type: 'terms', version: '1.0' },
  ]);

  expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

  const [email, token] = sendVerificationEmail.mock.calls[0];

  expect(email).toBe(user.email);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(user.emailVerificationTokenHash).toBe(hashToken(token));
  expect(user.emailVerificationTokenHash).not.toBe(token);
  expect(user.emailVerificationExpires.getTime())
    .toBeGreaterThanOrEqual(start + 24 * 60 * 60 * 1000);
  expect(user.emailVerificationExpires.getTime())
    .toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
  expect(user.save).toHaveBeenCalledTimes(1);

  const verify = await request(app)
    .get('/api/auth/verify-email')
    .query({ token });

  expect(verify.status).toBe(200);
  expect(user.emailVerified).toBe(true);
  expect(user.emailVerificationTokenHash).toBeNull();
  expect(user.emailVerificationExpires).toBeNull();

  const reuse = await request(app)
    .get('/api/auth/verify-email')
    .query({ token });

  expect(reuse.status).toBe(400);
});

test('El servicio rechaza un correo duplicado', async () => {
  user = { email: 'registro@example.com' };

  await expect(
    registerUser({
      email: 'registro@example.com',
      password: 'Prueba12345',
    })
  ).rejects.toMatchObject({ status: 409 });

  expect(User.create).not.toHaveBeenCalled();
  expect(Consent.insertMany).not.toHaveBeenCalled();
  expect(sendVerificationEmail).not.toHaveBeenCalled();
});

test.each([
  ['correo inválido', {
    email: 'correo-invalido',
    password: 'Prueba12345',
  }],
  ['contraseña corta', {
    email: 'registro@example.com',
    password: '123',
  }],
])('Rechaza registro con %s', async (label, body) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send(body);

  expect(res.status).toBe(400);
  expect(res.body.errors).toEqual(expect.any(Array));
  expect(User.findOne).not.toHaveBeenCalled();
  expect(User.create).not.toHaveBeenCalled();
  expect(sendVerificationEmail).not.toHaveBeenCalled();
});

test('Un enlace vencido no confirma el correo', async () => {
  const token = 'a'.repeat(64);

  user = {
    emailVerified: false,
    emailVerificationTokenHash: hashToken(token),
    emailVerificationExpires: new Date(Date.now() - 1000),
  };

  const res = await request(app)
    .get('/api/auth/verify-email')
    .query({ token });

  expect(res.status).toBe(400);
  expect(user.emailVerified).toBe(false);
  expect(user.emailVerificationTokenHash).toBe(hashToken(token));
});

test('Un token desconocido no confirma el correo', async () => {
  const res = await request(app)
    .get('/api/auth/verify-email')
    .query({ token: 'b'.repeat(64) });

  expect(res.status).toBe(400);
});

test('Un token mal formado se rechaza antes de consultar MongoDB', async () => {
  const res = await request(app)
    .get('/api/auth/verify-email')
    .query({ token: 'token-invalido' });

  expect(res.status).toBe(400);
  expect(User.findOneAndUpdate).not.toHaveBeenCalled();
});