const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['in_review', 'resolved'], required: true },
  note: { type: String, maxlength: 500, default: '' },
  at: { type: Date, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  type: { type: String, enum: ['message', 'profile', 'photo'], required: true },
  target: { type: mongoose.Schema.Types.ObjectId, required: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, required: true },
  reportedUser: { type: mongoose.Schema.Types.ObjectId, required: true },
  photo: { type: String, default: null },
  reason: { type: String, required: true, maxlength: 300 },
  priority: { type: Number, enum: [1, 2, 3], default: 2 },
  status: { type: String, enum: ['pending', 'in_review', 'resolved'], default: 'pending' },
  audit: { type: [auditSchema], default: [] },
}, { timestamps: true });

schema.index({ reporter: 1, type: 1, target: 1, photo: 1 }, { unique: true });
schema.index({ status: 1, priority: -1, _id: -1 });

module.exports = mongoose.model('Report', schema);
