const Profile = require('./profile.model');
const { savePhotos, deletePhotos } = require('./photo.service');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function createProfile(userId, data, files = []) {
  const { name, bio = '' } = data;

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 100
  ) {
    fail('El nombre es obligatorio y debe tener máximo 100 caracteres');
  }

  if (typeof bio !== 'string' || bio.length > 500) {
    fail('La biografía debe tener máximo 500 caracteres');
  }

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
      user: userId,
      name: name.trim(),
      bio,
      photos: filenames.map(
        (filename) => `/uploads/profiles/${filename}`
      ),
    });
  } catch (error) {
    await deletePhotos(filenames);

    if (error.code === 11000) {
      fail('Ya tienes un perfil', 409);
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

module.exports = { createProfile, getMyProfile };