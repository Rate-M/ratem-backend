const Place = require('./place.model');
const PlaceSearch = require('./place-search.model');
const googlePlaces = require('./google-places.client');

const CATEGORY_TYPES = {
  restaurante: ['restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  parque: ['park'],
};
const DEFAULT_RADIUS = 2000;
const MIN_RADIUS = 500;
const MAX_RADIUS = 5000;
const CACHE_DAYS = 30;
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,300}$/;
const ATTRIBUTION = 'Google Maps';

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function parseCoordinate(value, min, max, label) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;

  if (!Number.isFinite(number) || number < min || number > max) {
    fail(`${label} debe ser un número entre ${min} y ${max}`);
  }

  return number;
}

function parseSearchQuery(query) {
  const allowed = ['lat', 'lng', 'category', 'radius'];

  if (Object.keys(query).some((key) => !allowed.includes(key))) {
    fail('Solo se permiten los parámetros lat, lng, category y radius');
  }

  const latitude = Number(parseCoordinate(query.lat, -90, 90, 'lat').toFixed(2));
  const longitude = Number(parseCoordinate(query.lng, -180, 180, 'lng').toFixed(2));

  if (query.category !== undefined && !Object.hasOwn(CATEGORY_TYPES, query.category)) {
    fail('La categoría debe ser restaurante, cafe o parque');
  }

  let radius = DEFAULT_RADIUS;

  if (query.radius !== undefined) {
    radius = Number(query.radius);

    if (!Number.isInteger(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) {
      fail(`El radio debe ser un entero entre ${MIN_RADIUS} y ${MAX_RADIUS} metros`);
    }

    radius = Math.round(radius / 500) * 500;
  }

  return {
    latitude,
    longitude,
    radius,
    categories: query.category ? [query.category] : Object.keys(CATEGORY_TYPES),
  };
}

function serializePlace(category, googlePlaceId, latitude, longitude) {
  return { placeId: googlePlaceId, category, location: { latitude, longitude } };
}

async function searchCategory(category, { latitude, longitude, radius }, now) {
  const key = `${category}:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radius}`;
  const cached = await PlaceSearch.findOne({ key, expiresAt: { $gt: now } });

  if (cached) {
    const places = await Place.find({
      googlePlaceId: { $in: cached.placeIds },
      expiresAt: { $gt: now },
    });

    return places.map((place) => serializePlace(
      category,
      place.googlePlaceId,
      place.location.coordinates[1],
      place.location.coordinates[0]
    ));
  }

  const results = await googlePlaces.searchNearby({
    types: CATEGORY_TYPES[category],
    latitude,
    longitude,
    radius,
  });
  const expiresAt = new Date(now.getTime() + CACHE_DAYS * 24 * 60 * 60 * 1000);

  if (results.length > 0) {
    await Place.bulkWrite(results.map((result) => ({
      updateOne: {
        filter: { googlePlaceId: result.googlePlaceId },
        update: {
          $set: {
            category,
            location: { type: 'Point', coordinates: [result.longitude, result.latitude] },
            source: 'google',
            status: 'approved',
            expiresAt,
          },
        },
        upsert: true,
      },
    })));
  }

  await PlaceSearch.findOneAndUpdate(
    { key },
    { $set: { placeIds: results.map((result) => result.googlePlaceId), expiresAt } },
    { upsert: true }
  );

  return results.map((result) => serializePlace(
    category,
    result.googlePlaceId,
    result.latitude,
    result.longitude
  ));
}

async function searchPlaces(query, now = new Date()) {
  const search = parseSearchQuery(query);
  const seen = new Set();
  const places = [];

  for (const category of search.categories) {
    for (const place of await searchCategory(category, search, now)) {
      if (!seen.has(place.placeId)) {
        seen.add(place.placeId);
        places.push(place);
      }
    }
  }

  return { attribution: ATTRIBUTION, places };
}

async function getPlaceDetails(placeId) {
  if (typeof placeId !== 'string' || !PLACE_ID_PATTERN.test(placeId)) {
    fail('Lugar no encontrado', 404);
  }

  const data = await googlePlaces.getPlaceDetails(placeId);
  const firstPhoto = Array.isArray(data.photos) ? data.photos[0] : null;
  let photo = null;

  if (firstPhoto) {
    try {
      const url = await googlePlaces.getPhotoUri(firstPhoto.name);

      if (url) {
        photo = {
          url,
          authorAttributions: (firstPhoto.authorAttributions || []).map((author) => ({
            displayName: author.displayName ?? null,
            uri: author.uri ?? null,
          })),
        };
      }
    } catch {
      photo = null;
    }
  }

  return {
    attribution: ATTRIBUTION,
    placeId: data.id ?? placeId,
    name: data.displayName?.text ?? null,
    address: data.formattedAddress ?? null,
    location: Number.isFinite(data.location?.latitude) && Number.isFinite(data.location?.longitude)
      ? { latitude: data.location.latitude, longitude: data.location.longitude }
      : null,
    googleMapsUri: data.googleMapsUri ?? null,
    photo,
  };
}

module.exports = { searchPlaces, getPlaceDetails };
