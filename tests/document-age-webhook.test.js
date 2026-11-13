jest.mock('../src/modules/users/user.model', () => ({ updateOne: jest.fn() }));
jest.mock('../src/modules/verification/verification.model', () => ({
  findOne: jest.fn(), findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/modules/verification/providers', () => ({
  getProvider: jest.fn(),
}));

const User = require('../src/modules/users/user.model');
const Session = require('../src/modules/verification/verification.model');
const { getProvider } = require('../src/modules/verification/providers');
const { handleWebhook } = require('../src/modules/verification/verification.service');

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2026-11-12T12:00:00Z'));
});
afterEach(() => jest.useRealTimers());

test.each([
  ['2000-05-10', 'approved'],
  ['2012-05-10', 'rejected'],
  [null, 'rejected'],
  ['2009-11-12', 'rejected'], // Cumple 17 años.
  ['2008-11-13', 'rejected'], // Falta un día para cumplir 18.
  ['2008-11-12', 'approved'], // Cumple exactamente 18.
  ['2008-11-11', 'approved'], // Cumplió 18 ayer.
])('El webhook persiste solo el veredicto con fecha %s', async (dateOfBirth, status) => {
  const provider = {
    name: 'didit', verifyWebhook: jest.fn().mockReturnValue(true),
    parseWebhook: jest.fn().mockReturnValue({
      providerSessionId: 'proveedor-1', providerStatus: 'Approved',
      status: 'approved', dateOfBirth,
    }),
  };
  getProvider.mockReturnValue(provider);
  Session.findOne.mockResolvedValue({ _id: 'sesion-1', user: 'usuario-1', status: 'pending' });
  Session.findOneAndUpdate.mockResolvedValue({ status });
  await handleWebhook({ rawBody: Buffer.from('{}'), headers: {}, body: {} });
  expect(Session.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: 'sesion-1', status: 'pending' },
    { $set: { providerStatus: 'Approved', status, decidedAt: new Date() } },
    { returnDocument: 'after' }
  );
  expect(User.updateOne).toHaveBeenCalledWith(
    { _id: 'usuario-1' }, { $set: { verificationStatus: status } }
  );
});
