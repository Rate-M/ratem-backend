const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 6,
    fields: 2,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png'];

    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error('Solo se permiten fotos JPG o PNG');
      error.status = 400;
      return cb(error);
    }

    cb(null, true);
  },
});

module.exports = upload;