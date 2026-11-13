const mongoose = require('mongoose');

const placeSearchSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    placeIds: {
      type: [String],
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

placeSearchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PlaceSearch', placeSearchSchema);
