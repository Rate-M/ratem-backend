const mongoose = require('mongoose');

const verificationSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
    },
    providerSessionId: {
      type: String,
      required: true,
    },
    verificationUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending',
    },
    providerStatus: {
      type: String,
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

verificationSessionSchema.index(
  { provider: 1, providerSessionId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'VerificationSession',
  verificationSessionSchema
);
