const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const uploadDirectory = path.resolve('uploads', 'profiles');

function getExtension(file) {
  const buffer = file.buffer;

  const isJpg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  if (isJpg && file.mimetype === 'image/jpeg') return '.jpg';
  if (isPng && file.mimetype === 'image/png') return '.png';

  const error = new Error('El archivo no tiene una cabecera JPG o PNG válida');
  error.status = 400;
  throw error;
}

async function deletePhotos(filenames) {
  await Promise.all(
    filenames.map((filename) =>
      fs.rm(path.join(uploadDirectory, filename), { force: true })
    )
  );
}

async function savePhotos(files) {
  const extensions = files.map(getExtension);
  const filenames = [];

  await fs.mkdir(uploadDirectory, { recursive: true });

  try {
    for (let index = 0; index < files.length; index++) {
      const filename = crypto.randomUUID() + extensions[index];
      filenames.push(filename);

      await fs.writeFile(
        path.join(uploadDirectory, filename),
        files[index].buffer
      );
    }

    return filenames;
  } catch (error) {
    await deletePhotos(filenames);
    throw error;
  }
}

module.exports = { savePhotos, deletePhotos, uploadDirectory };