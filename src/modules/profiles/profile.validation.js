function isAdultBirthDate(value, today = new Date()) {
  if (typeof value !== 'string') return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const birthDate = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.toISOString().slice(0, 10) !== value
  ) {
    return false;
  }

  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();

  const [birthYear, birthMonth, birthDay] = value
    .split('-')
    .map(Number);

  let age = year - birthYear;

  if (
    month < birthMonth ||
    (month === birthMonth && day < birthDay)
  ) {
    age--;
  }

  return age >= 18;
}

function normalizeProfileData(data, partial = false) {
  function fail(message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('Envía los campos del perfil');
  }

  const allowed = [
    'name',
    'birthDate',
    'gender',
    'interestedIn',
    'lookingFor',
    'interests',
    'zodiacSign',
    'bio',
  ];

  const keys = Object.keys(data);

  if (
    keys.length === 0 ||
    keys.some((key) => !allowed.includes(key))
  ) {
    fail('Enviaste campos de perfil no permitidos');
  }

  const required = [
    'name',
    'birthDate',
    'gender',
    'interestedIn',
    'lookingFor',
  ];

  if (!partial && required.some((key) => !Object.hasOwn(data, key))) {
    fail('Faltan campos obligatorios del perfil');
  }

  const result = {};

  for (const key of keys) {
    let value = data[key];

    if (key === 'interestedIn' || key === 'interests') {
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          fail(`${key} debe ser una lista JSON válida`);
        }
      }

      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== 'string')
      ) {
        fail(`${key} debe ser una lista de textos`);
      }

      value = value.map((item) => item.trim());

      if (
        new Set(value.map((item) => item.toLowerCase())).size !==
        value.length
      ) {
        fail(`${key} no debe contener valores repetidos`);
      }
    }

    if (
      key === 'name' &&
      (typeof value !== 'string' ||
        !value.trim() ||
        value.trim().length > 100)
    ) {
      fail('El nombre es obligatorio y debe tener máximo 100 caracteres');
    }

    if (key === 'name') value = value.trim();

    if (key === 'birthDate' && !isAdultBirthDate(value)) {
      fail('La fecha debe ser válida y debes tener al menos 18 años');
    }

    if (
      key === 'gender' &&
      ![
        'mujer', 'hombre', 'no_binario',
        'otra_identidad', 'prefiero_no_decir',
      ].includes(value)
    ) {
      fail('Selecciona un género válido');
    }

    if (
      key === 'interestedIn' &&
      (value.length < 1 ||
        value.length > 4 ||
        value.some((item) =>
          !['mujer', 'hombre', 'no_binario', 'otra_identidad']
            .includes(item)
        ))
    ) {
      fail('Selecciona al menos una preferencia válida');
    }

    if (
      key === 'lookingFor' &&
      !['relacion', 'amistad', 'conocer_personas', 'no_lo_se']
        .includes(value)
    ) {
      fail('Selecciona qué buscas');
    }

    if (
      key === 'interests' &&
      (value.length > 10 ||
        value.some((item) => item.length < 1 || item.length > 40))
    ) {
      fail('Agrega máximo 10 intereses de entre 1 y 40 caracteres');
    }

    if (
      key === 'zodiacSign' &&
      ![
        'aries', 'tauro', 'geminis', 'cancer', 'leo', 'virgo',
        'libra', 'escorpio', 'sagitario', 'capricornio',
        'acuario', 'piscis', null,
      ].includes(value)
    ) {
      fail('Selecciona un signo válido o envía null');
    }

    if (
      key === 'bio' &&
      (typeof value !== 'string' || value.length > 500)
    ) {
      fail('La biografía debe tener máximo 500 caracteres');
    }

    result[key] = value;
  }

  if (!partial) {
    result.bio ??= '';
    result.interests ??= [];
    result.zodiacSign ??= null;
  }

  return result;
}

module.exports = { isAdultBirthDate, normalizeProfileData };
