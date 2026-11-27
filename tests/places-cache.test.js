jest.mock('../src/modules/places/google-places.client', () => ({
  searchNearby: jest.fn(),
}));

const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Place = require('../src/modules/places/place.model');
const PlaceSearch = require('../src/modules/places/place-search.model');
const googlePlaces = require('../src/modules/places/google-places.client');
const { searchPlaces } = require('../src/modules/places/place.service');

const query = { lat: '25.541', lng: '-103.441', category: 'cafe', radius: '2100' };
let server;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
  await Promise.all([Place.init(), PlaceSearch.init()]);
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (server) await server.stop();
});

beforeEach(async () => {
  googlePlaces.searchNearby.mockReset();
  await Promise.all([Place.deleteMany({}), PlaceSearch.deleteMany({})]);
});

test('Búsquedas equivalentes reutilizan la caché y vuelven a consultar al vencer', async () => {
  const now = new Date();
  googlePlaces.searchNearby.mockResolvedValue([
    { googlePlaceId: 'google-place-1', latitude: 25.54, longitude: -103.44 },
  ]);
  const first = await searchPlaces(query, now);
  expect(first.places).toEqual([
    { placeId: 'google-place-1', category: 'cafe', location: { latitude: 25.54, longitude: -103.44 } },
  ]);
  expect(await searchPlaces({ ...query, lat: '25.542', radius: '2000' }, now)).toEqual(first);
  expect(googlePlaces.searchNearby).toHaveBeenCalledTimes(1);
  expect(googlePlaces.searchNearby).toHaveBeenCalledWith({
    types: ['cafe', 'coffee_shop'], latitude: 25.54, longitude: -103.44, radius: 2000,
  });

  const afterExpiry = new Date(now.getTime() + 31 * 86400000);
  expect(await searchPlaces(query, afterExpiry)).toEqual(first);
  expect(googlePlaces.searchNearby).toHaveBeenCalledTimes(2);
});

test('La caché conserva resultados vacíos y las búsquedas inválidas no llaman al proveedor', async () => {
  googlePlaces.searchNearby.mockResolvedValue([]);
  await expect(searchPlaces({ ...query, radius: '6000' })).rejects.toMatchObject({ status: 400 });
  await expect(searchPlaces({ ...query, category: 'invalida' })).rejects.toMatchObject({ status: 400 });
  expect(googlePlaces.searchNearby).not.toHaveBeenCalled();

  const now = new Date();
  expect((await searchPlaces(query, now)).places).toEqual([]);
  expect((await searchPlaces(query, now)).places).toEqual([]);
  expect(googlePlaces.searchNearby).toHaveBeenCalledTimes(1);
});
