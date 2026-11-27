const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Match = require('../src/modules/matches/match.model');
const Message = require('../src/modules/messages/message.model');
const StreakJob = require('../src/modules/streaks/streak-job.model');
const { localDate, localMidnight, runStreakCatchUp } = require('../src/modules/streaks/streak.service');

let server;
let match;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([Match.init(), Message.init(), StreakJob.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

beforeEach(async () => {
  await Promise.all([Match.deleteMany({}), Message.deleteMany({}), StreakJob.deleteMany({})]);
  match = await Match.create({
    userA: new mongoose.Types.ObjectId(),
    userB: new mongoose.Types.ObjectId(),
  });
});

async function sendAt(instant, from = 'userA') {
  const timestamp = (Date.parse(instant) / 1000).toString(16);
  const suffix = new mongoose.Types.ObjectId().toHexString().slice(8);
  await Message.create({
    _id: new mongoose.Types.ObjectId(timestamp + suffix),
    match: match._id,
    sender: match[from],
    recipient: match[from === 'userA' ? 'userB' : 'userA'],
    clientMessageId: suffix,
    text: 'Hola',
    createdAt: new Date(instant),
  });
}

async function streak() {
  return (await Match.findById(match._id).lean()).streak;
}

test('Los límites del día respetan la zona del calendario incluso cuando cambia el horario', () => {
  const zone = 'America/New_York';
  expect(localMidnight('2026-03-08', zone).toISOString()).toBe('2026-03-08T05:00:00.000Z');
  expect(localMidnight('2026-03-09', zone).toISOString()).toBe('2026-03-09T04:00:00.000Z');
  expect(localDate(new Date('2026-11-26T05:59:59Z'))).toBe('2026-11-25');
  expect(localDate(new Date('2026-11-26T06:00:00Z'))).toBe('2026-11-26');
});

test('Agrupa mensajes por día local, recupera los días pendientes y reinicia después de un día unilateral', async () => {
  await sendAt('2026-11-24T23:59:59Z');
  await sendAt('2026-11-25T05:59:59Z', 'userB');
  const firstRun = new Date('2026-11-25T06:00:00Z');
  await runStreakCatchUp(firstRun);
  expect(await streak()).toMatchObject({ current: 1, lastCountedDate: '2026-11-24' });
  expect(await runStreakCatchUp(firstRun)).toEqual([]);

  for (const day of [25, 26]) {
    await sendAt(`2026-11-${day}T06:00:00Z`);
    await sendAt(`2026-11-${day}T06:00:01Z`, 'userB');
  }
  const catchUp = new Date('2026-11-27T06:00:00Z');
  const threshold = jest.replaceProperty(process, 'env', { ...process.env, STREAK_THRESHOLD_DAYS: '3' });
  try {
    expect(await runStreakCatchUp(catchUp)).toEqual([
      { date: '2026-11-25', qualifying: 1 },
      { date: '2026-11-26', qualifying: 1 },
    ]);
    expect(await streak()).toMatchObject({ current: 3, unlockedAt: catchUp });
  } finally {
    threshold.restore();
  }

  await sendAt('2026-11-27T06:00:00Z');
  await runStreakCatchUp(new Date('2026-11-28T06:00:00Z'));
  expect(await streak()).toMatchObject({ current: 0, unlockedAt: null });
});

test('Un día sin mensajes reinicia una racha vigente', async () => {
  await sendAt('2026-11-24T06:00:00Z');
  await sendAt('2026-11-24T06:00:01Z', 'userB');
  await runStreakCatchUp(new Date('2026-11-25T06:00:00Z'));
  expect(await streak()).toMatchObject({ current: 1 });
  await runStreakCatchUp(new Date('2026-11-26T06:00:00Z'));
  expect(await streak()).toMatchObject({ current: 0, unlockedAt: null });
});
