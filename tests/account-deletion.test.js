jest.mock('../src/modules/users/user.model', () => ({
  findById: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), deleteOne: jest.fn(),
}));
jest.mock('../src/modules/profiles/profile.model', () => ({ findOne: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../src/modules/consents/consent.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/verification/verification.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/swipes/swipe.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/matches/match.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/messages/message.model', () => ({ deleteMany: jest.fn() }));
jest.mock('../src/modules/profiles/photo.service', () => ({
  deletePhotos: jest.fn(), uploadDirectory: '/tmp/ratem-deletion-test',
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../src/modules/users/user.model');
const Profile = require('../src/modules/profiles/profile.model');
const Consent = require('../src/modules/consents/consent.model');
const Session = require('../src/modules/verification/verification.model');
const Swipe = require('../src/modules/swipes/swipe.model');
const Match = require('../src/modules/matches/match.model');
const Message = require('../src/modules/messages/message.model');
const { deletePhotos } = require('../src/modules/profiles/photo.service');
const { requestDeletion, processDeletion } = require('../src/modules/users/user-deletion.service');
const { loginUser } = require('../src/modules/auth/auth.service');

process.env.JWT_SECRET = 'deletion-test-secret';
const app = require('../src/app');
const userId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
const passwordHash = bcrypt.hashSync('Prueba12345', 4);
const endpoint = '/api/users/me/deletion-requests';

beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockResolvedValue({ _id: userId, passwordHash });
  User.findOneAndUpdate.mockResolvedValue({ _id: userId });
  User.findOne.mockResolvedValue({ _id: userId, deletionRequestedAt: new Date() });
  Profile.findOne.mockResolvedValue({ photos: ['/uploads/profiles/foto-1.png'] });
});

test('Solicita borrado sin exigir identidad aprobada y revoca enlaces de recuperación', async () => {
  const res = await request(app).post(endpoint).set('Authorization', `Bearer ${token}`)
    .send({ password: 'Prueba12345', confirmDeletion: true });
  expect(res.status).toBe(202);
  expect(res.body.status).toBe('pending');
  expect(User.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: userId, deletionRequestedAt: null },
    { $set: {
      deletionRequestedAt: expect.any(Date), passwordResetTokenHash: null,
      passwordResetExpires: null, emailVerificationTokenHash: null, emailVerificationExpires: null,
    } },
    { returnDocument: 'after' }
  );
  expect(User.deleteOne).not.toHaveBeenCalled();
});

test('Contraseña incorrecta no solicita eliminación', async () => {
  const res = await request(app).post(endpoint).set('Authorization', `Bearer ${token}`)
    .send({ password: 'incorrecta', confirmDeletion: true });
  expect(res.status).toBe(401);
  expect(User.findOneAndUpdate).not.toHaveBeenCalled();
});

test.each([
  { password: 'Prueba12345' },
  { password: 'Prueba12345', confirmDeletion: true, userId: 'otra-cuenta' },
])('Exige confirmación y rechaza cambiar el propietario: %j', async (body) => {
  const res = await request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send(body);
  expect(res.status).toBe(400);
  expect(User.findOneAndUpdate).not.toHaveBeenCalled();
});

test('Sin autenticación no permite solicitar borrado', async () => {
  const res = await request(app).post(endpoint).send({ password: 'Prueba12345', confirmDeletion: true });
  expect(res.status).toBe(401);
  expect(User.findById).not.toHaveBeenCalled();
});

test.each(['/api/profiles/me', '/api/auth/verification-status', '/api/consents/me'])(
  'Un JWT emitido antes de solicitar borrado deja de funcionar en %s', async (path) => {
    User.findById.mockResolvedValue({ deletionRequestedAt: new Date() });
    const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(Profile.findOne).not.toHaveBeenCalled();
  }
);

test('Un JWT de una cuenta ya borrada deja de funcionar', async () => {
  User.findById.mockResolvedValue(null);
  const res = await request(app).get('/api/consents/me').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});

test('Una cuenta pendiente no puede volver a iniciar sesión', async () => {
  await expect(loginUser({ email: 'test@example.com', password: 'Prueba12345' }))
    .rejects.toMatchObject({ status: 401 });
});

test('El borrado elimina archivos y datos asociados antes del usuario', async () => {
  const order = [];
  deletePhotos.mockImplementation(async () => order.push('photos'));
  Profile.deleteMany.mockImplementation(async () => order.push('profile'));
  Consent.deleteMany.mockImplementation(async () => order.push('consent'));
  Session.deleteMany.mockImplementation(async () => order.push('sessions'));
  Swipe.deleteMany.mockImplementation(async () => order.push('swipes'));
  Message.deleteMany.mockImplementation(async () => order.push('messages'));
  Match.deleteMany.mockImplementation(async () => order.push('matches'));
  User.deleteOne.mockImplementation(async () => order.push('user'));
  await processDeletion(userId);
  expect(order).toEqual(['photos', 'profile', 'consent', 'sessions', 'swipes', 'messages', 'matches', 'user']);
  expect(deletePhotos).toHaveBeenCalledWith(['foto-1.png']);
  for (const model of [Profile, Consent, Session]) {
    expect(model.deleteMany).toHaveBeenCalledWith({ user: userId });
  }
  expect(Swipe.deleteMany).toHaveBeenCalledWith({ $or: [{ from: userId }, { to: userId }] });
  expect(Match.deleteMany).toHaveBeenCalledWith({ $or: [{ userA: userId }, { userB: userId }] });
  expect(Message.deleteMany).toHaveBeenCalledWith({ $or: [{ sender: userId }, { recipient: userId }] });
  expect(User.deleteOne).toHaveBeenCalledWith({ _id: userId, deletionRequestedAt: { $ne: null } });
});

test.each(['files', 'database'])(
  'Un error en %s conserva la cuenta marcada y permite reintento', async (failure) => {
    const error = new Error('Fallo temporal');
    if (failure === 'files') deletePhotos.mockRejectedValueOnce(error);
    else Consent.deleteMany.mockRejectedValueOnce(error);
    await expect(processDeletion(userId)).rejects.toBe(error);
    expect(User.deleteOne).not.toHaveBeenCalled();
    if (failure === 'files') expect(Profile.deleteMany).not.toHaveBeenCalled();
    await processDeletion(userId);
    expect(User.deleteOne).toHaveBeenCalledTimes(1);
  }
);

test('No borra cuentas que no tengan solicitud', async () => {
  User.findOne.mockResolvedValue(null);
  await processDeletion(userId);
  expect(deletePhotos).not.toHaveBeenCalled();
  expect(User.deleteOne).not.toHaveBeenCalled();
});

test('No usa rutas fuera del directorio de fotos', async () => {
  Profile.findOne.mockResolvedValue({ photos: ['/uploads/profiles/../../archivo.png'] });
  await expect(processDeletion(userId)).rejects.toThrow('Ruta de foto');
  expect(deletePhotos).not.toHaveBeenCalled();
  expect(User.deleteOne).not.toHaveBeenCalled();
});

test('También borra cuentas que no alcanzaron a crear perfil', async () => {
  Profile.findOne.mockResolvedValue(null);
  await processDeletion(userId);
  expect(deletePhotos).toHaveBeenCalledWith([]);
  expect(User.deleteOne).toHaveBeenCalled();
});

test('Una solicitud concurrente no sobrescribe el estado existente', async () => {
  User.findOneAndUpdate.mockResolvedValue(null);
  await expect(requestDeletion(userId, 'Prueba12345')).rejects.toMatchObject({ status: 409 });
});
