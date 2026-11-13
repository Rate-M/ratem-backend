const { applyVerificationRules } = require('../src/modules/verification/verification.rules');
const today = new Date('2026-11-12T12:00:00Z');

test.each([
  ['2000-05-10', 'approved'],
  ['2012-05-10', 'rejected'],
  [undefined, 'rejected'],
  [null, 'rejected'],
  ['fecha inválida', 'rejected'],
  ['2000-02-30', 'rejected'],
  ['2030-05-10', 'rejected'],
])('Evalúa la fecha documental %s antes de aprobar', (dateOfBirth, status) => {
  const result = {
    providerSessionId: 'sesion-1', providerStatus: 'Approved',
    status: 'approved', dateOfBirth,
  };
  expect(applyVerificationRules(result, today)).toEqual({ ...result, status });
  expect(result.status).toBe('approved');
});

test.each(['rejected', 'expired', null])('Respeta el veredicto %s del proveedor', (status) => {
  const result = { status, dateOfBirth: '2000-01-01' };
  expect(applyVerificationRules(result, today)).toEqual(result);
});

test('No aprueba usando la fecha declarada en el perfil', () => {
  const result = { status: 'approved', birthDate: '1990-01-01' };
  expect(applyVerificationRules(result, today).status).toBe('rejected');
});
