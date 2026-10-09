const {
  isAdultBirthDate,
  normalizeProfileData,
} = require('../src/modules/profiles/profile.validation');

const { serializeProfile } = require(
  '../src/modules/profiles/profile.serializer'
);

const today = new Date('2026-10-09T12:00:00.000Z');

function validProfile() {
  return {
    name: 'Elizabeth',
    birthDate: '2000-01-15',
    gender: 'mujer',
    interestedIn: ['hombre'],
    lookingFor: 'conocer_personas',
    interests: ['Música', 'Videojuegos'],
    zodiacSign: null,
    bio: 'Mi perfil',
  };
}

test('Acepta a quien cumple 18 años hoy', () => {
  expect(isAdultBirthDate('2008-10-09', today)).toBe(true);
});

test('Rechaza a quien cumple 18 años mañana', () => {
  expect(isAdultBirthDate('2008-10-10', today)).toBe(false);
});

test.each([
  '2026-02-30',
  '2027-01-01',
  '15/01/2000',
  '',
  null,
])('Rechaza la fecha inválida o futura %s', (birthDate) => {
  expect(isAdultBirthDate(birthDate, today)).toBe(false);
});

test('Normaliza listas JSON enviadas junto con las fotos', () => {
  const result = normalizeProfileData({
    ...validProfile(),
    name: ' Elizabeth ',
    interestedIn: '["hombre", "no_binario"]',
    interests: '[" Música ", "Videojuegos"]',
  });

  expect(result.name).toBe('Elizabeth');
  expect(result.interestedIn).toEqual(['hombre', 'no_binario']);
  expect(result.interests).toEqual(['Música', 'Videojuegos']);
});

test.each([
  ['género inválido', { gender: 'valor-invalido' }],
  ['preferencias vacías', { interestedIn: [] }],
  ['preferencias repetidas', { interestedIn: ['hombre', 'hombre'] }],
  ['preferencia inválida', { interestedIn: ['valor-invalido'] }],
  ['intereses repetidos', { interests: ['Música', 'música'] }],
  ['interés vacío', { interests: ['   '] }],
  ['interés demasiado largo', { interests: ['a'.repeat(41)] }],
  ['demasiados intereses', {
    interests: Array.from({ length: 11 }, (_, index) => `Interés ${index}`),
  }],
  ['lista JSON inválida', { interests: '[incorrecto' }],
  ['lista con valores numéricos', { interests: [123] }],
  ['objetivo inválido', { lookingFor: 'valor-invalido' }],
  ['signo inválido', { zodiacSign: 'valor-invalido' }],
])('Rechaza %s', (label, changes) => {
  expect(() =>
    normalizeProfileData({ ...validProfile(), ...changes })
  ).toThrow();
});

test('Exige los campos obligatorios al crear', () => {
  expect(() =>
    normalizeProfileData({ name: 'Elizabeth' })
  ).toThrow('Faltan campos obligatorios');
});

test('PATCH permite enviar solo los intereses', () => {
  expect(
    normalizeProfileData({ interests: ['Música'] }, true)
  ).toEqual({ interests: ['Música'] });
});

test('PATCH rechaza un cambio del dueño', () => {
  expect(() =>
    normalizeProfileData({ user: 'otro-usuario' }, true)
  ).toThrow('campos de perfil no permitidos');
});

test('La respuesta muestra edad y oculta fecha sin modificar el original', () => {
  const original = {
    ...validProfile(),
    __v: 0,
    photos: ['/uploads/profiles/foto.png'],
  };

  const result = serializeProfile(original, today);

  expect(result.age).toBe(26);
  expect(result).not.toHaveProperty('birthDate');
  expect(result).not.toHaveProperty('__v');
  expect(result.photos).toEqual(original.photos);
  expect(original.birthDate).toBe('2000-01-15');
});

test('Un perfil antiguo sin fecha muestra edad null', () => {
  const result = serializeProfile({ name: 'Elizabeth' }, today);

  expect(result.age).toBeNull();
  expect(result).not.toHaveProperty('birthDate');
});