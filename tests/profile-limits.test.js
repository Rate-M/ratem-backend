jest.mock('../src/modules/profiles/profile.model', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../src/modules/profiles/photo.service', () => ({
  savePhotos: jest.fn(),
  deletePhotos: jest.fn(),
  uploadDirectory: '/tmp/ratem-test-photos',
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Profile = require('../src/modules/profiles/profile.model');
const { savePhotos } = require('../src/modules/profiles/photo.service');

process.env.JWT_SECRET = 'clave-exclusiva-para-pruebas';

const app = require('../src/app');

const token = jwt.sign(
  { sub: '507f1f77bcf86cd799439011', role: 'user' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);

beforeEach(() => {
  jest.clearAllMocks();

  Profile.findOne.mockResolvedValue(null);

  Profile.create.mockImplementation(async (data) => data);

  Profile.findOneAndUpdate.mockImplementation(
    async (filter, update) => ({
      user: filter.user,
      name: 'Elizabeth',
      bio: update.$set.bio,
      photos: ['/uploads/profiles/original.png'],
    })
  );

  savePhotos.mockImplementation(async (files) =>
    files.map((file, index) => `foto-${index}.png`)
  );
});

test.each([1, 6])('Acepta un perfil con %i fotos', async (count) => {
  const req = request(app)
    .post('/api/profiles/me')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Elizabeth')
    .field('birthDate', '2000-01-15')
    .field('gender', 'mujer')
    .field('interestedIn', '["hombre"]')
    .field('lookingFor', 'conocer_personas');

  for (let index = 0; index < count; index++) {
    req.attach('photos', photo, {
      filename: `foto-${index}.png`,
      contentType: 'image/png',
    });
  }

  const res = await req;

  expect(res.status).toBe(201);
  expect(res.body.photos).toHaveLength(count);
});

test.each([0, 7])('Rechaza un perfil con %i fotos', async (count) => {
  const req = request(app)
    .post('/api/profiles/me')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Elizabeth')
    .field('birthDate', '2000-01-15')
    .field('gender', 'mujer')
    .field('interestedIn', '["hombre"]')
    .field('lookingFor', 'conocer_personas')

  for (let index = 0; index < count; index++) {
    req.attach('photos', photo, {
      filename: `foto-${index}.png`,
      contentType: 'image/png',
    });
  }

  const res = await req;

  expect(res.status).toBe(400);
  expect(Profile.create).not.toHaveBeenCalled();
  expect(savePhotos).not.toHaveBeenCalled();
});

test.each([
  [500, 201],
  [501, 400],
])('Crear perfil con biografía de %i caracteres', async (length, status) => {
  const res = await request(app)
    .post('/api/profiles/me')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Elizabeth')
    .field('birthDate', '2000-01-15')
    .field('gender', 'mujer')
    .field('interestedIn', '["hombre"]')
    .field('lookingFor', 'conocer_personas')
    .field('bio', 'a'.repeat(length))
    .attach('photos', photo, {
      filename: 'foto.png',
      contentType: 'image/png',
    });

  expect(res.status).toBe(status);

  if (status === 201) {
    expect(res.body.bio).toHaveLength(length);
  } else {
    expect(Profile.create).not.toHaveBeenCalled();
    expect(savePhotos).not.toHaveBeenCalled();
  }
});

test.each([
  [500, 200],
  [501, 400],
])('Editar biografía con %i caracteres', async (length, status) => {
  const res = await request(app)
    .patch('/api/profiles/me')
    .set('Authorization', `Bearer ${token}`)
    .send({ bio: 'a'.repeat(length) });

  expect(res.status).toBe(status);

  if (status === 200) {
    expect(res.body.bio).toHaveLength(length);
  } else {
    expect(Profile.findOneAndUpdate).not.toHaveBeenCalled();
  }
});