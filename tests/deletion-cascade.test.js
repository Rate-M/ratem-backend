jest.mock('../src/modules/users/user.model', () => ({ findOne: jest.fn(), deleteOne: jest.fn() }));
jest.mock('../src/modules/profiles/profile.model', () => ({ findOne: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../src/modules/consents/consent.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/verification/verification.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/swipes/swipe.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/matches/match.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/profiles/photo.service', () => ({ deletePhotos: jest.fn() }));

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const User = require('../src/modules/users/user.model');
const Profile = require('../src/modules/profiles/profile.model');
const Consent = require('../src/modules/consents/consent.model');
const Session = require('../src/modules/verification/verification.model');
const Swipe = require('../src/modules/swipes/swipe.model');
const Match = require('../src/modules/matches/match.model');
const photos = require('../src/modules/profiles/photo.service');
const { processDeletion } = require('../src/modules/users/user-deletion.service');

let directory;
let realPhotos;
let state;
const target = 'cuenta-a';
const other = 'cuenta-b';
const active = 'cuenta-activa';

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ratem-cascade-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(directory);
    realPhotos = jest.requireActual('../src/modules/profiles/photo.service');
  } finally {
    process.chdir(originalCwd);
  }
  await fs.mkdir(realPhotos.uploadDirectory, { recursive: true });
});
afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function matches(record, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$ne' in value) {
      return record[key] != null && record[key] !== value.$ne;
    }
    return record[key] === value;
  });
}

beforeEach(async () => {
  jest.resetAllMocks();
  state = {
    users: [
      { _id: target, deletionRequestedAt: new Date() },
      { _id: other, deletionRequestedAt: new Date() },
      { _id: active, deletionRequestedAt: null },
    ],
    profiles: [
      { user: target, photos: ['/uploads/profiles/a-1.png', '/uploads/profiles/a-2.jpg'] },
      { user: other, photos: ['/uploads/profiles/b-1.png'] },
    ],
    consents: [
      { user: target, type: 'privacy' }, { user: target, type: 'biometric' },
      { user: target, type: 'location', revokedAt: new Date() }, { user: other, type: 'privacy' },
    ],
    sessions: [
      { user: target, status: 'pending' }, { user: target, status: 'approved' },
      { user: target, status: 'rejected' }, { user: other, status: 'approved' },
    ],
    swipes: [
      { from: target, to: other, action: 'like' }, { from: other, to: target, action: 'like' },
      { from: target, to: active, action: 'pass' }, { from: other, to: active, action: 'like' },
    ],
    matches: [
      { userA: target, userB: other }, { userA: other, userB: target },
      { userA: other, userB: active },
    ],
  };
  User.findOne.mockImplementation(async (filter) => state.users.find((row) => matches(row, filter)));
  Profile.findOne.mockImplementation(async (filter) => state.profiles.find((row) => matches(row, filter)));
  for (const [model, method, collection] of [
    [User, 'deleteOne', 'users'], [Profile, 'deleteMany', 'profiles'],
    [Consent, 'deleteMany', 'consents'], [Session, 'deleteMany', 'sessions'],
  ]) {
    model[method].mockImplementation(async (filter) => {
      state[collection] = state[collection].filter((row) => !matches(row, filter));
      return { acknowledged: true };
    });
  }
  Swipe.deleteMany.mockImplementation(async (filter) => {
    state.swipes = state.swipes.filter((row) => !filter.$or.some((condition) => matches(row, condition)));
    return { acknowledged: true };
  });
  Match.deleteMany.mockImplementation(async (filter) => {
    state.matches = state.matches.filter((row) => !filter.$or.some((condition) => matches(row, condition)));
    return { acknowledged: true };
  });
  photos.deletePhotos.mockImplementation(realPhotos.deletePhotos);
  for (const filename of ['a-1.png', 'a-2.jpg', 'b-1.png']) {
    await fs.writeFile(path.join(realPhotos.uploadDirectory, filename), 'fixture de prueba');
  }
});

async function expectTargetDeleted() {
  expect(state.users.map((row) => row._id)).toEqual([other, active]);
  for (const collection of ['profiles', 'consents', 'sessions']) {
    expect(state[collection].some((row) => row.user === target)).toBe(false);
    expect(state[collection].some((row) => row.user === other)).toBe(true);
  }
  expect(state.swipes).toEqual([{ from: other, to: active, action: 'like' }]);
  expect(state.matches).toEqual([{ userA: other, userB: active }]);
  expect((await fs.readdir(realPhotos.uploadDirectory)).sort()).toEqual(['b-1.png']);
  expect(await fs.readFile(path.join(realPhotos.uploadDirectory, 'b-1.png'), 'utf8'))
    .toBe('fixture de prueba');
}

test('Borra todos los datos y archivos del solicitante y conserva los de otras cuentas', async () => {
  await processDeletion(target);
  await expectTargetDeleted();
});

test.each(['photos', 'profile', 'consents', 'sessions', 'swipes', 'matches', 'user'])(
  'Se recupera de un fallo en %s sin perder la solicitud', async (step) => {
    const operations = {
      photos: photos.deletePhotos, profile: Profile.deleteMany,
      consents: Consent.deleteMany, sessions: Session.deleteMany,
      swipes: Swipe.deleteMany, matches: Match.deleteMany, user: User.deleteOne,
    };
    operations[step].mockRejectedValueOnce(new Error('Fallo temporal'));
    await expect(processDeletion(target)).rejects.toThrow('Fallo temporal');
    expect(state.users.find((row) => row._id === target).deletionRequestedAt).toBeInstanceOf(Date);
    expect(state.users.some((row) => row._id === other)).toBe(true);
    await processDeletion(target);
    await expectTargetDeleted();
  }
);

test('Reintenta tras un borrado parcial de fotos reales', async () => {
  photos.deletePhotos.mockImplementationOnce(async (filenames) => {
    await realPhotos.deletePhotos([filenames[0]]);
    throw new Error('Interrupción de disco');
  });
  await expect(processDeletion(target)).rejects.toThrow('Interrupción de disco');
  expect(state.profiles.some((row) => row.user === target)).toBe(true);
  expect(await fs.readdir(realPhotos.uploadDirectory)).not.toContain('a-1.png');
  await processDeletion(target);
  await expectTargetDeleted();
});

test('Una segunda ejecución sobre una cuenta ya borrada no afecta a otras cuentas', async () => {
  await processDeletion(target);
  const snapshot = JSON.stringify(state);
  photos.deletePhotos.mockClear();
  await processDeletion(target);
  expect(JSON.stringify(state)).toBe(snapshot);
  expect(photos.deletePhotos).not.toHaveBeenCalled();
  await expectTargetDeleted();
});

test('Una cuenta activa no se borra aunque se invoque el proceso con su identificador', async () => {
  const snapshot = JSON.stringify(state);
  await processDeletion(active);
  expect(JSON.stringify(state)).toBe(snapshot);
  expect(photos.deletePhotos).not.toHaveBeenCalled();
  expect((await fs.readdir(realPhotos.uploadDirectory)).sort()).toEqual(['a-1.png', 'a-2.jpg', 'b-1.png']);
});

test('Un archivo ya ausente no interrumpe la cascada', async () => {
  await fs.rm(path.join(realPhotos.uploadDirectory, 'a-1.png'));
  await processDeletion(target);
  await expectTargetDeleted();
});
