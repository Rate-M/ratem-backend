const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    bio: {
      type: String,
      default: '',
      maxlength: 500,
    },
    photos: {
      type: [String],
      required: true,
      validate: {
        validator: (photos) =>
          photos.length >= 1 && photos.length <= 6,
        message: 'El perfil debe tener entre 1 y 6 fotos',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', profileSchema);