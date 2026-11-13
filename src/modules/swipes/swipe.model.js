const mongoose = require('mongoose');

const swipeSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: ['like', 'pass'],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

swipeSchema.index({ from: 1, to: 1 }, { unique: true });
swipeSchema.index({ to: 1, action: 1 });

module.exports = mongoose.model('Swipe', swipeSchema);
