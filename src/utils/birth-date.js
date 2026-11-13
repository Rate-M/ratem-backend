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

module.exports = { isAdultBirthDate };
