const { isAdultBirthDate } = require('../../utils/birth-date');

function applyVerificationRules(result, today = new Date()) {
  if (result.status !== 'approved') return result;

  const validToday = today instanceof Date && !Number.isNaN(today.getTime());
  return {
    ...result,
    status: validToday && isAdultBirthDate(result.dateOfBirth, today)
      ? 'approved'
      : 'rejected',
  };
}

module.exports = { applyVerificationRules };
