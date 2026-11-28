const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    dateEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DateInvitation',
      required: true,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'La calificación debe ser un entero del 1 al 5',
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    status: {
      type: String,
      enum: ['hidden', 'published'],
      default: 'hidden',
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ dateEvent: 1, author: 1 }, { unique: true });
reviewSchema.index({ subject: 1, status: 1, publishedAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
