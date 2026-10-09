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

module.exports = { serializeProfile };