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

async function updateMyProfile(userId, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('Envía un objeto con name o bio');
  }

  const keys = Object.keys(data);

  if (
    keys.length === 0 ||
    keys.some((key) => !['name', 'bio'].includes(key))
  ) {
    fail('Solo puedes editar name y bio');
  }

  const updates = {};

  if (Object.hasOwn(data, 'name')) {
    if (
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      data.name.trim().length > 100
    ) {
      fail('El nombre es obligatorio y debe tener máximo 100 caracteres');
    }

    updates.name = data.name.trim();
  }

  if (Object.hasOwn(data, 'bio')) {
    if (typeof data.bio !== 'string' || data.bio.length > 500) {
      fail('La biografía debe tener máximo 500 caracteres');
    }

    updates.bio = data.bio;
  }

  const profile = await Profile.findOneAndUpdate(
    { user: userId },
    { $set: updates },
    { returnDocument: 'after', runValidators: true }
  );

  if (!profile) {
    fail('Todavía no tienes un perfil', 404);
  }

  return profile;
}

module.exports = { createProfile, getMyProfile, updateMyProfile };