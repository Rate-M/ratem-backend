const mongoose = require('mongoose');

const dateCheckinSchema = new mongoose.Schema(
  {
    invitation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DateInvitation',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
    },
    at: {
      type: Date,
      required: true,
    },
    distanceMeters: {
      type: Number,
      required: true,
      min: 0,
    },
    accuracyMeters: {
      type: Number,
      required: true,
      min: 0,
    },
    withinRadius: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true }
);

dateCheckinSchema.index({ invitation: 1, user: 1 }, { unique: true });
dateCheckinSchema.index({ participants: 1 });

module.exports = mongoose.model('DateCheckin', dateCheckinSchema);
