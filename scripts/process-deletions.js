require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/modules/users/user.model');
const { processDeletion } = require('../src/modules/users/user-deletion.service');

async function main() {
  await connectDB();
  let completed = 0;
  let failed = 0;
  for await (const user of User.find({ deletionRequestedAt: { $ne: null } }).select('_id').cursor()) {
    try {
      await processDeletion(user._id);
      completed++;
    } catch {
      failed++;
    }
  }
  console.log(`Eliminaciones completadas: ${completed}. Pendientes por error: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch(() => {
  console.error('No se pudo completar el proceso de eliminación');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
