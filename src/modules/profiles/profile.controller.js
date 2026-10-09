const {
  createProfile,
  getMyProfile,
} = require('./profile.service');

async function create(req, res, next) {
  try {
    const profile = await createProfile(
      req.user.id,
      req.body,
      req.files
    );

    res.status(201).json(profile);
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const profile = await getMyProfile(req.user.id);
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
}

module.exports = { create, getMe };