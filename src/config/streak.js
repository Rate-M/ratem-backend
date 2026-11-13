const MIN_THRESHOLD_DAYS = 3;
const MAX_THRESHOLD_DAYS = 5;
const DEFAULT_THRESHOLD_DAYS = 3;

function getStreakThresholdDays() {
  const raw = process.env.STREAK_THRESHOLD_DAYS;

  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_THRESHOLD_DAYS;
  }

  const value = Number(raw.trim());

  if (
    !/^\d+$/.test(raw.trim()) ||
    value < MIN_THRESHOLD_DAYS ||
    value > MAX_THRESHOLD_DAYS
  ) {
    const error = new Error(
      `STREAK_THRESHOLD_DAYS debe ser un número entero entre ${MIN_THRESHOLD_DAYS} y ${MAX_THRESHOLD_DAYS}`
    );
    error.status = 500;
    throw error;
  }

  return value;
}

function hasReachedStreakThreshold(days) {
  return Number.isInteger(days) && days >= getStreakThresholdDays();
}

module.exports = {
  MIN_THRESHOLD_DAYS,
  MAX_THRESHOLD_DAYS,
  getStreakThresholdDays,
  hasReachedStreakThreshold,
};
