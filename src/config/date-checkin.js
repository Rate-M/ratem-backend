const SETTINGS = {
  radiusMeters: { env: 'DATE_CHECKIN_RADIUS_METERS', default: 100, min: 25, max: 1000 },
  windowMinutes: { env: 'DATE_CHECKIN_WINDOW_MINUTES', default: 60, min: 15, max: 240 },
  maxAccuracyMeters: { env: 'DATE_CHECKIN_MAX_ACCURACY_METERS', default: 150, min: 10, max: 1000 },
};

function readSetting({ env, default: fallback, min, max }) {
  const raw = process.env[env];

  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw.trim());

  if (!/^\d+$/.test(raw.trim()) || value < min || value > max) {
    const error = new Error(`${env} debe ser un número entero entre ${min} y ${max}`);
    error.status = 500;
    throw error;
  }

  return value;
}

function getDateCheckinSettings() {
  return Object.fromEntries(
    Object.entries(SETTINGS).map(([key, setting]) => [key, readSetting(setting)])
  );
}

module.exports = { getDateCheckinSettings };
