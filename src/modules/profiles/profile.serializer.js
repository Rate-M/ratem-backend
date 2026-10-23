const { isAdultBirthDate } = require('./profile.validation');

function serializeProfile(profile, today = new Date()) {
  const data = typeof profile.toObject === 'function'
    ? profile.toObject()
    : { ...profile };

  const birthDate = data.birthDate;

  delete data.birthDate;
  delete data.__v;

  data.age = null;

  if (isAdultBirthDate(birthDate, today)) {
    const [year, month, day] = birthDate.split('-').map(Number);

    let age = today.getUTCFullYear() - year;

    const currentMonth = today.getUTCMonth() + 1;
    const currentDay = today.getUTCDate();

    if (
      currentMonth < month ||
      (currentMonth === month && currentDay < day)
    ) {
      age--;
    }

    data.age = age;
  }

  return data;
}

const PUBLIC_FIELDS = [
  'user',
  'name',
  'age',
  'gender',
  'lookingFor',
  'interests',
  'zodiacSign',
  'bio',
  'photos',
];

function serializePublicProfile(profile, today = new Date()) {
  const data = serializeProfile(profile, today);
  const result = {};

  for (const field of PUBLIC_FIELDS) {
    result[field] = data[field];
  }

  result.averageRating = null;
  result.reviewCount = 0;
  result.reviews = [];

  return result;
}

module.exports = { serializeProfile, serializePublicProfile };