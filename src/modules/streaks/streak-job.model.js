const mongoose = require('mongoose');

const streakJobSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    lastProcessedDate: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StreakJob', streakJobSchema);
