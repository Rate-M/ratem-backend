const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    category: {
      type: String,
      enum: ['restaurante', 'cafe', 'parque'],
      required: true,
    },
    location: {
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
    source: {
      type: String,
      enum: ['google', 'community'],
      required: true,
    },
    googlePlaceId: {
      type: String,
      default: undefined,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

placeSchema.index({ googlePlaceId: 1 }, { unique: true, sparse: true });
placeSchema.index({ location: '2dsphere' });
placeSchema.index({ status: 1, category: 1 });
placeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Place', placeSchema);
