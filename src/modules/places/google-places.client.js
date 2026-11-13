const API_URL = 'https://places.googleapis.com/v1';
const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;

  if (!key) {
    fail('Falta configurar GOOGLE_PLACES_API_KEY', 500);
  }

  return key;
}

async function request(url, options) {
  let response;

  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch {
    fail('No se pudo conectar con Google Places', 502);
  }

  if (response.status === 404) {
    fail('Lugar no encontrado', 404);
  }

  if (!response.ok) {
    fail('Google Places rechazó la solicitud', 502);
  }

  return response.json();
}

async function searchNearby({ types, latitude, longitude, radius }) {
  const apiKey = getApiKey();

  const data = await request(`${API_URL}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.location',
    },
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      languageCode: 'es',
      locationRestriction: {
        circle: { center: { latitude, longitude }, radius },
      },
    }),
  });

  return (Array.isArray(data.places) ? data.places : [])
    .filter((place) =>
      typeof place?.id === 'string' &&
      Number.isFinite(place.location?.latitude) &&
      Number.isFinite(place.location?.longitude)
    )
    .map((place) => ({
      googlePlaceId: place.id,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    }));
}

async function getPlaceDetails(placeId) {
  const apiKey = getApiKey();

  return request(`${API_URL}/places/${placeId}?languageCode=es`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,photos,googleMapsUri',
    },
  });
}

async function getPhotoUri(photoName) {
  if (typeof photoName !== 'string' || !PHOTO_NAME_PATTERN.test(photoName)) {
    return null;
  }

  const params = new URLSearchParams({
    maxWidthPx: '800',
    skipHttpRedirect: 'true',
    key: getApiKey(),
  });

  const data = await request(`${API_URL}/${photoName}/media?${params}`, { method: 'GET' });

  return typeof data.photoUri === 'string' ? data.photoUri : null;
}

module.exports = { searchNearby, getPlaceDetails, getPhotoUri };
