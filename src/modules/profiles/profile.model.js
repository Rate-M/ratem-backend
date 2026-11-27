const mongoose = require('mongoose');
const { isAdultBirthDate } = require('./profile.validation');

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { _id: false }
);

const preferencesSchema = new mongoose.Schema(
  {
    minAge: { type: Number, min: 18, max: 99, default: 18 },
    maxAge: { type: Number, min: 18, max: 99, default: 99 },
    maxDistanceKm: { type: Number, min: 1, max: 150, default: 50 },
  },
  { _id: false }
);

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
    birthDate: {
      type: String,
      required: true,
      validate: {
        validator: isAdultBirthDate,
        message: 'La fecha debe ser válida y debes tener al menos 18 años',
      },
    },
    gender: {
      type: String,
      required: true,
      enum: [
        'mujer',
        'hombre',
        'no_binario',
        'otra_identidad',
        'prefiero_no_decir',
      ],
    },
    interestedIn: {
      type: [{
        type: String,
        enum: ['mujer', 'hombre', 'no_binario', 'otra_identidad'],
      }],
      validate: {
        validator: (values) =>
          values.length >= 1 &&
          values.length <= 4 &&
          new Set(values).size === values.length,
        message: 'Selecciona al menos una preferencia, sin repetir',
      },
    },
    lookingFor: {
      type: String,
      required: true,
      enum: ['relacion', 'amistad', 'conocer_personas', 'no_lo_se'],
    },
    interests: {
      type: [{
        type: String,
        trim: true,
        minlength: 1,
        maxlength: 40,
      }],
      default: [],
      validate: {
        validator: (values) =>
          values.length <= 10 &&
          new Set(values.map((value) => value.toLowerCase())).size ===
            values.length,
        message: 'Puedes agregar hasta 10 intereses, sin repetir',
      },
    },
    zodiacSign: {
      type: String,
      default: null,
      enum: [
        'aries',
        'tauro',
        'geminis',
        'cancer',
        'leo',
        'virgo',
        'libra',
        'escorpio',
        'sagitario',
        'capricornio',
        'acuario',
        'piscis',
        null,
      ],
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
    preferences: {
      type: preferencesSchema,
      default: () => ({}),
    },
    location: {
      type: pointSchema,
      default: undefined,
    },
    locationUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

profileSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Profile', profileSchema);