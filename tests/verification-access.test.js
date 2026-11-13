jest.mock('../src/modules/users/user.model', () => ({ findById: jest.fn() }));
jest.mock('../src/modules/profiles/profile.model', () => ({ findOne: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/modules/users/user.model');
const Profile = require('../src/modules/profiles/profile.model');

process.env.JWT_SECRET = 'verification-test-secret';
const app = require('../src/app');
const userId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ sub: userId, verificationStatus: 'approved' }, process.env.JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
});

test.each(['pending', 'rejected', undefined])('Bloquea perfiles con estado %s', async (status) => {
  User.findById.mockResolvedValue({ verificationStatus: status });
  for (const method of ['get', 'post', 'patch']) {
    const res = await request(app)[method]('/api/profiles/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDENTITY_VERIFICATION_REQUIRED');
  }
  expect(Profile.findOne).not.toHaveBeenCalled();
});

test('Permite estado aprobado y aplica cambios con el mismo token', async () => {
  User.findById.mockResolvedValueOnce({ verificationStatus: 'approved' })
    .mockResolvedValueOnce({ verificationStatus: 'rejected' });
  Profile.findOne.mockResolvedValue({ name: 'Elizabeth', photos: [] });
  const first = await request(app).get('/api/profiles/me').set('Authorization', `Bearer ${token}`);
  const second = await request(app).get('/api/profiles/me').set('Authorization', `Bearer ${token}`);
  expect(first.status).toBe(200);
  expect(second.status).toBe(403);
  expect(User.findById).toHaveBeenCalledWith(userId);
  expect(Profile.findOne).toHaveBeenCalledTimes(1);
});

test('Rechaza usuario eliminado', async () => {
  User.findById.mockResolvedValue(null);
  const res = await request(app).get('/api/profiles/me').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});

test('Sin token no consulta el estado', async () => {
  const res = await request(app).get('/api/profiles/me');
  expect(res.status).toBe(401);
  expect(User.findById).not.toHaveBeenCalled();
});

test.each(['pending', 'approved', 'rejected'])(
  'Consulta el estado actual %s sin exponer otros datos', async (status) => {
    User.findById.mockResolvedValue({ verificationStatus: status, passwordHash: 'privado' });
    const res = await request(app).get('/api/auth/verification-status')
      .query({ userId: 'otro-usuario' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verificationStatus: status });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(User.findById).toHaveBeenCalledWith(userId);
  }
);

test.each([undefined, 'Bearer invalido'])(
  'La consulta de estado requiere autenticación: %s', async (authorization) => {
    const req = request(app).get('/api/auth/verification-status');
    if (authorization) req.set('Authorization', authorization);
    const res = await req;
    expect(res.status).toBe(401);
    expect(User.findById).not.toHaveBeenCalled();
  }
);

test('La consulta de estado rechaza un usuario eliminado', async () => {
  User.findById.mockResolvedValue(null);
  const res = await request(app).get('/api/auth/verification-status')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});
