const mongoose = require('mongoose');

const consentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['privacy', 'terms', 'biometric', 'location'], required: true },
    version: { type: String, required: true },
    acceptedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Consent', consentSchema);