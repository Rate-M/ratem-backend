const { searchPlaces, getPlaceDetails } = require('./place.service');

async function search(req, res, next) {
  try {
    res.status(200).json(await searchPlaces(req.query));
  } catch (error) {
    next(error);
  }
}

async function details(req, res, next) {
  try {
    res.status(200).json(await getPlaceDetails(req.params.placeId));
  } catch (error) {
    next(error);
  }
}

module.exports = { search, details };
