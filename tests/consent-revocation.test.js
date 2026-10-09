jest.mock('../src/modules/consents/consent.model', () => ({
  updateMany: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Consent = require('../src/modules/consents/consent.model');

process.env.JWT_SECRET = 'clave-exclusiva-para-pruebas';

const app = require('../src/app');

const userId = '507f1f77bcf86cd799439011';

const token = jwt.sign(
  { sub: userId, role: 'user' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

beforeEach(() => {
  jest.clearAllMocks();

  Consent.updateMany.mockResolvedValue({
    matchedCount: 1,
    modifiedCount: 1,
  });
});

test.each(['biometric', 'location'])(
  'Revoca %s solo para el usuario autenticado',
  async (type) => {
    const start = Date.now();

    const res = await request(app)
      .delete(`/api/consents/${type}`)
      .set('Authorization', `Bearer ${token}`);

    const end = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('El consentimiento quedó revocado');
    expect(Consent.updateMany).toHaveBeenCalledTimes(1);

    const [filter, update] = Consent.updateMany.mock.calls[0];

    expect(filter).toEqual({
      user: userId,
      type,
      revokedAt: null,
    });

    expect(Object.keys(update)).toEqual(['$set']);
    expect(Object.keys(update.$set)).toEqual(['revokedAt']);

    const revokedAt = update.$set.revokedAt;

    expect(revokedAt).toBeInstanceOf(Date);
    expect(revokedAt.getTime()).toBeGreaterThanOrEqual(start);
    expect(revokedAt.getTime()).toBeLessThanOrEqual(end);
  }
);

test('Revocar sin consentimiento activo también responde 200', async () => {
  Consent.updateMany.mockResolvedValue({
    matchedCount: 0,
    modifiedCount: 0,
  });

  const res = await request(app)
    .delete('/api/consents/biometric')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Consent.updateMany).toHaveBeenCalledTimes(1);
});

test('Sin token rechaza la revocación', async () => {
  const res = await request(app)
    .delete('/api/consents/location');

  expect(res.status).toBe(401);
  expect(Consent.updateMany).not.toHaveBeenCalled();
});

test('Con token inválido rechaza la revocación', async () => {
  const res = await request(app)
    .delete('/api/consents/location')
    .set('Authorization', 'Bearer token-invalido');

  expect(res.status).toBe(401);
  expect(Consent.updateMany).not.toHaveBeenCalled();
});

test.each(['privacy', 'terms', 'desconocido'])(
  'Rechaza revocar el tipo %s mediante esta ruta',
  async (type) => {
    const res = await request(app)
      .delete(`/api/consents/${type}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Tipo de consentimiento inválido');
    expect(Consent.updateMany).not.toHaveBeenCalled();
  }
);
