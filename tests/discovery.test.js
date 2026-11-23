const os = require('os');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'discovery-test-secret';

const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Profile = require('../src/modules/profiles/profile.model');
const Swipe = require('../src/modules/swipes/swipe.model');
const Consent = require('../src/modules/consents/consent.model');
const { CURRENT_VERSIONS } = require('../src/config/legal');

const CENTER = { latitude: 20.67, longitude: -103.35 };
const ALL_GENDERS = ['mujer', 'hombre', 'no_binario', 'otra_identidad'];

let server;
let sequence = 0;

jest.setTimeout(30000);

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([User.init(), Profile.init(), Swipe.init(), Consent.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Profile.deleteMany({}),
    Swipe.deleteMany({}),
    Consent.deleteMany({}),
  ]);
});

function birthDateForAge(age, offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const year = date.getUTCFullYear() - age;
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pointAtKm(km) {
  const degrees = km / (111.32 * Math.cos((CENTER.latitude * Math.PI) / 180));
  return { type: 'Point', coordinates: [CENTER.longitude + degrees, CENTER.latitude] };
}

async function createPerson(name, options = {}) {
  sequence += 1;
  const {
    gender = 'hombre',
    interestedIn = ['mujer'],
    age = 30,
    birthDate = birthDateForAge(age),
    km = 3,
    preferences,
    verificationStatus = 'approved',
    deletionRequestedAt = null,
    withLocation = true,
  } = options;

  const user = await User.create({
    email: `persona${sequence}@example.com`,
    passwordHash: 'hash',
    verificationStatus,
    deletionRequestedAt,
  });

  await Profile.create({
    user: user._id,
    name,
    birthDate,
    gender,
    interestedIn,
    lookingFor: 'relacion',
    photos: ['/uploads/profiles/foto.png'],
    ...(preferences ? { preferences } : {}),
    ...(withLocation ? { location: pointAtKm(km) } : {}),
  });

  return user;
}

function tokenFor(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function discover(user, query = '') {
  return request(app)
    .get(`/api/discovery${query}`)
    .set('Authorization', `Bearer ${tokenFor(user)}`);
}

async function namesFor(user) {
  const res = await discover(user);
  expect(res.status).toBe(200);
  return res.body.profiles.map((profile) => profile.name);
}

function createSeeker(options = {}) {
  return createPerson('Buscadora', {
    gender: 'mujer',
    interestedIn: ['hombre'],
    age: 28,
    km: 0,
    preferences: { minAge: 22, maxAge: 35, maxDistanceKm: 20 },
    ...options,
  });
}

describe('Filtros del descubrimiento', () => {
  test('Ordena por distancia y devuelve la distancia redondeada en km', async () => {
    const seeker = await createSeeker();
    await createPerson('A 10 km', { km: 10 });
    await createPerson('A 3 km', { km: 3 });
    await createPerson('A 6 km', { km: 6 });

    const res = await discover(seeker);

    expect(res.status).toBe(200);
    expect(res.body.profiles.map((profile) => profile.name)).toEqual(['A 3 km', 'A 6 km', 'A 10 km']);
    expect(res.body.profiles.map((profile) => profile.distanceKm)).toEqual([3, 6, 10]);
  });

  test('Respeta mi distancia máxima y la distancia máxima del otro perfil', async () => {
    const seeker = await createSeeker();
    await createPerson('Dentro de ambos radios', { km: 5 });
    await createPerson('Fuera de mi radio', { km: 40 });
    await createPerson('Su radio es menor', {
      km: 5,
      preferences: { minAge: 18, maxAge: 99, maxDistanceKm: 2 },
    });

    expect(await namesFor(seeker)).toEqual(['Dentro de ambos radios']);
  });

  test('Respeta mi rango de edad incluyendo los límites exactos', async () => {
    const seeker = await createSeeker();
    await createPerson('Cumple 22 hoy', { birthDate: birthDateForAge(22) });
    await createPerson('Cumple 22 mañana', { birthDate: birthDateForAge(22, 1) });
    await createPerson('Cumple 35 hoy', { birthDate: birthDateForAge(35) });
    await createPerson('Cumple 36 hoy', { birthDate: birthDateForAge(36) });

    const names = await namesFor(seeker);

    expect(names.sort()).toEqual(['Cumple 22 hoy', 'Cumple 35 hoy']);
  });

  test('Excluye perfiles cuyo rango de edad no me incluye', async () => {
    const seeker = await createSeeker();
    await createPerson('Me incluye');
    await createPerson('Busca menores de 25', {
      preferences: { minAge: 18, maxAge: 25, maxDistanceKm: 50 },
    });

    expect(await namesFor(seeker)).toEqual(['Me incluye']);
  });

  test('El interés de género es mutuo', async () => {
    const seeker = await createSeeker();
    await createPerson('Compatible');
    await createPerson('No le intereso', { interestedIn: ['hombre'] });
    await createPerson('No me interesa', { gender: 'mujer', interestedIn: ['mujer'] });

    expect(await namesFor(seeker)).toEqual(['Compatible']);
  });

  test('Quien prefiere no decir su género no exige reciprocidad', async () => {
    const seeker = await createSeeker({ gender: 'prefiero_no_decir', interestedIn: ['hombre'] });
    await createPerson('Busca solo mujeres', { interestedIn: ['mujer'] });
    await createPerson('Es mujer', { gender: 'mujer', interestedIn: ['mujer'] });

    expect(await namesFor(seeker)).toEqual(['Busca solo mujeres']);
  });

  test('Un perfil que prefiere no decir solo aparece a quien busca todos los géneros', async () => {
    await createPerson('Reservado', { gender: 'prefiero_no_decir', interestedIn: ALL_GENDERS });
    const everyone = await createSeeker({ interestedIn: ALL_GENDERS });
    const onlyMen = await createSeeker({ interestedIn: ['hombre'] });

    expect(await namesFor(everyone)).toContain('Reservado');
    expect(await namesFor(onlyMen)).not.toContain('Reservado');
  });

  test('Excluye cuentas sin verificar, en eliminación, sin ubicación y mi propio perfil', async () => {
    const seeker = await createSeeker();
    await createPerson('Disponible');
    await createPerson('Pendiente', { verificationStatus: 'pending' });
    await createPerson('Rechazado', { verificationStatus: 'rejected' });
    await createPerson('En eliminación', { deletionRequestedAt: new Date() });
    await createPerson('Sin ubicación', { withLocation: false });

    expect(await namesFor(seeker)).toEqual(['Disponible']);
  });

  test('No expone datos privados de los perfiles', async () => {
    const seeker = await createSeeker();
    await createPerson('Compatible');

    const res = await discover(seeker);
    const [profile] = res.body.profiles;

    for (const field of ['location', 'birthDate', 'interestedIn', 'preferences', 'distance']) {
      expect(profile).not.toHaveProperty(field);
    }
    expect(profile).toMatchObject({ name: 'Compatible', age: 30, distanceKm: 3 });
  });

  test('Limita la cantidad de resultados', async () => {
    const seeker = await createSeeker();
    for (let index = 1; index <= 4; index++) {
      await createPerson(`Perfil ${index}`, { km: index });
    }

    const res = await discover(seeker, '?limit=2');

    expect(res.body.profiles.map((profile) => profile.name)).toEqual(['Perfil 1', 'Perfil 2']);
    expect((await discover(seeker)).body.profiles).toHaveLength(4);
  });

  test.each(['?limit=0', '?limit=21', '?limit=abc', '?limit=2.5', '?otro=1'])(
    'Rechaza parámetros inválidos %s',
    async (query) => {
      const seeker = await createSeeker();
      expect((await discover(seeker, query)).status).toBe(400);
    }
  );
});

describe('No repetición', () => {
  test.each(['like', 'pass'])('Un perfil evaluado con %s ya no vuelve a aparecer', async (action) => {
    const seeker = await createSeeker();
    const first = await createPerson('Primero', { km: 2 });
    await createPerson('Segundo', { km: 4 });

    expect(await namesFor(seeker)).toEqual(['Primero', 'Segundo']);

    const swipe = await request(app)
      .post('/api/swipes')
      .set('Authorization', `Bearer ${tokenFor(seeker)}`)
      .send({ to: String(first._id), action });

    expect(swipe.status).toBe(201);
    expect(await namesFor(seeker)).toEqual(['Segundo']);
  });

  test('Que otra persona me evalúe no me oculta su perfil', async () => {
    const seeker = await createSeeker();
    const other = await createPerson('Me evaluó');
    await Swipe.create({ from: other._id, to: seeker._id, action: 'like' });

    expect(await namesFor(seeker)).toEqual(['Me evaluó']);
  });

  test('Cuando ya evalué a todos, la lista queda vacía', async () => {
    const seeker = await createSeeker();
    const only = await createPerson('Único');
    await Swipe.create({ from: seeker._id, to: only._id, action: 'pass' });

    expect(await namesFor(seeker)).toEqual([]);
  });
});

describe('Requisitos para descubrir', () => {
  test('Sin perfil responde PROFILE_REQUIRED', async () => {
    const user = await User.create({ email: 'sinperfil@example.com', passwordHash: 'hash', verificationStatus: 'approved' });
    const res = await discover(user);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });

  test('Sin ubicación responde LOCATION_REQUIRED', async () => {
    const seeker = await createSeeker({ withLocation: false });
    const res = await discover(seeker);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOCATION_REQUIRED');
  });

  test('Requiere sesión y verificación aprobada', async () => {
    const pending = await createSeeker({ verificationStatus: 'pending' });

    expect((await request(app).get('/api/discovery')).status).toBe(401);
    expect((await discover(pending)).status).toBe(403);
  });
});

describe('Ubicación y preferencias del perfil', () => {
  async function grantLocation(user) {
    await Consent.create({ user: user._id, type: 'location', version: CURRENT_VERSIONS.location });
  }

  test('Guarda la ubicación aproximada y reemplaza la anterior', async () => {
    const seeker = await createSeeker({ withLocation: false });
    await grantLocation(seeker);
    const auth = `Bearer ${tokenFor(seeker)}`;

    await request(app).put('/api/profiles/me/location').set('Authorization', auth)
      .send({ latitude: 20.671234, longitude: -103.354321 }).expect(200);
    await request(app).put('/api/profiles/me/location').set('Authorization', auth)
      .send({ latitude: 19.432608, longitude: -99.133209 }).expect(200);

    const profile = await Profile.findOne({ user: seeker._id }).lean();

    expect(profile.location).toEqual({ type: 'Point', coordinates: [-99.13, 19.43] });
    expect(profile.locationUpdatedAt).toBeInstanceOf(Date);
  });

  test('Sin consentimiento de ubicación no se guarda', async () => {
    const seeker = await createSeeker({ withLocation: false });

    const res = await request(app).put('/api/profiles/me/location')
      .set('Authorization', `Bearer ${tokenFor(seeker)}`)
      .send(CENTER);

    expect(res.status).toBe(403);
    expect((await Profile.findOne({ user: seeker._id }).lean()).location).toBeUndefined();
  });

  test.each([
    [{ latitude: 95, longitude: 0 }],
    [{ latitude: '20', longitude: -103 }],
    [{ latitude: 20 }],
    [{ latitude: 20, longitude: -103, extra: true }],
  ])('Rechaza coordenadas inválidas %j', async (body) => {
    const seeker = await createSeeker({ withLocation: false });
    await grantLocation(seeker);

    const res = await request(app).put('/api/profiles/me/location')
      .set('Authorization', `Bearer ${tokenFor(seeker)}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  test('Revocar el consentimiento de ubicación la borra y bloquea el descubrimiento', async () => {
    const seeker = await createSeeker();
    await grantLocation(seeker);
    await createPerson('Compatible');

    await request(app).delete('/api/consents/location')
      .set('Authorization', `Bearer ${tokenFor(seeker)}`).expect(200);

    expect((await Profile.findOne({ user: seeker._id }).lean()).location).toBeUndefined();
    expect((await discover(seeker)).body.code).toBe('LOCATION_REQUIRED');
  });

  test('Borrar la ubicación también bloquea el descubrimiento', async () => {
    const seeker = await createSeeker();

    await request(app).delete('/api/profiles/me/location')
      .set('Authorization', `Bearer ${tokenFor(seeker)}`).expect(204);

    expect((await discover(seeker)).status).toBe(409);
  });

  test('Las preferencias nuevas cambian los resultados', async () => {
    const seeker = await createSeeker();
    await createPerson('A 15 km', { km: 15 });
    const auth = `Bearer ${tokenFor(seeker)}`;

    expect(await namesFor(seeker)).toEqual(['A 15 km']);

    const res = await request(app).patch('/api/profiles/me/preferences')
      .set('Authorization', auth).send({ maxDistanceKm: 10 });

    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({ minAge: 22, maxAge: 35, maxDistanceKm: 10 });
    expect(await namesFor(seeker)).toEqual([]);
  });

  test.each([
    [{ minAge: 17 }],
    [{ maxAge: 100 }],
    [{ maxDistanceKm: 0 }],
    [{ minAge: 40 }],
    [{ minAge: 25.5 }],
    [{ color: 'rojo' }],
    [{}],
  ])('Rechaza preferencias inválidas %j', async (body) => {
    const seeker = await createSeeker();

    const res = await request(app).patch('/api/profiles/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(seeker)}`)
      .send(body);

    expect(res.status).toBe(400);
  });
});
