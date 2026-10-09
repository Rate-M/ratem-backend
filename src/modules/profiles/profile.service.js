const Profile = require('./profile.model');
const { savePhotos, deletePhotos } = require('./photo.service');
const { normalizeProfileData } = require('./profile.validation');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function createProfile(userId, data, files = []) {
  const fields = normalizeProfileData(data);

  if (files.length < 1 || files.length > 6) {
    fail('Debes subir entre 1 y 6 fotos');
  }

  const existing = await Profile.findOne({ user: userId });

  if (existing) {
    fail('Ya tienes un perfil', 409);
  }

  const filenames = await savePhotos(files);

  try {
    return await Profile.create({
      ...fields,
      user: userId,
      photos: filenames.map(
        (filename) => `/uploads/profiles/${filename}`
      ),
    });
  } catch (error) {
    await deletePhotos(filenames);

    if (error.code === 11000) {
      fail('Ya tienes un perfil', 409);
    }

    if (error.name === 'ValidationError') {
      error.status = 400;
    }

    throw error;
  }
}

async function getMyProfile(userId) {
  const profile = await Profile.findOne({ user: userId });

  if (!profile) {
    fail('Todavía no tienes un perfil', 404);
  }

  return profile;
}

async function updateMyProfile(userId, data) {
  const updates = normalizeProfileData(data, true);

  let profile;

  try {
    profile = await Profile.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (error) {
    if (error.name === 'ValidationError') {
      error.status = 400;
    }

    throw error;
  }

  if (!profile) {
    fail('Todavía no tienes un perfil', 404);
  }

  return profile;
}

module.exports = { createProfile, getMyProfile, updateMyProfile };