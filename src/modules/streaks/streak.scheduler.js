const cron = require('node-cron');
const { STREAK_TIMEZONE, runStreakCatchUp } = require('./streak.service');

let running = false;

async function runSafely() {
  if (running) {
    return;
  }

  running = true;

  try {
    const processed = await runStreakCatchUp();

    if (processed.length > 0) {
      console.log(`Racha diaria procesada: ${processed.map((day) => day.date).join(', ')}`);
    }
  } catch (error) {
    console.error('Error al procesar la racha diaria:', error.message);
  } finally {
    running = false;
  }
}

function startStreakScheduler() {
  runSafely();

  return cron.schedule('5 0 * * *', runSafely, { timezone: STREAK_TIMEZONE });
}

module.exports = { startStreakScheduler };
