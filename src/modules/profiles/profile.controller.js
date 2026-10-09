const { serializeProfile } = require('./profile.serializer');

const {
  createProfile,
  getMyProfile,
  updateMyProfile,
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

module.exports = { create, getMe, updateMe };