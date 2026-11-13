jest.mock('../src/modules/users/user.model', () => ({ findById: jest.fn(), exists: jest.fn() }));
jest.mock('../src/modules/profiles/profile.model', () => ({ findOne: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/modules/users/user.model');
const Profile = require('../src/modules/profiles/profile.model');
const { serializePublicProfile } = require('../src/modules/profiles/profile.serializer');

process.env.JWT_SECRET = 'public-profile-test-secret';
const app = require('../src/app');
const viewerId = '507f1f77bcf86cd799439011';
const ownerId = '507f1f77bcf86cd799439012';
const token = jwt.sign({ sub: viewerId }, process.env.JWT_SECRET);
const path = `/api/profiles/${ownerId}`;
const today = new Date('2026-11-13T12:00:00Z');

function profileData() {
  return {
    user: ownerId, name: 'Elizabeth', birthDate: '2000-01-15',
    gender: 'mujer', lookingFor: 'amistad', interests: ['Música'],
    zodiacSign: null, bio: 'Hola', photos: ['/uploads/profiles/foto.png'],
    interestedIn: ['hombre'], email: 'privado@example.com',
    passwordHash: 'privado', verificationStatus: 'approved',
    _id: 'perfil-privado', __v: 1, createdAt: today, updatedAt: today,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockResolvedValue({ verificationStatus: 'approved' });
  User.exists.mockResolvedValue({ _id: ownerId });
  Profile.findOne.mockResolvedValue(profileData());
});

test('Consulta el perfil de otro usuario y devuelve solo los campos públicos', async () => {
  const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(User.findById).toHaveBeenCalledWith(viewerId);
  expect(Profile.findOne).toHaveBeenCalledWith({ user: ownerId });
  expect(res.body).toEqual(serializePublicProfile(profileData()));
  expect(Object.keys(res.body).sort()).toEqual([
    'user', 'name', 'age', 'gender', 'lookingFor', 'interests', 'zodiacSign',
    'bio', 'photos', 'averageRating', 'reviewCount', 'reviews',
  ].sort());
  expect(res.body).toMatchObject({ averageRating: null, reviewCount: 0, reviews: [] });
});

test.each([undefined, 'Bearer invalido'])(
  'Requiere autenticación: %s', async (authorization) => {
    const req = request(app).get(path);
    if (authorization) req.set('Authorization', authorization);
    const res = await req;
    expect(res.status).toBe(401);
    expect(Profile.findOne).not.toHaveBeenCalled();
    expect(User.findById).not.toHaveBeenCalled();
  }
);

test.each(['pending', 'rejected'])(
  'No permite consultar con verificación %s', async (status) => {
    User.findById.mockResolvedValue({ verificationStatus: status });
    const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(Profile.findOne).not.toHaveBeenCalled();
  }
);

test('Un identificador inválido responde 404 sin consultar perfiles', async () => {
  const res = await request(app).get('/api/profiles/no-valido')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
  expect(Profile.findOne).not.toHaveBeenCalled();
});

test('Un perfil inexistente responde 404', async () => {
  Profile.findOne.mockResolvedValue(null);
  const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('Perfil no encontrado');
});

test('Oculta perfiles de propietarios eliminados o con solicitud pendiente', async () => {
  User.exists.mockResolvedValue(null);
  const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
  expect(User.exists).toHaveBeenCalledWith({ _id: ownerId, deletionRequestedAt: null });
  expect(Profile.findOne).not.toHaveBeenCalled();
});

test('La ruta /me conserva la consulta al usuario autenticado', async () => {
  const res = await request(app).get('/api/profiles/me')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Profile.findOne).toHaveBeenCalledWith({ user: viewerId });
});

test('Propaga errores de consulta', async () => {
  const error = new Error('Base de datos no disponible');
  Profile.findOne.mockRejectedValue(error);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalledWith(error);
  } finally {
    log.mockRestore();
  }
});

test.each([false, true])('El serializador protege la privacidad con documento Mongoose: %s', (document) => {
  const data = profileData();
  const input = document ? { toObject: () => ({ ...data }) } : data;
  const result = serializePublicProfile(input, today);
  expect(result).toEqual({
    user: ownerId, name: 'Elizabeth', age: 26, gender: 'mujer',
    lookingFor: 'amistad', interests: ['Música'], zodiacSign: null,
    bio: 'Hola', photos: ['/uploads/profiles/foto.png'],
    averageRating: null, reviewCount: 0, reviews: [],
  });
  expect(data.birthDate).toBe('2000-01-15');
  expect(data.__v).toBe(1);
});

test('Un perfil antiguo sin fecha devuelve edad null', () => {
  const data = profileData();
  delete data.birthDate;
  expect(serializePublicProfile(data, today).age).toBeNull();
});
