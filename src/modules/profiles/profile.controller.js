const {
  serializeProfile,
  serializePublicProfile,
} = require('./profile.serializer');

const {
  createProfile,
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  updateMyLocation,
  clearLocation,
  updateMyPreferences,
} = require('./profile.service');

async function create(req, res, next) {
  try {
    const profile = await createProfile(
      req.user.id,
      req.body,
      req.files
    );

    res.status(201).json(serializeProfile(profile));
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const profile = await getMyProfile(req.user.id);
    res.status(200).json(serializeProfile(profile));
  } catch (error) {
    next(error);
  }
}

async function updateMe(req, res, next) {
  try {
    const profile = await updateMyProfile(
      req.user.id,
      req.body
    );

    res.status(200).json(serializeProfile(profile));
  } catch (error) {
    next(error);
  }
}

async function getPublic(req, res, next) {
  try {
    const profile = await getPublicProfile(req.params.id);
    res.status(200).json(serializePublicProfile(profile));
  } catch (error) {
    next(error);
  }
}

async function updateLocation(req, res, next) {
  try {
    const profile = await updateMyLocation(req.user.id, req.body);
    res.status(200).json(serializeProfile(profile));
  } catch (error) {
    next(error);
  }
}

async function deleteLocation(req, res, next) {
  try {
    await clearLocation(req.user.id);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
}

async function updatePreferences(req, res, next) {
  try {
    const profile = await updateMyPreferences(req.user.id, req.body);
    res.status(200).json(serializeProfile(profile));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  create,
  getMe,
  updateMe,
  getPublic,
  updateLocation,
  deleteLocation,
  updatePreferences,
};