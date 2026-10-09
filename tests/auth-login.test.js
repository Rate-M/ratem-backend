jest.mock('../src/modules/users/user.model', () => ({
  findOne: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../src/modules/users/user.model');

process.env.JWT_SECRET = 'clave-exclusiva-para-pruebas';
process.env.JWT_EXPIRES_IN = '1h';

const app = require('../src/app');

const user = {
  _id: '507f1f77bcf86cd799439011',
  email: 'login@example.com',
  passwordHash: bcrypt.hashSync('Prueba12345', 10),
  role: 'user',
  verificationStatus: 'pending',
};

beforeEach(() => {
  jest.clearAllMocks();
  User.findOne.mockResolvedValue(user);
});

test('Credenciales correctas devuelven un JWT válido', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: user.email,
      password: 'Prueba12345',
    });

  expect(res.status).toBe(200);

  const payload = jwt.verify(
    res.body.token,
    process.env.JWT_SECRET
  );

  expect(payload.sub).toBe(user._id);
  expect(payload.role).toBe('user');
  expect(payload.exp).toBeGreaterThan(payload.iat);
  expect(res.body.user.email).toBe(user.email);
  expect(res.body.user).not.toHaveProperty('passwordHash');
});

test('Contraseña incorrecta devuelve 401 sin token', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: user.email,
      password: 'Incorrecta123',
    });

  expect(res.status).toBe(401);
  expect(res.body.message).toBe('Credenciales inválidas');
  expect(res.body).not.toHaveProperty('token');
});

test('Correo inexistente devuelve el mismo error', async () => {
  User.findOne.mockResolvedValue(null);

  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'inexistente@example.com',
      password: 'Prueba12345',
    });

  expect(res.status).toBe(401);
  expect(res.body.message).toBe('Credenciales inválidas');
  expect(res.body).not.toHaveProperty('token');
});

test.each([
  ['correo mal formado', {
    email: 'esto-no-es-un-correo',
    password: 'Prueba12345',
  }],
  ['contraseña ausente', {
    email: 'login@example.com',
  }],
])('Rechaza %s antes de consultar usuarios', async (label, body) => {
  const res = await request(app)
    .post('/api/auth/login')
    .send(body);

  expect(res.status).toBe(400);
  expect(res.body.errors).toEqual(expect.any(Array));
  expect(User.findOne).not.toHaveBeenCalled();
  expect(res.body).not.toHaveProperty('token');
});