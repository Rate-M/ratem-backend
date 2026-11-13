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

test.each([
  ['Cumple 17 años', '2009-11-12', '2026-11-12T12:00:00Z', 'rejected'],
  ['Un día antes de cumplir 18', '2008-11-13', '2026-11-12T12:00:00Z', 'rejected'],
  ['Cumple 18 hoy', '2008-11-12', '2026-11-12T00:00:00Z', 'approved'],
  ['Un día después de cumplir 18', '2008-11-11', '2026-11-12T12:00:00Z', 'approved'],
  ['Antes del cumpleaños en otro mes', '2008-12-01', '2026-11-30T23:59:59Z', 'rejected'],
  ['Cumpleaños al cambiar de mes', '2008-12-01', '2026-12-01T00:00:00Z', 'approved'],
  ['Antes del cumpleaños al cambiar de año', '2009-01-01', '2026-12-31T23:59:59Z', 'rejected'],
  ['Cumpleaños al cambiar de año', '2009-01-01', '2027-01-01T00:00:00Z', 'approved'],
  ['Nacimiento bisiesto: 28 de febrero', '2008-02-29', '2026-02-28T23:59:59Z', 'rejected'],
  ['Nacimiento bisiesto: 1 de marzo', '2008-02-29', '2026-03-01T00:00:00Z', 'approved'],
  ['Cumpleaños en año bisiesto', '2006-02-28', '2024-02-28T00:00:00Z', 'approved'],
  ['Todavía menor en año bisiesto', '2006-03-01', '2024-02-29T23:59:59Z', 'rejected'],
  ['Mismo instante con zona distinta', '2008-11-12', '2026-11-11T18:00:00-06:00', 'approved'],
])('%s', (label, dateOfBirth, instant, expected) => {
  const result = { status: 'approved', dateOfBirth };
  expect(applyVerificationRules(result, new Date(instant)).status).toBe(expected);
});
