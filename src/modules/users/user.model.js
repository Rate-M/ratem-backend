const mongoose = require('mongoose');
const Decision = require('../moderation/decision.schema');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    deletionRequestedAt: {
      type: Date,
      default: null,
      index: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationTokenHash: {
      type: String,
      default: null,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    role: {
      type: String,
      enum: ['user', 'moderator', 'admin'],
      default: 'user',
    },
    underWatch: { type: Boolean, default: false },
    suspendedUntil: { type: Date, default: null },
    suspendedPermanently: { type: Boolean, default: false },
    moderationHistory: { type: [Decision], default: [], select: false },
    roleHistory: {
      type: [{
        _id: false,
        actor: { type: mongoose.Schema.Types.ObjectId, required: true },
        role: { type: String, enum: ['user', 'moderator'], required: true },
        at: { type: Date, required: true },
      }],
      select: false,
      default: [],
    },
    passwordResetTokenHash: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
