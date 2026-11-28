const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, required: true },
  state: { type: String, required: true },
  note: { type: String, maxlength: 300, default: '' },
  at: { type: Date, required: true },
}, { _id: false });
